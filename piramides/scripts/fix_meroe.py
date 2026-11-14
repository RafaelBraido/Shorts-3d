import os, numpy as np
from PIL import Image
import build_maps as bm, build_sat_lib as bs
os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
_o = bs.scenes_for; bs.scenes_for = lambda t, maxn=8: _o(t, 5); bs.SC.clear()
ext = dict(lon0=33.55, lon1=33.95, lat0=16.78, lat1=17.12); W, H = 2100, 1900
bs.MASK = True;  rgb_m, valid_m, _ = bs.composite(ext, W, H, 2)
bs.MASK = False; rgb_u, _, _ = bs.composite(ext, W, H, 2)
rgb = np.where(valid_m[..., None], rgb_m, rgb_u)
hs, e = bs.hs_mul(ext, W, H, 11, 1.0)
out = bs.grade(rgb) * (1 + (hs[..., None] - 0.55) * 0.35)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save("assets/meroe_color.jpg", quality=92, subsampling=0); print("ok", valid_m.mean())
