import math, json, io, urllib.request, numpy as np
from PIL import Image
O=(-50.155,-25.108); kx=111320*math.cos(math.radians(25.108)); ky=110574
Z=12; HALF=16000.0; STEP=32.0
def tile(x,y):
    u=f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png"
    a=np.array(Image.open(io.BytesIO(urllib.request.urlopen(u,timeout=60).read())).convert("RGB"),dtype=np.float64)
    return a[...,0]*256+a[...,1]+a[...,2]/256-32768
def tx(lon): return (lon+180)/360*2**Z
def ty(lat): r=math.radians(lat); return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2*2**Z
lon0=O[0]-HALF/kx-0.01; lon1=O[0]+HALF/kx+0.01; lat0=O[1]-HALF/ky-0.01; lat1=O[1]+HALF/ky+0.01
x0,x1=int(tx(lon0)),int(tx(lon1)); y0,y1=int(ty(lat1)),int(ty(lat0)); print("tiles",x0,x1,y0,y1)
M=np.zeros(((y1-y0+1)*256,(x1-x0+1)*256))
for yy in range(y0,y1+1):
    for xx in range(x0,x1+1): M[(yy-y0)*256:(yy-y0+1)*256,(xx-x0)*256:(xx-x0+1)*256]=tile(xx,yy)
n=int(2*HALF/STEP)+1; xs=O[0]+(-HALF+np.arange(n)*STEP)/kx; ys=O[1]+(-HALF+np.arange(n)*STEP)/ky
px=(np.array([tx(l) for l in xs])-x0)*256; py=np.array([(ty(l)-y0)*256 for l in ys])
from scipy.ndimage import map_coordinates
gx,gy=np.meshgrid(px,py)   # linha j = norte j (sul->norte)
D=map_coordinates(M,[gy,gx],order=1).astype(np.float32)
print("DEM",D.shape,"min",D.min(),"max",D.max())
D.tofile("data/dem.bin"); json.dump({"n":n,"half":HALF,"step":STEP,"min":float(D.min()),"max":float(D.max())},open("data/dem.json","w"))
# elevação ao longo do percurso
R=json.load(open("data/route.json")); rt=[((c[0]-O[0])*kx,(c[1]-O[1])*ky) for c in R["route"]]
def h(x,y):
    fx=(x+HALF)/STEP; fy=(y+HALF)/STEP; i=int(fx); j=int(fy); u=fx-i; v=fy-j
    return D[j,i]*(1-u)*(1-v)+D[j,i+1]*u*(1-v)+D[j+1,i]*(1-u)*v+D[j+1,i+1]*u*v
e=[h(*p) for p in rt]; s=[0]
for a,b in zip(rt,rt[1:]): s.append(s[-1]+math.hypot(a[0]-b[0],a[1]-b[1]))
k=len(rt)//2
nI=R["nIda"]; print("start",round(e[0],1),"tip(ida end)",round(e[nI-1],1),"max",round(max(e),1),"min",round(min(e),1),"total len",round(s[-1]))
print("subida líquida ida",round(e[nI-1]-e[0],1),"| fim",round(e[-1],1))
