"""Baixa tiles de elevação (Terrarium/AWS Open Data), reprojeta p/ grade lat-lon e gera as texturas do mapa.
Saídas em assets/: local_color.jpg, local_water.png, local_height.bin, region_color.jpg, maps.json"""
import math, os, subprocess, json, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

TILES = os.environ.get("TILE_DIR", "/tmp/tiles"); os.makedirs(TILES, exist_ok=True)
A = "assets"

def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def fetch_dem(lon0, lon1, lat0, lat1, z):
    """Retorna (dem[m], x0, y0) em pixels Web-Mercator globais de zoom z."""
    xa, ya = lonlat_to_tile(lon0, lat1, z); xb, yb = lonlat_to_tile(lon1, lat0, z)
    tx0, tx1, ty0, ty1 = int(xa) - 1, int(xb) + 1, int(ya) - 1, int(yb) + 1
    urls = []
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            p = f"{TILES}/{z}_{tx}_{ty}.png"
            if not os.path.exists(p) or os.path.getsize(p) < 100:
                urls.append((p, f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png"))
    open(f"{TILES}/list.txt", "w").write("\n".join(f"{p} {u}" for p, u in urls))
    if urls:
        subprocess.run(f"cat {TILES}/list.txt | xargs -P 12 -L1 sh -c 'curl -sS -m 60 --retry 3 -o $0 $1'", shell=True, check=True)
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    dem = np.zeros((H, W), np.float32)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            im = np.asarray(Image.open(f"{TILES}/{z}_{tx}_{ty}.png").convert("RGB")).astype(np.float32)
            e = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
            dem[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = e
    return dem, tx0 * 256, ty0 * 256

def resample_latlon(dem, ox, oy, z, lon0, lon1, lat0, lat1, w, h):
    lons = np.linspace(lon0, lon1, w); lats = np.linspace(lat1, lat0, h)  # topo -> base
    n = 2 ** z * 256
    px = (lons + 180) / 360 * n - ox
    py = (1 - np.arcsinh(np.tan(np.radians(lats))) / math.pi) / 2 * n - oy
    X, Y = np.meshgrid(px, py)
    return ndi.map_coordinates(dem, [Y, X], order=1, mode="nearest")

def hillshade(e, cell_m_x, cell_m_y, zf=1.0, az=315, alt=38):
    gy, gx = np.gradient(e * zf, cell_m_y, cell_m_x)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    azr, altr = np.radians(az), np.radians(alt)
    hs = np.sin(altr) * np.cos(slope) + np.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return np.clip(hs, 0, 1)

def bm_sample(lon0, lon1, lat0, lat1, w, h):
    bm = np.asarray(Image.open(f"{A}/earth_day.jpg").convert("RGB")).astype(np.float32)
    H, W, _ = bm.shape
    lons = np.linspace(lon0, lon1, w); lats = np.linspace(lat1, lat0, h)
    X, Y = np.meshgrid((lons + 180) / 360 * W - .5, (90 - lats) / 180 * H - .5)
    return np.stack([ndi.map_coordinates(bm[..., c], [Y, X], order=1, mode="nearest") for c in range(3)], -1)

def smooth_noise(h, w, scale, seed):
    r = np.random.default_rng(seed).standard_normal((h, w)).astype(np.float32)
    return ndi.gaussian_filter(r, scale) * scale

def grow(mask_ok, seeds, shape_lonlat, lon0, lon1, lat0, lat1):
    lab, _ = ndi.label(mask_ok)
    h, w = mask_ok.shape; out = np.zeros_like(mask_ok)
    for lon, lat in seeds:
        x = int((lon - lon0) / (lon1 - lon0) * (w - 1)); y = int((lat1 - lat) / (lat1 - lat0) * (h - 1))
        if lab[y, x]: out |= lab == lab[y, x]
    return out

def colorize(lon0, lon1, lat0, lat1, w, h, z, water_seeds, sea_seeds, detail_zf, sat=1.0):
    dem_raw, ox, oy = fetch_dem(lon0, lon1, lat0, lat1, z)
    e = resample_latlon(dem_raw, ox, oy, z, lon0, lon1, lat0, lat1, w, h)
    midlat = math.radians((lat0 + lat1) / 2)
    cx = (lon1 - lon0) / w * 111320 * math.cos(midlat); cy = (lat1 - lat0) / h * 110574
    hs = hillshade(e, cx, cy, detail_zf)
    base = bm_sample(lon0, lon1, lat0, lat1, w, h)
    if z >= 9:
        g0 = base.mean(-1, keepdims=True); base = g0 + (base - g0) * 0.55
        latg = np.linspace(lat1, lat0, h)[:, None]
        grn = np.clip((latg - 31.7) / 1.3, 0, 1) * np.clip(1 - np.maximum(e, 0) / 1100, 0, 1) * 0.45
        base = base * (1 - grn[..., None]) + np.array([92, 112, 62], np.float32) * grn[..., None]
    # água: lagos (superfície plana) e mar
    sea = grow(e <= 0.5, sea_seeds, None, lon0, lon1, lat0, lat1) if sea_seeds else np.zeros_like(e, bool)
    lakes = np.zeros_like(e, bool)
    for lon, lat in water_seeds:
        x = int((lon - lon0) / (lon1 - lon0) * (w - 1)); y = int((lat1 - lat) / (lat1 - lat0) * (h - 1))
        lvl = np.median(e[y - 2:y + 3, x - 2:x + 3])
        ok = (e < -402) if lvl < -300 else (np.abs(e - lvl) < 4.0)
        lakes |= grow(ok, [(lon, lat)], None, lon0, lon1, lat0, lat1)
    water = lakes | sea
    # terra: cor base de satélite + relevo
    lum = (hs - 0.6) * 1.15
    land = base * (1 + lum[..., None] * 0.9)
    gr = smooth_noise(h, w, 2, 3)[..., None] * 0.9
    land = land + gr * 6
    # realce por altitude: topo mais claro/seco, vales mais verdes
    t = np.clip((e - 0) / 1000, 0, 1)[..., None]
    land = land * (1 - 0.10 * t) + np.array([150, 130, 100]) * 0.10 * t
    land = np.where((e < 0)[..., None] & ~water[..., None], land * np.array([0.92, 1.0, 0.85]) , land)
    # água com profundidade (dist. da margem)
    wd = ndi.distance_transform_edt(water)
    depth = np.clip(wd / (40 if z >= 9 else 12), 0, 1)[..., None]
    shallow = np.array([40, 125, 150], np.float32); deep = np.array([6, 38, 92], np.float32)
    wc = shallow * (1 - depth) + deep * depth
    wc = wc * (0.9 + 0.2 * hs[..., None])
    if sea_seeds:  # mar aberto: cor do globo + batimetria
        bathy = np.clip(-e / 1500, 0, 1)[..., None]
        sea_col = (base * 0.65 + np.array([8, 40, 95]) * 0.35) * (1 - 0.35 * bathy) + 4
        wc = np.where(sea[..., None], sea_col * (0.92 + 0.12 * hs[..., None]), wc)
    img = np.where(water[..., None], wc, land)
    if sat != 1:
        g = img.mean(-1, keepdims=True); img = g + (img - g) * sat
    return np.clip(img, 0, 255).astype(np.uint8), water, e, sea

if __name__ == "__main__":
    meta = {}
    # --- LOCAL: Galileia -> Jordão -> Mar Morto
    L = dict(lon0=34.65, lon1=36.25, lat0=30.90, lat1=33.40)
    W, H = 1536, 2400
    img, water, e, sea = colorize(**L, w=W, h=H, z=10, water_seeds=[(35.59, 32.82), (35.48, 31.55), (35.55, 31.35)], sea_seeds=[(34.72, 32.55)], detail_zf=2.2)
    Image.fromarray(img).save(f"{A}/local_color.jpg", quality=92)
    Image.fromarray((water * 255).astype(np.uint8)).save(f"{A}/local_water.png")
    # malha de altura (m) na resolução da malha
    gw, gh = 384, 600
    dem_raw, ox, oy = fetch_dem(L["lon0"], L["lon1"], L["lat0"], L["lat1"], 10)
    he = resample_latlon(dem_raw, ox, oy, 10, L["lon0"], L["lon1"], L["lat0"], L["lat1"], gw + 1, gh + 1)
    # achata a água na cota da superfície (Galileia ~ -209 m)
    wm = np.asarray(Image.fromarray((water * 255).astype(np.uint8)).resize((gw + 1, gh + 1), Image.BILINEAR)) > 127
    he = np.where(wm, np.where(he < -300, -430.0, -210.0), he)
    he.astype("<f4").tofile(f"{A}/local_height.bin")
    # estatísticas reais p/ conferência
    ys, xs = np.where(water & (np.abs(e + 209) < 12))
    print("nível mediano do lago (m):", float(np.median(e[water & (e > -300) & (e < -150)])) if (water & (e > -300) & (e < -150)).any() else None)
    print("Mar Morto (m):", float(np.median(e[water & (e < -350)])) if (water & (e < -350)).any() else None)
    meta["local"] = {**L, "w": W, "h": H, "gw": gw, "gh": gh}
    # --- REGIONAL: Mediterrâneo oriental / Oriente Médio
    R = dict(lon0=22.0, lon1=47.0, lat0=24.0, lat1=43.0)
    img, *_ = colorize(**R, w=2500, h=1900, z=7, water_seeds=[(35.59, 32.82), (35.5, 31.5)], sea_seeds=[(30.0, 34.0), (38.0, 36.0)], detail_zf=6.0)
    Image.fromarray(img).save(f"{A}/region_color.jpg", quality=90)
    meta["region"] = {**R, "w": 2500, "h": 1900}
    json.dump(meta, open(f"{A}/maps.json", "w"), indent=1)
