import sys, json, math, time; sys.path.insert(0,'scripts')
from ov_lib import *
import shapely.wkb as W
from shapely.geometry import mapping
O=(-50.155,-25.108); kx=111320*math.cos(math.radians(25.108)); ky=110574
def M(c): return [round((c[0]-O[0])*kx,1),round((c[1]-O[1])*ky,1)]
def poly(g,tol=0.4):
    g=g.simplify(tol/ky)
    gs=list(g.geoms) if g.geom_type.startswith("Multi") else [g]
    out=[]
    for p in gs:
        if p.geom_type!="Polygon": continue
        out.append([[M(c) for c in p.exterior.coords]]+[[M(c) for c in i.coords] for i in p.interiors])
    return out
D=(-50.168,-25.1195,-50.144,-25.095); t0=time.time()
# prédios
T=table("buildings","building",D,["geometry","height","num_floors","class","names","subtype","has_parts"]); print("buildings",T.num_rows,round(time.time()-t0))
B=[]
for r in T.to_pylist():
    g=W.loads(r["geometry"]); 
    for p in poly(g,0.5): B.append({"p":p,"h":r["height"],"f":r["num_floors"],"c":r["class"],"n":(r["names"] or {}).get("primary")})
# lugares
T=table("places","place",D,["geometry","names","basic_category","confidence"]); P=[]
for r in T.to_pylist():
    n=(r["names"] or {}).get("primary"); 
    if not n: continue
    g=W.loads(r["geometry"]); P.append({"n":n,"c":r["basic_category"],"xy":M((g.x,g.y)),"cf":r["confidence"]})
print("places",len(P))
# base
Bs={}
for typ in ["land_use","land","water","infrastructure"]:
    try:
        T=table("base",typ,D,["geometry","subtype","class","names"]); rows=[]
        for r in T.to_pylist():
            g=W.loads(r["geometry"])
            if g.geom_type in ("Polygon","MultiPolygon"): rows.append({"s":r["subtype"],"c":r["class"],"p":poly(g,1.5)})
            elif g.geom_type in ("LineString","MultiLineString"): gs=list(g.geoms) if g.geom_type.startswith("Multi") else [g]; rows.append({"s":r["subtype"],"c":r["class"],"l":[[M(c) for c in x.coords] for x in gs]})
            elif g.geom_type=="Point": rows.append({"s":r["subtype"],"c":r["class"],"xy":M((g.x,g.y)),"n":(r["names"] or {}).get("primary")})
        Bs[typ]=rows; print(typ,len(rows))
    except Exception as e: print(typ,"erro",str(e)[:80])
# vias (detalhe)
T=table("transportation","segment",D,["geometry","names","class","subtype","subclass","road_flags","road_surface"]); R=[]
for r in T.to_pylist():
    g=W.loads(r["geometry"]); gs=list(g.geoms) if g.geom_type.startswith("Multi") else [g]
    for x in gs: R.append({"l":[M(c) for c in x.simplify(0.3/ky).coords],"c":r["class"],"t":r["subtype"],"s":r["subclass"],"n":(r["names"] or {}).get("primary"),"fl":[f["values"] for f in (r["road_flags"] or [])] if r["road_flags"] else None})
print("roads",len(R),round(time.time()-t0))
json.dump({"B":B,"P":P,"Bs":Bs,"R":R},open("data/detail.json","w"),separators=(",",":"))
# cidade (zoom out): vias principais + água
C=(-50.30,-25.19,-50.02,-25.00)
T=table("transportation","segment",C,["geometry","class","subtype","names"]); CR=[]
keep={"motorway","trunk","primary","secondary","tertiary","residential","unclassified","living_street"}
for r in T.to_pylist():
    if r["subtype"]!="road" or r["class"] not in keep: continue
    g=W.loads(r["geometry"]); gs=list(g.geoms) if g.geom_type.startswith("Multi") else [g]
    for x in gs: CR.append({"l":[M(c) for c in x.simplify(2.0/ky).coords],"c":r["class"],"n":(r["names"] or {}).get("primary") if r["class"] in ("motorway","trunk","primary","secondary") else None})
print("city roads",len(CR),round(time.time()-t0))
W2=table("base","water",C,["geometry","subtype","class"]); WW=[]
for r in W2.to_pylist():
    g=W.loads(r["geometry"])
    if g.geom_type in ("Polygon","MultiPolygon"): WW.append({"p":poly(g,3)})
    else: gs=list(g.geoms) if g.geom_type.startswith("Multi") else [g]; WW.append({"l":[[M(c) for c in x.simplify(3/ky).coords] for x in gs]})
LU=table("base","land_use",C,["geometry","subtype","class"]); LL=[]
for r in LU.to_pylist():
    if r["subtype"] in ("park","recreation","protected","agriculture","residential","horticulture") or r["class"] in ("park","forest","grass","golf_course","cemetery"):
        g=W.loads(r["geometry"]); 
        if g.geom_type in ("Polygon","MultiPolygon"): LL.append({"s":r["subtype"],"c":r["class"],"p":poly(g,4)})
print("water",len(WW),"landuse",len(LL),round(time.time()-t0))
json.dump({"R":CR,"W":WW,"LU":LL},open("data/city.json","w"),separators=(",",":"))
