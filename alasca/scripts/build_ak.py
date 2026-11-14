import json
from PIL import Image
import build_maps as bm
R = dict(lon0=-172.0, lon1=-124.0, lat0=48.0, lat1=76.0)
img, *_ = bm.colorize(**R, w=2400, h=1400, z=6, water_seeds=[], sea_seeds=[], detail_zf=3.0)
Image.fromarray(img).save("assets/region_color.jpg", quality=92)
json.dump({"region": {**R, "w": 2400, "h": 1400}}, open("assets/maps.json", "w"), indent=1); print("ok")
