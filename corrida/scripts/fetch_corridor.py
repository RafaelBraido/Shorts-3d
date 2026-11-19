import sys, json, math, time; sys.path.insert(0,'scripts')
from ov_lib import *
import shapely.wkb as W
from shapely.geometry import LineString, Point, box
R0=json.load(open("data/route21.json")); O=R0["origin"]; kx=111320*math.cos(math.radians(25.108)); ky=110574
M=lambda c:[round((c[0]-O[0])*kx,1),round((c[1]-O[1])*ky,1)]
rt=[M(c) for c in R0["route"][:len(R0["route"])//2+1]]            # só a ida (a volta é a mesma via)
line=LineString(rt); BUF=480; buf=line.buffer(BUF)
# janelas de ~1,4 km ao longo da ida
wins=[]; L=line.length; s=0
while s<L:
    seg=[line.interpolate(x) for x in [s,min(s+1400,L)]]; xs=[p.x for p in seg]; ys=[p.y for p in seg]
    mid=line.interpolate(min(s+700,L)); wins.append((min(xs)-BUF-30,min(ys)-BUF-30,max(xs)+BUF+30,max(ys)+BUF+30)); s+=1400
inv=lambda x,y:(O[0]+x/kx,O[1]+y/ky)
print(len(wins),"janelas, ida",round(L),"m"); t0=time.time()
def simp(g,tol):
    g=g.simplify(tol/ky); gs=list(g.geoms) if g.geom_type.startswith("Multi") else [g]
    return [[[M(c) for c in p.exterior.coords]]+[[M(c) for c in i.coords] for i in p.interiors] for p in gs if p.geom_type=="Polygon"]
B=[];P=[];R=[];Bs={"land_use":[],"water":[],"infrastructure":[],"land":[]}; seenB=set();seenR=set();seenP=set()
for wi,(x0,y0,x1,y1) in enumerate(wins):
    lo=inv(x0,y0); hi=inv(x1,y1); bb=(lo[0],lo[1],hi[0],hi[1])
    T=table("buildings","building",bb,["geometry","height","num_floors","class","names"])
    for r in T.to_pylist():
        g=W.loads(r["geometry"]); c=g.centroid; cm=M((c.x,c.y))
        if not buf.contains(Point(cm)): continue
        key=(round(cm[0],1),round(cm[1],1))
        if key in seenB: continue
        seenB.add(key)
        for p in simp(g,0.5): B.append({"p":p,"h":r["height"],"f":r["num_floors"],"c":r["class"],"n":(r["names"] or {}).get("primary")})
    T=table("places","place",bb,["geometry","names","basic_category","confidence"])
    for r in T.to_pylist():
        n=(r["names"] or {}).get("primary"); g=W.loads(r["geometry"])
        if not n: continue
        xy=M((g.x,g.y)); 
        if buf.contains(Point(xy)) and (n,tuple(xy)) not in seenP: seenP.add((n,tuple(xy))); P.append({"n":n,"c":r["basic_category"],"xy":xy,"cf":r["confidence"]})
    for typ in ["land_use","water","infrastructure","land"]:
        try:
            T=table("base",typ,bb,["geometry","subtype","class","names"])
            for r in T.to_pylist():
                g=W.loads(r["geometry"]); 
                if not box(x0,y0,x1,y1).intersects(Point(0,0).buffer(1e9)): pass
                if g.geom_type in ("Polygon","MultiPolygon"):
                    pl=simp(g,1.5)
                    if pl: Bs[typ].append({"s":r["subtype"],"c":r["class"],"p":pl,"id":hash(str(pl[0][0][:3]))})
        except Exception as e: pass
    T=table("transportation","segment",bb,["geometry","names","class","subtype","subclass"])
    for r in T.to_pylist():
        g=W.loads(r["geometry"]); gs=list(g.geoms) if g.geom_type.startswith("Multi") else [g]
        for x in gs:
            l=[M(c) for c in x.simplify(0.3/ky).coords]
            k=(round(l[0][0]),round(l[0][1]),round(l[-1][0]),round(l[-1][1]),r["class"])
            if k in seenR or not buf.intersects(LineString(l)): continue
            seenR.add(k); R.append({"l":l,"c":r["class"],"t":r["subtype"],"s":r["subclass"],"n":(r["names"] or {}).get("primary")})
    print("janela",wi+1,"/",len(wins),"B",len(B),"R",len(R),"P",len(P),round(time.time()-t0),"s",flush=True)
# remove polígonos base duplicados (mesmo id)
for k in Bs:
    seen=set(); out=[]
    for r in Bs[k]:
        if r["id"] in seen: continue
        seen.add(r["id"]); out.append(r)
    Bs[k]=out
json.dump({"B":B,"P":P,"Bs":Bs,"R":R},open("data/detail21.json","w"),separators=(",",":"))
print("ok",len(B),"prédios",len(R),"trechos")
