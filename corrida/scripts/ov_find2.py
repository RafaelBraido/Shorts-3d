import sys,json; sys.path.insert(0,'scripts')
from ov_lib import *
import shapely.wkb as W
b=(-50.26,-25.18,-50.03,-25.03)
T=table("places","place",b,["names","basic_category","bbox","geometry"])
keys=["calazans","campo de instru","uepg","universidade estadual de ponta grossa","hospital regional","terminal central","tropeiros","parque ambiental","daju","muffato","pery passos","uvaranas"]
for r in T.to_pylist():
    n=((r["names"] or {}).get("primary") or ""); l=n.lower()
    if any(k in l for k in keys):
        g=W.loads(r["geometry"]); print(n,"|",r["basic_category"],"|",round(g.x,5),round(g.y,5))
