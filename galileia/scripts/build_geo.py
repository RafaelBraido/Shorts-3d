"""Contornos dos lagos (da máscara de água) e curso aproximado do rio Jordão (fundo do vale no DEM)."""
import json, math, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure
import build_maps as bm  # reutiliza o cache de tiles

meta = json.load(open("assets/maps.json"))["local"]
lon0, lon1, lat0, lat1, W, H = (meta[k] for k in ("lon0", "lon1", "lat0", "lat1", "w", "h"))
water = np.asarray(Image.open("assets/local_water.png")) > 127
lab, _ = ndi.label(water)
def px(lon, lat): return int((lon - lon0) / (lon1 - lon0) * (W - 1)), int((lat1 - lat) / (lat1 - lat0) * (H - 1))
def outline(seed, step=4):
    x, y = px(*seed); m = lab == lab[y, x]
    c = max(measure.find_contours(ndi.binary_fill_holes(m).astype(float), 0.5), key=len)
    c = measure.approximate_polygon(c, 1.2)
    return [[round(lon0 + (p[1] / (W - 1)) * (lon1 - lon0), 5), round(lat1 - (p[0] / (H - 1)) * (lat1 - lat0), 5)] for p in c]
geo = {"galilee": outline((35.59, 32.82)), "deadsea": outline((35.48, 31.55))}

# Jordão: segue o ponto mais baixo do vale perto de uma trilha guia
dem_raw, ox, oy = bm.fetch_dem(lon0, lon1, lat0, lat1, 10)
guide = [(33.25, 35.65), (33.10, 35.61), (33.01, 35.62), (32.915, 35.62)]
south = [(32.70, 35.57), (32.50, 35.55), (32.30, 35.54), (32.10, 35.55), (31.88, 35.55), (31.78, 35.545)]
def valley(g0, g1, lons0, lons1, win=0.05):
    out = []
    for lat in np.arange(g0, g1, -0.02 if g0 > g1 else 0.02):
        t = (lat - g0) / (g1 - g0)
        lon_c = lons0 + (lons1 - lons0) * t
        lons = np.linspace(lon_c - win, lon_c + win, 60)
        e = bm.resample_latlon(dem_raw, ox, oy, 10, lon_c - win, lon_c + win, lat - 0.001, lat + 0.001, 60, 3).mean(0)
        e = ndi.uniform_filter1d(e, 5)
        out.append((lat, float(lons[int(np.argmin(e))])))
    return out
# trechos norte e sul (lon guia interpolada linearmente)
north = valley(33.22, 32.93, 35.64, 35.62)
sth = valley(32.68, 31.80, 35.57, 35.54)
def smooth(pts, k=3):
    la = ndi.uniform_filter1d(np.array([p[0] for p in pts]), k, mode="nearest"); lo = ndi.uniform_filter1d(np.array([p[1] for p in pts]), k, mode="nearest")
    return [(float(a), float(b)) for a, b in zip(la, lo)]
path = smooth(north) + [(32.915, 35.62), (32.82, 35.60), (32.70, 35.572)] + smooth(sth) + [(31.77, 35.545)]
geo["jordan"] = [[round(a, 5), round(b, 5)] for a, b in path]
json.dump(geo, open("assets/geo.json", "w"))
print({k: len(v) for k, v in geo.items()}, geo["jordan"][:3], geo["jordan"][-3:])
