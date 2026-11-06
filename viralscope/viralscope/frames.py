"""Medidas de qualidade de imagem de UM quadro (BGR uint8). Tudo é calculado no pixel, nada é valor fixo.

Cada função diz no docstring se é uma *medida* direta ou um *proxy*.
"""
from __future__ import annotations

import math
import os

import cv2
import numpy as np


def resize_width(img: np.ndarray, width: int) -> np.ndarray:
    h, w = img.shape[:2]
    if w == width:
        return img
    return cv2.resize(img, (width, max(1, int(round(h * width / w)))), interpolation=cv2.INTER_AREA)


def sat(x, k: float):
    """Saturação suave 0..1: 1 - exp(-x/k)."""
    return 1.0 - np.exp(-np.asarray(x, dtype=float) / k)


# ------------------------------------------------------------------ medidas diretas
def luma(bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


def sharpness_raw(bgr: np.ndarray) -> float:
    """MEDIDA: variância do Laplaciano a 320 px de largura (comparável entre resoluções)."""
    g = luma(resize_width(bgr, 320))
    return float(cv2.Laplacian(g, cv2.CV_64F).var())


def sharpness(bgr: np.ndarray) -> float:
    return float(sat(sharpness_raw(bgr), 90.0))


def exposure(bgr: np.ndarray) -> dict:
    """MEDIDA: luma média e fração de pixels estourados ou esmagados."""
    g = luma(bgr)
    m = float(g.mean())
    dark = float((g < 12).mean())
    bright = float((g > 243).mean())
    base = 1.0 - abs(m - 120.0) / 120.0
    score = max(0.0, base) * (1.0 - min(0.5, 2.0 * (dark + bright)))
    return {"mean": m, "dark_clip": dark, "bright_clip": bright, "score": float(score)}


def contrast(bgr: np.ndarray) -> float:
    """MEDIDA: desvio-padrão do luma normalizado (0..1; 64 já é contraste alto)."""
    return float(min(1.0, luma(bgr).std() / 64.0))


def colorfulness(bgr: np.ndarray) -> float:
    """MEDIDA: métrica de Hasler-Süsstrunk normalizada para 0..1."""
    b, g, r = [c.astype(np.float32) for c in cv2.split(bgr)]
    rg = r - g
    yb = 0.5 * (r + g) - b
    std = math.sqrt(float(rg.std()) ** 2 + float(yb.std()) ** 2)
    mean = math.sqrt(float(rg.mean()) ** 2 + float(yb.mean()) ** 2)
    return float(min(1.0, (std + 0.3 * mean) / 110.0))


def saturation(bgr: np.ndarray) -> float:
    return float(cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[:, :, 1].mean() / 255.0)


def hsv_hist(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
    return cv2.normalize(h, h, 1.0, 0.0, cv2.NORM_L1).astype(np.float32)


# ----------------------------------------------------------------- texto na tela
def text_regions(bgr: np.ndarray) -> list[tuple[int, int, int, int]]:
    """PROXY (sem OCR): caixas com cara de texto, achadas por gradiente morfológico.

    Procura blocos alongados, de traço denso e alto contraste. Pode confundir listras e
    grades com texto, e não lê o conteúdo. Serve para estimar *quanto* e *onde* há texto.
    """
    small = resize_width(bgr, 360)
    g = luma(small)
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    grad = cv2.morphologyEx(g, cv2.MORPH_GRADIENT, k3)
    _, bw = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    if grad.max() < 40:  # quadro sem bordas fortes: Otsu só acharia ruído
        return []
    conn = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 1)))
    cnts, _ = cv2.findContours(conn, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    H, W = g.shape
    scale = bgr.shape[1] / W
    boxes = []
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        if w < 14 or h < 6 or h > 0.14 * H or w / h < 1.6 or w > 0.98 * W:
            continue
        fill = float((bw[y:y + h, x:x + w] > 0).mean())
        if fill < 0.30 or fill > 0.85:
            continue
        boxes.append((int(x * scale), int(y * scale), int(w * scale), int(h * scale)))
    return boxes


def text_stats(bgr: np.ndarray, safe_bottom: float = 0.22, safe_right: float = 0.14) -> dict:
    """Fração da área coberta por texto (proxy) e quanto dela cai na zona coberta pela interface do app."""
    H, W = bgr.shape[:2]
    boxes = text_regions(bgr)
    area = sum(w * h for _, _, w, h in boxes)
    ratio = float(min(1.0, area / float(H * W)))
    unsafe = 0
    for x, y, w, h in boxes:
        cx, cy = x + w / 2, y + h / 2
        if cy > H * (1 - safe_bottom) or cx > W * (1 - safe_right):
            unsafe += w * h
    return {"ratio": ratio, "unsafe_ratio": float(unsafe / area) if area else 0.0, "n_boxes": len(boxes)}


# ------------------------------------------------------------------ saliência / composição
def saliency(bgr: np.ndarray, size: int = 64) -> np.ndarray:
    """MEDIDA: mapa de saliência por resíduo espectral (Hou & Zhang, 2007), implementado em numpy."""
    g = cv2.resize(luma(bgr), (size, size), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    f = np.fft.fft2(g)
    log_amp = np.log(np.abs(f) + 1e-8)
    resid = log_amp - cv2.blur(log_amp.astype(np.float32), (3, 3))
    s = np.abs(np.fft.ifft2(np.exp(resid + 1j * np.angle(f)))) ** 2
    s = cv2.GaussianBlur(s.astype(np.float32), (0, 0), 2.5)
    s -= s.min()
    tot = float(s.sum())
    return s / tot if tot > 0 else np.full_like(s, 1.0 / s.size)


_THIRDS = [(1 / 3, 1 / 3), (2 / 3, 1 / 3), (1 / 3, 2 / 3), (2 / 3, 2 / 3), (0.5, 0.45)]


def composition(bgr: np.ndarray) -> dict:
    """Foco (quão concentrada é a atenção visual) e posição do ponto de interesse.

    `focus` é MEDIDA (massa de saliência nos 5% pixels mais salientes). `placement` mede a
    distância do centroide até os pontos de terços/centro, o que é uma convenção de enquadramento
    (heurística), não uma lei.
    """
    if luma(bgr).std() < 3.0:  # quadro chapado: não há sujeito, e a FFT só acharia ruído numérico
        return {"focus": 0.0, "placement": 0.0, "cx": 0.5, "cy": 0.5}
    s = saliency(bgr)
    n = s.size
    top = np.sort(s.ravel())[::-1][: max(1, int(0.05 * n))].sum()
    focus = float(np.clip((top - 0.05) / 0.25, 0.0, 1.0))
    ys, xs = np.mgrid[0:s.shape[0], 0:s.shape[1]]
    cx = float((s * xs).sum() / (s.shape[1] - 1))
    cy = float((s * ys).sum() / (s.shape[0] - 1))
    d = min(math.hypot(cx - px, cy - py) for px, py in _THIRDS)
    placement = float(np.clip(1.0 - d / 0.40, 0.0, 1.0))
    return {"focus": focus, "placement": placement, "cx": cx, "cy": cy}


# ------------------------------------------------------------------------- rosto
_CASCADE = None
_CASCADE_TRIED = False


def _cascade():
    global _CASCADE, _CASCADE_TRIED
    if not _CASCADE_TRIED:
        _CASCADE_TRIED = True
        try:
            xml = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
            if os.path.isfile(xml):
                c = cv2.CascadeClassifier(xml)
                if not c.empty():
                    _CASCADE = c
        except Exception:
            _CASCADE = None
    return _CASCADE


def face_available() -> bool:
    return _cascade() is not None


def faces(bgr: np.ndarray) -> list[tuple[int, int, int, int]]:
    """MEDIDA (Haar cascade): rostos frontais. Perde rostos de lado, pequenos ou cartoon/3D."""
    c = _cascade()
    if c is None:
        return []
    g = luma(resize_width(bgr, 320))
    g = cv2.equalizeHist(g)
    found = c.detectMultiScale(g, 1.15, 5, minSize=(24, 24))
    return [tuple(int(v) for v in f) for f in found]


def face_area_ratio(bgr: np.ndarray) -> float | None:
    """Maior rosto / área do quadro. None se não há detector."""
    if not face_available():
        return None
    fs = faces(bgr)
    if not fs:
        return 0.0
    small_w = 320
    h = bgr.shape[0] * small_w / bgr.shape[1]
    return float(max(w * hh for _, _, w, hh in fs) / (small_w * h))


# ------------------------------------------------------------------- resumo de um quadro
def quality(bgr: np.ndarray, safe_bottom: float = 0.22, safe_right: float = 0.14,
            with_faces: bool = True) -> dict:
    """Todas as medidas de imagem de um quadro, mais uma nota 0..1 de qualidade técnica."""
    small = resize_width(bgr, 360)
    ex = exposure(small)
    sh = sharpness(small)
    co = contrast(small)
    cf = colorfulness(small)
    comp = composition(small)
    tx = text_stats(bgr, safe_bottom, safe_right)
    fa = face_area_ratio(small) if with_faces else None
    tech = 0.35 * sh + 0.30 * ex["score"] + 0.15 * co + 0.20 * cf
    subject = 0.6 * comp["focus"] + 0.4 * comp["placement"]
    if fa is not None and fa > 0.02:
        subject = max(subject, min(1.0, 0.6 + 4.0 * fa))
    return {
        "sharpness": sh, "sharpness_raw": sharpness_raw(small), "exposure": ex["score"],
        "luma_mean": ex["mean"], "dark_clip": ex["dark_clip"], "bright_clip": ex["bright_clip"],
        "contrast": co, "colorfulness": cf, "saturation": saturation(small),
        "focus": comp["focus"], "placement": comp["placement"],
        "face_ratio": fa, "text_ratio": tx["ratio"], "text_unsafe": tx["unsafe_ratio"],
        "tech": float(tech), "subject": float(subject),
        "score": float(0.6 * tech + 0.4 * subject),
    }
