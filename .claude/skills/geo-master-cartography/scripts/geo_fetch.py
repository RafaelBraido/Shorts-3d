"""Cache local em ./data/geo/ e utilitários de contorno/área (sem dependências pesadas para o básico)."""
import json, math, os, subprocess
from pathlib import Path
CACHE = Path(os.environ.get("GEO_CACHE", "data/geo"))
ALLOWED = ("https://raw.githubusercontent.com/", "https://github.com/")

def fetch(url: str) -> Path:
    """Baixa só de GitHub, uma vez. Bloqueia qualquer outro host (OSM/Mapbox etc.)."""
    if not url.startswith(ALLOWED): raise ValueError(f"host não permitido: {url}")
    CACHE.mkdir(parents=True, exist_ok=True); dst = CACHE / url.rsplit("/", 1)[-1]
    if not dst.exists() or dst.stat().st_size == 0:
        subprocess.run(["curl", "-sSL", "-m", "300", "--fail", "-o", str(dst), url], check=True)
    return dst

def _rings(geom):
    t, c = geom["type"], geom["coordinates"]
    return [p[0] for p in c] if t == "MultiPolygon" else [c[0]] if t == "Polygon" else []

def _dp(pts, tol):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]; dx, dy = x2 - x1, y2 - y1; n = math.hypot(dx, dy) or 1e-12
    d = [abs(dy * (p[0] - x1) - dx * (p[1] - y1)) / n for p in pts[1:-1]]; i = max(range(len(d)), key=d.__getitem__) + 1
    if d[i - 1] <= tol: return [pts[0], pts[-1]]
    return _dp(pts[:i + 1], tol)[:-1] + _dp(pts[i:], tol)

def outline_latlon(path, campo, valor, tol=0.01):
    """Maior polígono do recurso com properties[campo]==valor, simplificado, como [[lat, lon], ...]."""
    g = json.load(open(path)); feats = g["features"] if "features" in g else [g]
    ring = max((r for f in feats if f["properties"].get(campo) == valor for r in _rings(f["geometry"])), key=len)
    pts = [tuple(p[:2]) for p in ring]
    if pts[0] == pts[-1]:                       # anel fechado: divide no ponto mais distante do início e simplifica as duas metades
        k = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
        pts = _dp(pts[:k + 1], tol)[:-1] + _dp(pts[k:], tol)
    else: pts = _dp(pts, tol)
    return [[round(y, 4), round(x, 4)] for x, y in pts]

def area_km2(ring_latlon):
    """Área esférica (km²) de um anel [[lat, lon], ...] por excesso esférico (boa até escalas continentais)."""
    R = 6371.0088; s = 0.0; n = len(ring_latlon)
    for i in range(n):
        la1, lo1 = map(math.radians, ring_latlon[i]); la2, lo2 = map(math.radians, ring_latlon[(i + 1) % n])
        s += (lo2 - lo1) * (2 + math.sin(la1) + math.sin(la2))
    return abs(s) * R * R / 2
