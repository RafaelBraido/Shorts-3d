"""Mapa do Nilo: região (relevo + cor do Blue Marble) e dois sítios em imagem real Sentinel-2 (Gizé e Meroë) com malha de altura."""
import os, json, numpy as np
from PIL import Image
import build_maps as bm
import build_sat_lib as bs
os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
A = "assets"
_orig = bs.scenes_for
bs.scenes_for = lambda tile, maxn=8: _orig(tile, 3)   # deserto: poucas cenas bastam
bs.SC.clear(); bs.MASK = False
SITES = {"giza": dict(lon0=31.00, lon1=31.42, lat0=29.82, lat1=30.18, W=2000, H=2000),
         "meroe": dict(lon0=33.55, lon1=33.95, lat0=16.78, lat1=17.12, W=2100, H=1900)}
REG = dict(lon0=24.0, lon1=40.0, lat0=14.5, lat1=32.5)
meta = {"region": {**REG, "w": 2560, "h": 2880}}
if not os.environ.get("SKIP_REGION"):
  img, *_ = bm.colorize(**REG, w=2560, h=2880, z=7, water_seeds=[(32.9, 22.8)], sea_seeds=[(29.0, 32.3), (36.5, 20.0)], detail_zf=6.0)
  Image.fromarray(img).save(f"{A}/region_color.jpg", quality=92); print("regional ok", flush=True)
for k, S in SITES.items():
    ext = {x: S[x] for x in ("lon0", "lon1", "lat0", "lat1")}
    rgb, valid, _ = bs.composite(ext, S["W"], S["H"], 2)
    hs, e = bs.hs_mul(ext, S["W"], S["H"], 11, 1.0)
    x = rgb.astype(np.float32) / 255; x = np.clip((x - 0.03) / 0.92, 0, 1); out = x * 255 * (1 + (hs[..., None] - 0.55) * 0.35)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(f"{A}/{k}_color.jpg", quality=92, subsampling=0)
    GW = GH = 400
    dem, ox, oy = bm.fetch_dem(ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], 11)
    he = bm.resample_latlon(dem, ox, oy, 11, ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], GW + 1, GH + 1)
    he.astype("<f4").tofile(f"{A}/{k}_height.bin")
    meta[k] = {**ext, "w": S["W"], "h": S["H"], "gw": GW, "gh": GH}; print(k, "ok", float(valid.mean()), flush=True)
json.dump(meta, open(f"{A}/maps.json", "w"), indent=1); print("ok")
