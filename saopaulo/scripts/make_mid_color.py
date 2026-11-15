"""Terra do mosaico Sentinel-2 (nítida) + oceano/nuvens do mapa-base + relevo sombreado -> assets/mid_color.jpg"""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
import build_maps as bm, build_sat_lib as bs
name, lon0, lon1, lat0, lat1 = sys.argv[1], *map(float, sys.argv[2:6])
raw = np.asarray(Image.open(f"assets/{name}_raw.jpg").convert("RGB")).astype(np.float32); H, W, _ = raw.shape
cnt = np.load(f"assets/{name}_cnt.npy")
ext = dict(lon0=lon0, lon1=lon1, lat0=lat0, lat1=lat1)
r, g, b = raw[..., 0], raw[..., 1], raw[..., 2]; mx, mn = raw.max(-1), raw.min(-1); luma = raw.mean(-1)
cloud = ((mn > 165) & (mx - mn < 55)) | (luma > 215)
ocean = (b >= r - 2) & (luma < 110) & ((b - r) > -4) | (cnt == 0)
land = ~cloud & ~ocean & (cnt > 0)
land = ndi.binary_opening(land, iterations=2); land = ndi.binary_closing(land, iterations=3)
w = np.clip(ndi.gaussian_filter(land.astype(np.float32), 4) * 1.15 - 0.075, 0, 1)[..., None]        # máscara suave (borda da costa e nuvens)
base = bm.bm_sample(lon0, lon1, lat0, lat1, W, H)
base = base * 0.75 + np.array([6, 38, 92], np.float32) * 0.25                                      # oceano com o azul do globo
hs, e = bs.hs_mul(ext, W, H, 9, 1.0)
base_land = base                                                                                    # onde faltar terra, o mapa-base
col = bs.grade(raw) * (1 + (hs[..., None] - 0.55) * 0.55)
base = base * (1 + (hs[..., None] - 0.55) * 0.35)
out = col * w + base * (1 - w)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save("assets/mid_color.jpg", quality=92, subsampling=0)
m = json.load(open("assets/maps.json")); m["mid"] = {**ext, "w": W, "h": H}; json.dump(m, open("assets/maps.json", "w"), indent=1); print("ok", float(w.mean()))
