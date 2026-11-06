"""Sinais visuais por segundo, medidos nos pixels (OpenCV + numpy; sem rede, sem login)."""
from __future__ import annotations

import json
import math
import subprocess

import cv2
import numpy as np

from . import frames as F


def probe(path: str) -> dict:
    """Metadados via ffprobe."""
    cmd = ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe falhou: {out.stderr.strip() or 'arquivo inválido'}")
    info = json.loads(out.stdout)
    vs = next((s for s in info["streams"]
               if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")), None)
    if vs is None:
        raise RuntimeError("Nenhuma faixa de vídeo encontrada.")
    has_audio = any(s.get("codec_type") == "audio" for s in info["streams"])
    fmt = info.get("format", {})
    duration = float(fmt.get("duration") or vs.get("duration") or 0)
    num, _, den = (vs.get("avg_frame_rate") or "0/1").partition("/")
    try:
        fps = float(num) / float(den or 1)
    except (ValueError, ZeroDivisionError):
        fps = 0.0
    w, h = int(vs["width"]), int(vs["height"])
    rot = 0
    for sd in vs.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    rot = rot or int((vs.get("tags") or {}).get("rotate", 0) or 0)
    if abs(rot) % 180 == 90:  # celular grava deitado + metadado de rotação
        w, h = h, w
    br = fmt.get("bit_rate")
    return {"width": w, "height": h, "duration": duration, "has_audio": has_audio,
            "fps": fps, "codec": vs.get("codec_name"), "bitrate_kbps": float(br) / 1000 if br else None}


def _fill(arr: np.ndarray, valid: np.ndarray, default: float = 0.0) -> np.ndarray:
    """Segundos sem amostra herdam o vizinho anterior (ou o próximo, se for o começo)."""
    if not valid.any():
        return np.full(len(arr), default)
    idx = np.where(valid, np.arange(len(arr)), 0)
    np.maximum.accumulate(idx, out=idx)
    out = arr[idx].copy()
    first = int(np.argmax(valid))
    out[:first] = arr[first]
    return np.nan_to_num(out, nan=default)


class _Acc:
    """Acumula médias por segundo."""

    def __init__(self, S: int):
        self.S = S
        self.sum = {}
        self.cnt = {}

    def add(self, key: str, s: int, v):
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return
        s = min(max(s, 0), self.S - 1)
        if key not in self.sum:
            self.sum[key] = np.zeros(self.S)
            self.cnt[key] = np.zeros(self.S)
        self.sum[key][s] += v
        self.cnt[key][s] += 1

    def mean(self, key: str, default: float = 0.0):
        if key not in self.sum:
            return None
        c = self.cnt[key]
        m = np.full(self.S, np.nan)
        nz = c > 0
        m[nz] = self.sum[key][nz] / c[nz]
        return _fill(m, nz, default)

    def has(self, key: str) -> bool:
        return key in self.sum and self.cnt[key].sum() > 0


def extract(path: str, meta: dict, sample_fps: float = 8.0, keyframes: bool = True,
            safe_bottom: float = 0.22, safe_right: float = 0.14) -> dict:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("OpenCV não conseguiu abrir o vídeo.")
    fps = cap.get(cv2.CAP_PROP_FPS) or meta.get("fps") or 30.0
    step = max(1, int(round(fps / sample_fps)))
    dt = step / fps
    duration = meta["duration"] or 0.0
    est_S = max(1, int(math.ceil(duration))) if duration else 600
    acc = _Acc(est_S + 2)

    q_every = max(1, int(round(sample_fps / 2)))  # medidas caras 2x por segundo
    cut_times: list[float] = []
    recent_diffs: list[float] = []
    prev_small = prev_gray = prev_hist = None
    first_hist = first_small = None
    tail: list[np.ndarray] = []
    tail_frames: list[np.ndarray] = []
    start_black_until = 0.0
    black_run = True
    key_times = [0, 1, 2, 3]
    keys: dict[int, bytes] = {}
    idx = n = 0
    last_t = 0.0

    while True:
        if not cap.grab():
            break
        if idx % step:
            idx += 1
            continue
        ok, frame = cap.retrieve()
        idx += 1
        if not ok or frame is None:
            continue
        t = (idx - 1) / fps
        last_t = t
        s = int(t)
        small = F.resize_width(frame, 192)
        gray = F.luma(small)
        hist = F.hsv_hist(small)

        # --- início preto / fade-in
        if black_run and gray.mean() < 18 and gray.std() < 10:
            start_black_until = t + dt
        else:
            black_run = False

        # --- cortes e movimento
        is_cut = False
        motion = None
        if prev_gray is not None:
            diff = float(np.mean(cv2.absdiff(small, prev_small))) / 255.0  # em cor: pega cortes só de matiz
            bhat = float(cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA))
            base = float(np.median(recent_diffs)) if recent_diffs else 0.0
            # histograma sozinho oscila em fundo escuro/pouco saturado (matiz instável): exige também diferença de pixels
            is_cut = (bhat > 0.45 and diff > 0.08) or (diff > max(0.18, 5.0 * base) and bhat > 0.18)
            if is_cut:
                cut_times.append(round(t, 3))
            else:
                recent_diffs.append(diff)
                recent_diffs[:] = recent_diffs[-12:]
                g1 = cv2.resize(prev_gray, (96, max(8, int(96 * prev_gray.shape[0] / prev_gray.shape[1]))))
                g2 = cv2.resize(gray, g1.shape[::-1])
                flow = cv2.calcOpticalFlowFarneback(g1, g2, None, 0.5, 2, 9, 2, 5, 1.1, 0)
                mag = np.linalg.norm(flow, axis=2)
                motion = float(mag.mean()) / g1.shape[1] / dt  # largura do quadro por segundo
                acc.add("motion", s, motion)
                acc.add("motion_peak", s, float(np.percentile(mag, 95)) / g1.shape[1] / dt)
            acc.add("frame_diff", s, diff)
            acc.add("hist_dist", s, bhat)
        acc.add("cut", s, 1.0 if is_cut else 0.0)

        # --- qualidade de imagem (2x por segundo)
        if n % q_every == 0:
            qd = F.quality(frame, safe_bottom, safe_right)
            for k, v in qd.items():
                acc.add(k, s, v)
            if qd["face_ratio"] is not None:
                acc.add("face", s, 1.0 if qd["face_ratio"] > 0.01 else 0.0)

        if first_hist is None:
            first_hist, first_small = hist, gray
        tail.append(hist)
        tail_frames.append(gray)
        if len(tail) > max(2, int(1.5 * sample_fps)):
            tail.pop(0)
            tail_frames.pop(0)

        if keyframes and s in key_times and s not in keys:
            kf = F.resize_width(frame, 160)
            okj, buf = cv2.imencode(".jpg", kf, [cv2.IMWRITE_JPEG_QUALITY, 60])
            if okj:
                keys[s] = buf.tobytes()

        prev_small, prev_gray, prev_hist = small, gray, hist
        n += 1
    cap.release()
    if n == 0:
        raise RuntimeError("Nenhum quadro lido.")

    real_dur = max(duration, last_t + dt)
    S = max(1, int(math.ceil(real_dur - 1e-6)))
    A = acc  # reaproveita o acumulador (tem folga de 2 s)

    def arr(key, default=0.0):
        m = A.mean(key, default)
        if m is None:
            return None
        return m[:S] if len(m) >= S else np.pad(m, (0, S - len(m)), mode="edge")

    cut_arr = np.zeros(S)
    for ct in cut_times:
        cut_arr[min(int(ct), S - 1)] += 1

    out = {
        "seconds": S,
        "cut_times": cut_times,
        "cuts": cut_arr,
        "motion": arr("motion"),
        "motion_peak": arr("motion_peak"),
        "frame_diff": arr("frame_diff"),
        "hist_dist": arr("hist_dist"),
        "start_black_s": float(start_black_until),
        "has_face_detector": F.face_available(),
        "keyframes": [(k, keys[k]) for k in sorted(keys)],
    }
    for k in ("sharpness", "exposure", "contrast", "colorfulness", "saturation", "focus", "placement",
              "text_ratio", "text_unsafe", "tech", "subject", "score", "luma_mean", "sharpness_raw"):
        out[k] = arr(k)
    out["face"] = arr("face") if A.has("face") else None
    out["face_ratio"] = arr("face_ratio") if A.has("face_ratio") else None

    # --- semelhança fim-início (loop)
    loop = 0.0
    if first_hist is not None and tail:
        tail_h = np.mean(tail, axis=0).astype(np.float32)
        hcorr = max(0.0, float(cv2.compareHist(first_hist, tail_h, cv2.HISTCMP_CORREL)))
        last_g = tail_frames[-1]
        pix = 1.0 - float(np.mean(cv2.absdiff(first_small, last_g))) / 255.0
        loop = float(0.5 * hcorr + 0.5 * max(0.0, (pix - 0.6) / 0.4))
    out["loop_similarity"] = loop
    return out
