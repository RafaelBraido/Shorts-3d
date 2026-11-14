"""Grande São Paulo em imagem real Sentinel-2 (estação seca) + malha de altura SRTM."""
import os, json, numpy as np
from PIL import Image
import build_maps as bm, build_sat_lib as bs
os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
_o = bs.scenes_for; bs.scenes_for = lambda t, maxn=8: _o(t, 6); bs.SC.clear()
ext = dict(lon0=-47.05, lon1=-46.15, lat0=-24.05, lat1=-23.25); W, H = 2400, 2130
bs.MASK = False; rgb, _, _ = bs.composite(ext, W, H, 2)
bs.MASK = True; rm, vm, _ = bs.composite(ext, W, H, 2); rgb = np.where(vm[..., None], rm, rgb)
hs, e = bs.hs_mul(ext, W, H, 10, 1.0)
Image.fromarray(np.clip(bs.grade(rgb) * (1 + (hs[..., None] - 0.55) * 0.4), 0, 255).astype(np.uint8)).save("assets/site_color.jpg", quality=92, subsampling=0)
GW, GH = 360, 320
dem, ox, oy = bm.fetch_dem(ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], 10)
bm.resample_latlon(dem, ox, oy, 10, ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], GW + 1, GH + 1).astype("<f4").tofile("assets/site_height.bin")
json.dump({"site": {**ext, "w": W, "h": H, "gw": GW, "gh": GH}, "region": dict(lon0=-76.0, lon1=-32.0, lat0=-36.0, lat1=8.0, w=2560, h=2560)}, open("assets/maps.json", "w"), indent=1); print("ok")
