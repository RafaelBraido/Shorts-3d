"""Mosaico de imagem real Sentinel-2 L2A (10 m, AWS Open Data / Copernicus) para o vale Galileia–Mar Morto.
Gera: local_color.jpg (visão geral do vale), detail_color.jpg (zoom no lago), máscaras de água (SCL) e malha de altura (DEM z11)."""
import os, re, json, subprocess, numpy as np, rasterio, mgrs
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from PIL import Image
from scipy import ndimage as ndi
import build_maps as bm

os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
A = "assets"; B = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
LOC = dict(lon0=34.65, lon1=36.25, lat0=30.90, lat1=33.40)
DET = dict(lon0=35.28, lon1=35.96, lat0=32.58, lat1=33.10)
LW, LH = 3072, 4608
DW, DH = 3808, 2912

def scenes_for(tile, maxn=4):
    """Cenas (jun–ago/2024) do tile ordenadas pela cobertura de dados (bordas de órbita vêm pela metade)."""
    z, b, sq = tile[:2], tile[2], tile[3:]; cands = []
    for ym in ("2024/7", "2024/8", "2024/6"):
        x = subprocess.run(["curl", "-s", "-m", "30", f"{B}/?list-type=2&prefix=sentinel-s2-l2a-cogs/{z}/{b}/{sq}/{ym}/&delimiter=/"], capture_output=True, text=True).stdout
        cands += [p for p in re.findall(r"<Prefix>(sentinel-s2-l2a-cogs/[^<]*_L2A/)</Prefix>", x) if p.endswith("_0_L2A/")]
    scored = []
    for p in cands:
        try:
            with rasterio.open(f"/vsicurl/{B}/{p}TCI.tif") as d:
                a = d.read(out_shape=(3, d.height // 32, d.width // 32))
            scored.append((float((a.sum(0) > 0).mean()), p))
        except Exception: pass
    scored.sort(reverse=True)
    return [p for c, p in scored if c > 0.04][:maxn]

def tiles_for(ext):
    m = mgrs.MGRS(); s = set()
    for lat in np.linspace(ext["lat0"], ext["lat1"], 40):
        for lon in np.linspace(ext["lon0"], ext["lon1"], 24): s.add(m.toMGRS(lat, lon, MGRSPrecision=0))
    return sorted(s)

SC = {}
BAD = (0, 1, 3, 8, 9, 10, 11)   # sem dado, saturado, sombra, nuvem, cirro, neve

def composite(ext, W, H, factor):
    """Média por pixel das observações sem nuvem (máscara SCL + realce de branco) de várias cenas de verão."""
    dst_t = from_bounds(ext["lon0"], ext["lat0"], ext["lon1"], ext["lat1"], W, H)
    acc = np.zeros((3, H, W), np.float32); cnt = np.zeros((H, W), np.float32); wat = np.zeros((H, W), np.float32)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        for tile in tiles_for(ext):
            if tile not in SC: SC[tile] = scenes_for(tile, 8)
            for pre in SC[tile]:
                with rasterio.open(f"/vsicurl/{B}/{pre}TCI.tif") as d, rasterio.open(f"/vsicurl/{B}/{pre}SCL.tif") as ds:
                    sh = (d.height // factor, d.width // factor)
                    rgb = d.read(out_shape=(3, *sh), resampling=Resampling.average)
                    scl = ds.read(1, out_shape=sh, resampling=Resampling.nearest)
                    t = d.transform * d.transform.scale(factor, factor)
                    bad = np.isin(scl, BAD) | ((rgb.min(0) > 190) & (rgb.max(0) > 215))
                    bad = ndi.binary_dilation(bad, iterations=2)
                    good = ~bad & (rgb.sum(0) > 0)
                    kw = dict(src_transform=t, src_crs=d.crs, dst_transform=dst_t, dst_crs="EPSG:4326")
                    gv = np.zeros((H, W), np.uint8); reproject(good.astype(np.uint8), gv, resampling=Resampling.nearest, **kw)
                    wv = np.zeros((H, W), np.uint8); reproject(((scl == 6) & good).astype(np.uint8), wv, resampling=Resampling.nearest, **kw)
                    gm = gv > 0
                    for i in range(3):
                        tmp = np.zeros((H, W), np.uint8)
                        reproject(np.where(good, rgb[i], 0).astype(np.uint8), tmp, resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0, **kw)
                        acc[i] += np.where(gm, tmp, 0)
                    cnt += gm; wat += (wv > 0) & gm
                print(tile, pre.split("/")[-2], flush=True)
    rgb = (acc / np.maximum(cnt, 1)).transpose(1, 2, 0).astype(np.uint8)
    return rgb, cnt > 0, (wat / np.maximum(cnt, 1)) > 0.5

def grade(rgb):
    """Realce leve: contraste/saturação estilo mapa de satélite."""
    x = rgb.astype(np.float32) / 255
    x = np.clip((x - 0.02) / 0.86, 0, 1) ** 0.95
    g = x.mean(-1, keepdims=True); x = np.clip(g + (x - g) * 1.12, 0, 1)
    return x * 255

def hs_mul(ext, W, H, z, zf):
    dem, ox, oy = bm.fetch_dem(ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], z)
    e = bm.resample_latlon(dem, ox, oy, z, ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], W, H)
    midlat = np.radians((ext["lat0"] + ext["lat1"]) / 2)
    cx = (ext["lon1"] - ext["lon0"]) / W * 111320 * np.cos(midlat); cy = (ext["lat1"] - ext["lat0"]) / H * 110574
    return bm.hillshade(e, cx, cy, zf), e

def build(ext, W, H, factor, name, z, zf, gain):
    tci, valid, water = composite(ext, W, H, factor)
    water = ndi.binary_opening(ndi.binary_closing(water, iterations=2), iterations=1)
    hs, e = hs_mul(ext, W, H, z, zf)
    img = grade(tci) * (1 + (hs[..., None] - 0.55) * gain)
    # onde faltar imagem (bordas), usa o mapa sintético já gerado
    if not valid.all():
        syn = np.asarray(Image.open(f"{A}/local_syn.jpg").resize((W, H), Image.BILINEAR)).astype(np.float32) if os.path.exists(f"{A}/local_syn.jpg") else img
        img = np.where(valid[..., None], img, syn)
    # suaviza a margem da água (lago mais profundo no centro)
    wd = ndi.distance_transform_edt(water); k = np.clip(wd / (60 if W > 3500 else 25), 0, 1)[..., None]
    deep = np.array([8, 40, 88], np.float32)
    img = np.where(water[..., None], img * (1 - 0.45 * k) + deep * 0.45 * k, img)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(f"{A}/{name}_color.jpg", quality=90, subsampling=0)
    Image.fromarray((water * 255).astype(np.uint8)).save(f"{A}/{name}_water.png", optimize=True)
    return water

if __name__ == "__main__":
    if os.path.exists(f"{A}/local_color.jpg") and not os.path.exists(f"{A}/local_syn.jpg"):
        os.rename(f"{A}/local_color.jpg", f"{A}/local_syn.jpg")
    wl = build(LOC, LW, LH, 4, "local", 10, 1.4, 0.55)
    wd = build(DET, DW, DH, 2, "detail", 11, 1.2, 0.45)
    # malha de altura 801x1251 (≈200 m) do DEM z11; água achatada (Galileia −210 m, Mar Morto −430 m)
    GW, GH = 800, 1250
    dem, ox, oy = bm.fetch_dem(LOC["lon0"], LOC["lon1"], LOC["lat0"], LOC["lat1"], 11)
    he = bm.resample_latlon(dem, ox, oy, 11, LOC["lon0"], LOC["lon1"], LOC["lat0"], LOC["lat1"], GW + 1, GH + 1)
    wm = np.asarray(Image.fromarray((wl * 255).astype(np.uint8)).resize((GW + 1, GH + 1), Image.BILINEAR)) > 127
    lab, _ = ndi.label(wm)
    for l in range(1, lab.max() + 1):
        m = lab == l
        if m.sum() < 30: continue
        med = np.median(he[m]); he[m] = -430.0 if med < -300 else (-210.0 if med < -150 else min(med, 0))
    he.astype("<f4").tofile(f"{A}/local_height.bin")
    meta = json.load(open(f"{A}/maps.json"))
    meta["local"] = {**LOC, "w": LW, "h": LH, "gw": GW, "gh": GH}; meta["detail"] = {**DET, "w": DW, "h": DH}
    json.dump(meta, open(f"{A}/maps.json", "w"), indent=1)
    print("ok")
