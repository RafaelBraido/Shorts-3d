"""Vídeos e áudios sintéticos (ffmpeg + numpy + OpenCV). Servem para checar que o código mede o que diz
medir e que a nota ORDENA casos óbvios. Não validam previsão de views reais."""
import shutil
import subprocess
import wave

import cv2
import numpy as np
import pytest

SR = 16000
needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg não instalado")


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def speech_like(seconds=8.0, rate=5.5, start=0.5, end=None, f0=120.0, level=0.08):
    """Sinal com formantes entre 300-3400 Hz e envelope de `rate` sílabas/s (fala sintética)."""
    t = np.arange(int(SR * seconds)) / SR
    car = sum(np.exp(-(((f0 * k) - 1000) / 900) ** 2) * np.sin(2 * np.pi * f0 * k * t) for k in range(1, 28))
    env = (0.5 + 0.5 * np.sin(2 * np.pi * rate * t - np.pi / 2)) ** 1.5
    x = np.zeros_like(t)
    m = (t >= start) & (t < (end if end is not None else seconds - 0.2))
    x[m] = (car * env * level)[m]
    return x.astype(np.float32)


def write_wav(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def render_text_video(path, seconds=8, size=(360, 640), fps=30, text=True, safe=True):
    """Vídeo com legenda grande desenhada pelo OpenCV (sem depender de fontes do ffmpeg)."""
    w, h = size
    vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    rng = np.random.default_rng(3)
    for i in range(seconds * fps):
        f = np.full((h, w, 3), (60 + 20 * np.sin(i / 20.0), 50, 40), np.uint8)
        cv2.circle(f, (w // 2 + int(30 * np.sin(i / 10.0)), int(h * 0.35)), 60, (200, 220, 255), -1)
        if text:
            y = int(h * 0.55) if safe else int(h * 0.92)
            cv2.putText(f, "VOCE ESTA ERRANDO", (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 3)
            cv2.putText(f, "ISSO HA 8 MESES", (10, y + 50 if safe else y - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 3)
        vw.write(f)
    vw.release()


@pytest.fixture(scope="session")
def vids(tmp_path_factory):
    d = tmp_path_factory.mktemp("vids")
    p = {k: str(d / f"{k}.mp4") for k in
         ["dyn", "flat", "slow", "noaudio", "blackstart", "landscape", "blur", "dark", "caption", "nocaption", "unsafe", "speech"]}
    size = "360x640"
    noise = ["-f", "lavfi", "-i", "anoisesrc=a=0.3:d=12:c=pink,tremolo=f=4:d=0.9"]
    segs = []
    for h in (0, 90, 180, 270):
        segs += ["-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=3,hue=h={h}"]
    ff(*segs, *noise, "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]",
       "-map", "[v]", "-map", "4:a", "-pix_fmt", "yuv420p", "-shortest", p["dyn"])
    ff("-f", "lavfi", "-i", f"color=c=0x303030:size={size}:rate=30:duration=12",
       "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "12", "-pix_fmt", "yuv420p", "-shortest", p["flat"])
    ff("-f", "lavfi", "-i", f"color=c=0x303030:size={size}:rate=30:duration=5",
       "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=3,hue=h=0",
       "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=4,hue=h=120",
       *noise, "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
       "-map", "[v]", "-map", "3:a", "-pix_fmt", "yuv420p", "-shortest", p["slow"])
    ff("-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=8", "-an", "-pix_fmt", "yuv420p", p["noaudio"])
    ff("-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=8", *noise,
       "-vf", "fade=t=in:st=0:d=2:color=black", "-pix_fmt", "yuv420p", "-shortest", p["blackstart"])
    ff("-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=8", *noise, "-pix_fmt", "yuv420p", "-shortest", p["landscape"])
    ff("-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=8", *noise,
       "-vf", "boxblur=12:3", "-pix_fmt", "yuv420p", "-shortest", p["blur"])
    ff("-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=8", *noise,
       "-vf", "eq=brightness=-0.6", "-pix_fmt", "yuv420p", "-shortest", p["dark"])
    # fala sintética + vídeo com/sem legenda
    wav = d / "speech.wav"
    write_wav(wav, speech_like(8.0, 5.5, 0.4))
    for k, kw in {"caption": dict(text=True, safe=True), "nocaption": dict(text=False), "unsafe": dict(text=True, safe=False)}.items():
        raw = d / f"{k}_raw.mp4"
        render_text_video(raw, **kw)
        ff("-i", str(raw), "-i", str(wav), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", p[k])
    ff("-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=8", "-i", str(wav),
       "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", p["speech"])
    return p
