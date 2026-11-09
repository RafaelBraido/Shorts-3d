import os, json
from PIL import Image
import build_maps as bm
R = dict(lon0=-76.0, lon1=-32.0, lat0=-36.0, lat1=8.0)
img, *_ = bm.colorize(**R, w=2560, h=2560, z=6, water_seeds=[], sea_seeds=[(-33.0, -20.0), (-36.0, 4.0)], detail_zf=5.0)
Image.fromarray(img).save("assets/region_color.jpg", quality=92)
json.dump({"region": {**R, "w": 2560, "h": 2560}}, open("assets/maps.json", "w"), indent=1); print("ok")
