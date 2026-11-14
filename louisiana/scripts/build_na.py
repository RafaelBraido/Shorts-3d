import json
from PIL import Image
import build_maps as bm
R = dict(lon0=-132.0, lon1=-60.0, lat0=20.0, lat1=54.0)
img, *_ = bm.colorize(**R, w=2700, h=1275, z=6, water_seeds=[], sea_seeds=[], detail_zf=3.0)
Image.fromarray(img).save("assets/region_color.jpg", quality=92)
json.dump({"region": {**R, "w": 2700, "h": 1275}}, open("assets/maps.json", "w"), indent=1); print("ok")
