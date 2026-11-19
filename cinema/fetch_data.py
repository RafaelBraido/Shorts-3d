"""Baixa dados brutos do GitHub para ./data/ usando só a biblioteca padrão (roda no Python embutido do Blender):
   blender -b -P cinema/fetch_data.py"""
import os, urllib.request
RAW = "https://raw.githubusercontent.com"
FILES = {
    "data/textures/Albedo.jpg": f"{RAW}/franky-adl/threejs-earth/main/src/assets/Albedo.jpg",          # 8192x4096 cor
    "data/textures/Bump.jpg": f"{RAW}/franky-adl/threejs-earth/main/src/assets/Bump.jpg",              # 10800x5400 relevo
    "data/textures/Clouds.png": f"{RAW}/franky-adl/threejs-earth/main/src/assets/Clouds.png",          # 4096x2048 nuvens
    "data/textures/Ocean.png": f"{RAW}/franky-adl/threejs-earth/main/src/assets/Ocean.png",            # 4096x2048 máscara (branco = oceano)
    "data/geo/ne_10m_admin_0_countries.json": f"{RAW}/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_0_countries.json",
    "data/geo/ne_10m_rivers_lake_centerlines.json": f"{RAW}/martynafford/natural-earth-geojson/master/10m/physical/ne_10m_rivers_lake_centerlines.json",
}
for dst, url in FILES.items():
    if os.path.exists(dst) and os.path.getsize(dst) > 1000: print("ok  ", dst); continue
    os.makedirs(os.path.dirname(dst), exist_ok=True); urllib.request.urlretrieve(url, dst); print("baixou", dst)
