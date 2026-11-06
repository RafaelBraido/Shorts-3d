"""Análise de uma imagem estática (thumbnail, capa, primeiro quadro)."""
from __future__ import annotations

import cv2

from . import frames as F
from . import profiles


def analyze_image(path: str, platform: str = "shorts") -> dict:
    img = cv2.imread(path)
    if img is None:
        raise RuntimeError(f"Não consegui abrir a imagem: {path}")
    prof = profiles.get(platform)
    q = F.quality(img, prof["safe_bottom"], prof["safe_right"])
    h, w = img.shape[:2]
    fixes = []

    def add(p, t):
        fixes.append({"priority": p, "area": "imagem", "text": t, "time": None})

    if q["sharpness_raw"] < 40:
        add(0.8, f"Imagem pouco nítida (Laplaciano {q['sharpness_raw']:.0f}); use foco firme ou resolução maior.")
    if q["luma_mean"] < 60:
        add(0.7, "Imagem escura; levante a exposição.")
    elif q["luma_mean"] > 195:
        add(0.7, "Imagem muito clara/estourada.")
    if q["dark_clip"] > 0.25 or q["bright_clip"] > 0.25:
        add(0.5, "Muita área esmagada no preto ou estourada no branco; perde detalhe.")
    if q["contrast"] < 0.25:
        add(0.6, "Contraste baixo; o quadro parece 'lavado' e some no feed.")
    if q["colorfulness"] < 0.12:
        add(0.35, "Cores muito apagadas; um acento de cor ajuda a parar o scroll.")
    if q["focus"] < 0.25:
        add(0.5, "Sem ponto de interesse claro; faça um sujeito dominar o quadro.")
    elif q["placement"] < 0.3:
        add(0.3, "O ponto de interesse está longe dos terços/centro; reenquadre.")
    if q["face_ratio"] is not None and q["face_ratio"] == 0:
        add(0.15, "Nenhum rosto frontal detectado (o detector não pega perfil, cartoon ou 3D).")
    if q["text_unsafe"] > 0.4:
        add(0.5, f"Texto na zona coberta pela interface de {prof['nome']}; suba o texto.")
    if h < w:
        add(0.6, "Imagem horizontal; para Shorts/Reels/TikTok use 9:16.")
    elif min(w, h) < 720:
        add(0.4, "Resolução baixa; use pelo menos 1080x1920.")
    fixes.sort(key=lambda f: -f["priority"])
    return {"schema": "viralscope/image-1", "score": round(100 * q["score"], 1), "quality": q,
            "size": [w, h], "fixes": fixes}
