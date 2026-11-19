import pickle, shapely.wkb as W, networkx as nx, json, math
rows=pickle.load(open("data/seg_big.pkl","rb"))
O=(-50.155,-25.108); kx=111320*math.cos(math.radians(25.108)); ky=110574
m=lambda lon,lat:((lon-O[0])*kx,(lat-O[1])*ky)
MULT={"primary":.9,"secondary":.9,"tertiary":1.0,"residential":1.15,"unclassified":1.2,"living_street":1.4,"service":3.0}
G=nx.Graph()
for nm,c,t,sc,g in rows:
    if t!="road" or c in ("footway","path","steps","cycleway","pedestrian","track","bridleway","parking_aisle"): continue
    co=list(W.loads(g).coords); a=tuple(round(v,6) for v in co[0]); b=tuple(round(v,6) for v in co[-1])
    L=sum(math.dist(m(*co[i]),m(*co[i+1])) for i in range(len(co)-1))
    if G.has_edge(a,b) and G[a][b]["L"]<=L: continue
    G.add_edge(a,b,L=L,w=L*MULT.get(c,2.5),coords=co,n=(nm or {}).get("primary"))
BIG=max(nx.connected_components(G),key=len)
def snap(p): return min(BIG,key=lambda q:math.dist(m(*q),m(*p)))
WP={"start":(-50.153125,-25.111533),"muffato":(-50.15833,-25.10611),"tropeiros":(-50.15832,-25.10377),"daju":(-50.15516,-25.09976),"terminal":(-50.15512,-25.09415),
    "loopNE":(-50.1523,-25.0947),"loopSE":(-50.1531,-25.0975)}
def snap_named(p,sub,maxd=120):
    c=[(math.dist(m(*q),m(*p)),q) for q in BIG if any(sub in (G[q][nb]["n"] or "") for nb in G[q])]
    d,q=min(c); assert d<maxd,(sub,d); return q
N={"start":snap(WP["start"]),"muffato":snap_named((-50.1593,-25.1063),"Jacob"),"tropeiros":snap(WP["tropeiros"]),"daju":snap_named((-50.15516,-25.09976),"Benjamin Constant"),
   "terminal":snap_named((-50.15512,-25.09415),"Benjamin Constant"),"loopNE":snap_named((-50.1523,-25.0945),"Vicente Machado"),"daju2":snap_named((-50.1545,-25.0992),"Ermelino")}
for k,v in N.items(): print(k,v,round(math.dist(m(*v),m(*WP.get(k,v)))),"m do ponto")
used=set()
def leg(a,b,pen=1.8):
    H=G.copy()
    for u,v in used:
        if H.has_edge(u,v): H[u][v]["w"]*=pen
    p=nx.shortest_path(H,a,b,weight="w"); out=[]; L=0
    for u,v in zip(p,p[1:]):
        e=G[u][v]; c=e["coords"]
        if tuple(round(x,6) for x in c[0])!=u: c=c[::-1]
        out+=c if not out else c[1:]; L+=e["L"]; used.add((u,v)); used.add((v,u))
    return out,L
seq=["start","muffato","tropeiros","daju","terminal","loopNE","daju2","tropeiros","muffato","start"]
route=[];legs=[];tot=0
for a,b in zip(seq,seq[1:]):
    c,L=leg(N[a],N[b]); route+=c if not route else c[1:]; legs.append((a,b,round(L))); tot+=L
print(legs,"TOTAL",round(tot))
# comprimentos acumulados dos pontos de referência
cum=[0]; 
for p,q in zip(route,route[1:]): cum.append(cum[-1]+math.dist(m(*p),m(*q)))
def s_of(node): 
    p=min(range(len(route)),key=lambda i:math.dist(m(*route[i]),m(*node))); return cum[p]
json.dump({"origin":O,"route":route,"star":(-50.15314,-25.11161),"total":tot,"legs":legs,"WP":WP,"N":{k:list(v) for k,v in N.items()}},open("data/route52.json","w"))
