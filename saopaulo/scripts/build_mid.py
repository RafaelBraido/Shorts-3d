"""Camada intermediária: mosaico Sentinel-2 em escala média (overview do COG) com mediana de 3 datas (remove nuvens sem precisar de máscara).
Uso: python3 scripts/build_mid.py lon0 lon1 lat0 lat1 largura_px nome [fator_overview=16]"""
import os, re, sys, subprocess, json, time, numpy as np, rasterio, mgrs
from concurrent.futures import ThreadPoolExecutor
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from PIL import Image
os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
B = "https://sentinel-cogs.s3.us-west-2.amazonaws.com"
lon0, lon1, lat0, lat1, W, name = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
FAC = int(sys.argv[7]) if len(sys.argv) > 7 else 16
H = int(W * (lat1 - lat0) / ((lon1 - lon0) * np.cos(np.radians((lat0 + lat1) / 2))))
dst_t = from_bounds(lon0, lat0, lon1, lat1, W, H)
m = mgrs.MGRS(); tiles = set()
for la in np.linspace(lat0, lat1, int((lat1 - lat0) * 5) + 3):
    for lo in np.linspace(lon0, lon1, int((lon1 - lon0) * 5) + 3): tiles.add(m.toMGRS(la, lo, MGRSPrecision=0))
tiles = sorted(tiles); print(len(tiles), "tiles;", W, "x", H, flush=True)
def scenes(tile):
    z, b, sq = tile[:2], tile[2], tile[3:]; out = []
    for ym in ("2024/6", "2024/7", "2024/8", "2024/9"):
        x = subprocess.run(["curl", "-s", "-m", "30", f"{B}/?list-type=2&prefix=sentinel-s2-l2a-cogs/{z}/{b}/{sq}/{ym}/&delimiter=/"], capture_output=True, text=True).stdout
        out += [p for p in re.findall(r"<Prefix>(sentinel-s2-l2a-cogs/[^<]*_L2A/)</Prefix>", x) if p.endswith("_0_L2A/")]
    return out[::max(1, len(out) // 16)][:16]
dx = (lon1 - lon0) / W; dy = (lat1 - lat0) / H
def read(job):
    tile, pre = job
    try:
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2"):
            with rasterio.open(f"/vsicurl/{B}/{pre}TCI.tif") as d:
                wl, ws, we, wn = rasterio.warp.transform_bounds(d.crs, "EPSG:4326", *d.bounds)
                c0, c1 = max(int((wl - lon0) / dx) - 1, 0), min(int((we - lon0) / dx) + 2, W); r0, r1 = max(int((lat1 - wn) / dy) - 1, 0), min(int((lat1 - ws) / dy) + 2, H)
                if c1 <= c0 or r1 <= r0: return None
                arr = d.read(out_shape=(3, d.height // FAC, d.width // FAC), resampling=Resampling.average); t = d.transform * d.transform.scale(FAC, FAC)
                wt = from_bounds(lon0 + c0 * dx, lat1 - r1 * dy, lon0 + c1 * dx, lat1 - r0 * dy, c1 - c0, r1 - r0)
                out = np.zeros((3, r1 - r0, c1 - c0), np.uint8)
                for i in range(3):
                    reproject(arr[i], out[i], src_transform=t, src_crs=d.crs, dst_transform=wt, dst_crs="EPSG:4326", resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0)
                return (r0, r1, c0, c1, out)
    except Exception as e:
        print("falha", pre.split("/")[-2], str(e)[:60], flush=True); return None
import rasterio.warp
t0 = time.time()
with ThreadPoolExecutor(8) as ex: sc = list(ex.map(scenes, tiles))
jobs = [(t, p) for t, ps in zip(tiles, sc) for p in ps]; print(len(jobs), "leituras;", round(time.time() - t0), "s listagem", flush=True)
K = 20; layers = np.zeros((K, 3, H, W), np.uint8); cnt = np.zeros((H, W), np.uint8)
with ThreadPoolExecutor(6) as ex:
    for i, r in enumerate(ex.map(read, jobs)):
        if r is not None:
            r0, r1, c0, c1, o = r; v = o.sum(0) > 0; cw = cnt[r0:r1, c0:c1]
            for k in range(K):
                sel = v & (cw == k)
                if sel.any():
                    for ch in range(3): layers[k, ch, r0:r1, c0:c1][sel] = o[ch][sel]
            cnt[r0:r1, c0:c1] = np.minimum(cw + v, K)
        if i % 40 == 0: print(i, "/", len(jobs), round(time.time() - t0), "s", flush=True)
img = np.zeros((H, W, 3), np.uint8); RB = 250
for r in range(0, H, RB):
    x = layers[:, :, r:r + RB, :].astype(np.float32); c = cnt[r:r + RB]
    x = np.where((np.arange(K)[:, None, None] >= c[None])[:, None], np.nan, x)
    with np.errstate(all="ignore"): med = np.nanpercentile(x, 30, axis=0)
    img[r:r + RB] = np.nan_to_num(med, nan=0).transpose(1, 2, 0).astype(np.uint8)
Image.fromarray(img).save(f"assets/{name}_raw.jpg", quality=93)
np.save(f"assets/{name}_cnt.npy", cnt); print("ok", round(time.time() - t0), "s; sem dado:", float((cnt == 0).mean()))
