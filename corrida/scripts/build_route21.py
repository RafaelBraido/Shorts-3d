import pickle, shapely.wkb as W, networkx as nx, json, math
rows=pickle.load(open("data/seg_big.pkl","rb"))
O=(-50.155,-25.108); kx=111320*math.cos(math.radians(25.108)); ky=110574
m=lambda lon,lat:((lon-O[0])*kx,(lat-O[1])*ky)
MULT={"primary":.85,"secondary":.85,"tertiary":1.0,"residential":1.25,"unclassified":1.3,"living_street":1.5,"service":3.0}
G=nx.Graph()
for nm,c,t,sc,g in rows:
    if t!="road" or c in ("footway","path","steps","cycleway","pedestrian","track","bridleway","parking_aisle"): continue
    co=list(W.loads(g).coords); a=tuple(round(v,6) for v in co[0]); b=tuple(round(v,6) for v in co[-1])
    L=sum(math.dist(m(*co[i]),m(*co[i+1])) for i in range(len(co)-1))
    if G.has_edge(a,b) and G[a][b]["L"]<=L: continue
    G.add_edge(a,b,L=L,w=L*MULT.get(c,2.5),coords=co,n=(nm or {}).get("primary"),c=c)
BIG=max(nx.connected_components(G),key=len)
def snap(p,sub=None,maxd=400):
    c=[(math.dist(m(*q),m(*p)),q) for q in BIG if (sub is None or any(sub in (G[q][nb]["n"] or "") for nb in G[q]))]
    d,q=min(c); assert d<maxd,(p,sub,d); return q
START=snap((-50.153125,-25.111533)); MID=snap((-50.1304,-25.0915),"Carlos Cavalcanti"); FAR=max([q for q in BIG if any("Pery Pereira" in (G[q][nb]["n"] or "") for nb in G[q])],key=lambda q:math.dist(m(*q),m(*START)))
print("start",START,"mid",MID,"far",FAR)
def path(a,b,pen=None):
    H=G.copy()
    if pen:
        for u,v in pen[0]:
            if H.has_edge(u,v): H[u][v]["w"]*=pen[1]
    p=nx.shortest_path(H,a,b,weight="w"); return p
def coords(p):
    out=[]; L=0; names=[]
    for u,v in zip(p,p[1:]):
        e=G[u][v]; c=e["coords"]
        if tuple(round(x,6) for x in c[0])!=u: c=c[::-1]
        out+=c if not out else c[1:]; L+=e["L"]; names.append((e["n"],e["L"]))
    return out,L,names
p1=path(START,MID); p2=path(MID,FAR); ida_nodes=p1+p2[1:]
cum=[0]
for u,v in zip(ida_nodes,ida_nodes[1:]): cum.append(cum[-1]+G[u][v]["L"])
print("até FAR",round(cum[-1]),"m; até MID",round(cum[len(p1)-1]))
TARGET=10500.0
full,Lfull,nfull=coords(ida_nodes)
cut=[full[0]]; acc=0
for p,q in zip(full,full[1:]):
    d=math.dist(m(*p),m(*q))
    if acc+d>=TARGET:
        u=(TARGET-acc)/d; cut.append((p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u)); break
    cut.append(q); acc+=d
print("ida cortada em",round(TARGET),"m; ponto de retorno",cut[-1])
# nó da ida imediatamente antes do ponto de retorno (para a volta sair dele)
cumn=[0]
for u,v in zip(ida_nodes,ida_nodes[1:]): cumn.append(cumn[-1]+G[u][v]["L"])
j=max(i for i in range(len(cumn)) if cumn[i]<=TARGET)
Nj=ida_nodes[j]
# volta: ruas da ida nos primeiros 4,5 km custam 3x (força uma rua paralela perto do Centro); no resto, mesma via
pen=set()
for i,(u,v) in enumerate(zip(ida_nodes,ida_nodes[1:])):
    if cumn[i]<4500: pen.add((u,v)); pen.add((v,u))
H=G.copy()
for u,v in pen:
    if H.has_edge(u,v): H[u][v]["w"]*=3.0
pv=nx.shortest_path(H,Nj,START,weight="w"); cv,Lv,nv=coords(pv)
# trecho final da ida (do nó Nj até o ponto de retorno), percorrido ao contrário
tail=[]; acc=0; started=False
k0=min(range(len(cut)),key=lambda i:math.dist(m(*cut[i]),m(*Nj))); tail=cut[k0:]
route=cut+tail[::-1][1:]+cv[1:]
Lv_tot=sum(math.dist(m(*p),m(*q)) for p,q in zip(tail,tail[1:]))+Lv
print("volta",round(Lv_tot),"m; total",round(TARGET+Lv_tot),"m")
print("VOLTA:",[(a,round(b)) for a,b in nv if b>150][:12])
json.dump({"origin":O,"route":[list(c) for c in route],"star":(-50.15314,-25.11161),"L":[TARGET,Lv_tot],"turn":list(cut[-1]),"mid":list(MID)},open("data/route21.json","w"))
