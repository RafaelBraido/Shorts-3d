"""Montanhas da Judeia (Mediterrâneo -> Jerusalém -> Mar Morto): Sentinel-2 real + malha SRTM."""
import os, json, numpy as np
from PIL import Image
import build_maps as bm, build_sat_lib as bs
os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
_o = bs.scenes_for; bs.scenes_for = lambda t, maxn=8: _o(t, 5); bs.SC.clear()
ext = dict(lon0=34.60, lon1=35.80, lat0=31.30, lat1=32.10); W, H = 2800, 1870
bs.MASK = False; rgb, _, _ = bs.composite(ext, W, H, 2)
bs.MASK = True; rm, vm, water = bs.composite(ext, W, H, 2); rgb = np.where(vm[..., None], rm, rgb)
hs, e = bs.hs_mul(ext, W, H, 10, 1.0)
Image.fromarray(np.clip(bs.grade(rgb) * (1 + (hs[..., None] - 0.55) * 0.4), 0, 255).astype(np.uint8)).save("assets/site_color.jpg", quality=92, subsampling=0)
GW, GH = 480, 320
dem, ox, oy = bm.fetch_dem(ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], 10)
he = bm.resample_latlon(dem, ox, oy, 10, ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], GW + 1, GH + 1)
from scipy import ndimage as ndi
wm = np.asarray(Image.fromarray((water * 255).astype(np.uint8)).resize((GW + 1, GH + 1), Image.BILINEAR)) > 127
he = np.where(wm & (he < -300), -430.0, np.where(wm & (he < 30), 0.0, he))
he.astype("<f4").tofile("assets/site_height.bin")
json.dump({"site": {**ext, "w": W, "h": H, "gw": GW, "gh": GH}, "region": dict(lon0=22.0, lon1=47.0, lat0=24.0, lat1=43.0, w=2500, h=1900)}, open("assets/maps.json", "w"), indent=1); print("ok")
