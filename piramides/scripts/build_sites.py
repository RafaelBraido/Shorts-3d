"""Gizé e Meroë: 80 km de imagem real Sentinel-2 (média de cenas de verão) + malha de altura SRTM."""
import os, json, numpy as np
from PIL import Image
import build_maps as bm, build_sat_lib as bs
os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
_o = bs.scenes_for; bs.scenes_for = lambda t, maxn=8: _o(t, 4); bs.SC.clear()
SITES = {"giza": (dict(lon0=30.75, lon1=31.55, lat0=29.60, lat1=30.40), False), "meroe": (dict(lon0=33.35, lon1=34.15, lat0=16.55, lat1=17.35), True)}
W = H = 2400; meta = json.load(open("assets/maps.json"))
for k, (ext, masked) in SITES.items():
    bs.MASK = False; rgb, _, _ = bs.composite(ext, W, H, 2)
    if masked:   # Meroë: a média sem máscara fica lavada por poeira; usa a máscara e preenche os buracos
        bs.MASK = True; rm, vm, _ = bs.composite(ext, W, H, 2); rgb = np.where(vm[..., None], rm, rgb)
    hs, e = bs.hs_mul(ext, W, H, 10, 1.0)
    x = bs.grade(rgb) if masked else np.clip((rgb.astype(np.float32) / 255 - 0.03) / 0.92, 0, 1) * 255
    Image.fromarray(np.clip(x * (1 + (hs[..., None] - 0.55) * 0.35), 0, 255).astype(np.uint8)).save(f"assets/{k}_color.jpg", quality=92, subsampling=0)
    GW = GH = 400; dem, ox, oy = bm.fetch_dem(ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], 10)
    bm.resample_latlon(dem, ox, oy, 10, ext["lon0"], ext["lon1"], ext["lat0"], ext["lat1"], GW + 1, GH + 1).astype("<f4").tofile(f"assets/{k}_height.bin")
    meta[k] = {**ext, "w": W, "h": H, "gw": GW, "gh": GH}; print(k, "ok", flush=True)
json.dump(meta, open("assets/maps.json", "w"), indent=1); print("ok")
