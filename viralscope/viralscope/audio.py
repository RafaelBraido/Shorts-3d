"""Sinais de áudio por segundo (ffmpeg + numpy). Tudo calculado no sinal; nada é valor fixo."""
from __future__ import annotations

import re
import subprocess

import numpy as np

SR = 16000
HOP = 160          # 10 ms
WIN = 400          # 25 ms
SILENCE_DB = -50.0


def load(path: str) -> np.ndarray | None:
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"]
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0 or len(p.stdout) < SR * 2 * 0.2:
        return None
    return np.frombuffer(p.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def ebu_r128(path: str) -> dict | None:
    """Loudness integrada (LUFS), faixa dinâmica (LRA) e pico real (dBTP), pelo filtro ebur128 do ffmpeg."""
    cmd = ["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        return None
    tail = p.stderr[p.stderr.rfind("Summary:"):] if "Summary:" in p.stderr else ""
    def grab(rx):
        m = re.search(rx, tail)
        return float(m.group(1)) if m else None
    lufs = grab(r"I:\s+(-?[\d.]+)\s+LUFS")
    if lufs is None:
        return None
    return {"lufs": lufs, "lra": grab(r"LRA:\s+(-?[\d.]+)\s+LU"), "true_peak_db": grab(r"Peak:\s+(-?[\d.]+)\s+dBFS")}


def _frames(x: np.ndarray) -> np.ndarray:
    n = 1 + max(0, (len(x) - WIN) // HOP)
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    return x[idx] * np.hanning(WIN).astype(np.float32)


def analyze_signal(x: np.ndarray, seconds: int, sr: int = SR) -> dict:
    """Extrai sinais de um sinal mono (testável sem ffmpeg)."""
    assert sr == SR
    fr = _frames(x)
    spec = np.abs(np.fft.rfft(fr, axis=1)) ** 2 + 1e-12
    freqs = np.fft.rfftfreq(WIN, 1.0 / SR)
    voice_band = (freqs >= 300) & (freqs <= 3400)
    body_band = freqs >= 60
    e_total = spec[:, body_band].sum(1)
    e_voice = spec[:, voice_band].sum(1)
    frame_db = 10 * np.log10(np.mean(fr ** 2, axis=1) / np.mean(np.hanning(WIN) ** 2) + 1e-12)
    voice_ratio = e_voice / e_total
    env_db = 10 * np.log10(e_voice + 1e-12)
    # fluxo espectral positivo (início de sons novos)
    lg = np.log(spec[:, body_band])
    flux = np.maximum(0.0, np.diff(lg, axis=0)).mean(1)
    flux = np.concatenate([[0.0], flux])

    fps_f = SR / HOP  # quadros por segundo (100)
    active = frame_db > SILENCE_DB
    # --- sílabas: picos do envelope de voz, separados por >=120 ms e com proeminência >= 3 dB
    k = np.ones(5) / 5.0
    env = np.convolve(env_db, k, mode="same")
    floor = np.percentile(env, 90) - 28.0 if len(env) else 0.0
    peaks = []
    last = -999
    for i in range(2, len(env) - 2):
        if env[i] < floor or not active[i] or voice_ratio[i] < 0.45:
            continue
        if env[i] >= env[i - 1] and env[i] > env[i + 1] and i - last >= 12:
            lo = max(0, i - 12)
            hi = min(len(env), i + 13)
            if env[i] - min(env[lo:i + 1].min(), env[i:hi].min()) >= 3.0:
                peaks.append(i)
                last = i
    syll = np.zeros(seconds)
    for p in peaks:
        s = int(p / fps_f)
        if s < seconds:
            syll[s] += 1

    loud = np.full(seconds, -90.0)
    onsets = np.zeros(seconds)
    voice = np.zeros(seconds)
    flux_s = np.zeros(seconds)
    silent = np.ones(seconds, dtype=bool)
    win100 = 10
    for s in range(seconds):
        a, b = int(s * fps_f), int((s + 1) * fps_f)
        if a >= len(frame_db):
            break
        seg_db = frame_db[a:b]
        seg_pow = np.mean(10 ** (seg_db / 10))
        loud[s] = 10 * np.log10(seg_pow + 1e-12)
        silent[s] = loud[s] < SILENCE_DB
        n = len(seg_db) // win100
        if n >= 2:
            d10 = 10 * np.log10(np.array([np.mean(10 ** (seg_db[i * win100:(i + 1) * win100] / 10)) for i in range(n)]) + 1e-12)
            onsets[s] = float(np.sum((np.diff(d10) > 6.0) & (d10[1:] > SILENCE_DB + 8)))
        if not silent[s]:
            voice[s] = float(np.mean(voice_ratio[a:b][active[a:b]])) if active[a:b].any() else 0.0
            flux_s[s] = float(np.mean(flux[a:b]))

    first_sound = next((i / fps_f for i in range(len(frame_db)) if frame_db[i] > SILENCE_DB + 5), None)
    first_syll = peaks[0] / fps_f if peaks else None
    dur = max(1, len(x) / SR)
    speech_secs = int((syll >= 2).sum())
    return {
        "loud_db": loud, "onsets": onsets, "voice_ratio": voice, "flux": flux_s, "syll_rate": syll,
        "silent": silent,
        "first_sound_s": first_sound, "first_speech_s": first_syll,
        "silence_ratio": float(silent.mean()),
        "clip_ratio": float(np.mean(np.abs(x) > 0.985)),
        "peak_db": float(20 * np.log10(np.max(np.abs(x)) + 1e-9)),
        "speech_rate_syl_s": float(syll.sum() / speech_secs) if speech_secs else 0.0,
        "speech_seconds": speech_secs,
        "duration": float(dur),
    }


def extract(path: str, seconds: int) -> dict | None:
    x = load(path)
    if x is None:
        return None
    r = analyze_signal(x, seconds)
    r["ebu"] = ebu_r128(path)
    # semelhança fim-início do áudio (loop de som)
    n = SR // 2
    if len(x) > 4 * n:
        a, b = np.abs(np.fft.rfft(x[:n])), np.abs(np.fft.rfft(x[-n:]))
        denom = float(np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
        r["loop_audio"] = max(0.0, float(np.dot(a, b) / denom))
    else:
        r["loop_audio"] = 0.0
    return r
