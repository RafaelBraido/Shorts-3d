"""Mixa narração + trilha ambiente sintetizada + efeitos (whoosh, pop, trovão) em out/audio.wav (44,1 kHz estéreo)."""
import json, re, wave, numpy as np
from scipy import signal
SR = 44100
TL = json.load(open("out/timeline.json")); total = TL["total"]
L = {l["id"]: l for l in TL["lines"]}
norm = lambda s: re.sub(r"[^a-z0-9]", "", __import__("unicodedata").normalize("NFD", s.lower()).encode("ascii", "ignore").decode())
def Wd(i, w, dt=0):
    ws = L[i]["words"]; k = next((x for x in ws if norm(x["w"]) == norm(w)), None) or next(x for x in ws if norm(x["w"]).startswith(norm(w)))
    return k["t0"] + dt
n = int((total + 0.5) * SR); rng = np.random.default_rng(11)
def place(buf, x, t, g=1.0):
    i = int(t * SR); j = min(i + len(x), len(buf))
    if i < len(buf): buf[i:j] += x[:j - i] * g
def rd(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768, w.getframerate()
# ---- voz
voice = np.zeros(n, np.float32)
for l in TL["lines"]:
    x, sr = rd(f"out/voice/{l['id']}.wav")
    if sr != SR: x = signal.resample_poly(x, SR, sr)
    place(voice, x, l["start"])
voice = voice / max(np.abs(voice).max(), 1e-6) * 0.9
# presença leve: realça 2-4 kHz
sos = signal.butter(2, [1800, 4500], "bandpass", fs=SR, output="sos"); voice += 0.12 * signal.sosfilt(sos, voice)
# ---- música: pad Am-F-C-G + arpejo suave
t = np.arange(n) / SR
chords = [[110.0, 164.81, 220.0, 261.63], [87.31, 130.81, 174.61, 261.63], [130.81, 196.0, 261.63, 329.63], [98.0, 146.83, 196.0, 293.66]]
bar = 5.5; pad = np.zeros(n, np.float32)
for i, ch in enumerate(chords * 4):
    s0 = i * bar
    if s0 >= total + 0.5: break
    seg = np.zeros(n, np.float32)
    for f in ch:
        for det in (-0.004, 0.0, 0.004):
            seg += np.sin(2 * np.pi * f * (1 + det) * t + rng.uniform(0, 6.28)).astype(np.float32) * 0.25 + 0.08 * np.sin(2 * np.pi * 2 * f * (1 + det) * t).astype(np.float32)
    env = np.clip((t - s0) / 1.4, 0, 1) * np.clip((s0 + bar + 1.2 - t) / 1.4, 0, 1)
    pad += seg * env.astype(np.float32)
sos = signal.butter(2, 900, "lowpass", fs=SR, output="sos"); pad = signal.sosfilt(sos, pad)
arp = np.zeros(n, np.float32); notes = [220, 261.63, 329.63, 392.0, 329.63, 261.63]
k = 0; tt = 0.5
while tt < total:
    f = notes[k % len(notes)] * (1 if (int(tt // bar) % 4) != 1 else 0.79)
    d = np.arange(int(0.9 * SR)) / SR; x = (np.sin(2 * np.pi * f * d) + 0.4 * np.sin(2 * np.pi * 2 * f * d)) * np.exp(-d * 4.5) * 0.35
    place(arp, x.astype(np.float32), tt, 1.0); k += 1; tt += 0.55
music = pad / np.abs(pad).max() * 0.55 + arp / max(np.abs(arp).max(), 1e-6) * 0.20
music *= np.clip(t / 1.2, 0, 1) * np.clip((total + 0.3 - t) / 2.0, 0, 1)
# ducking sob a voz
envv = signal.sosfilt(signal.butter(2, 6, "lowpass", fs=SR, output="sos"), np.abs(voice)); envv = np.clip(envv / 0.12, 0, 1)
music *= (1 - 0.55 * envv)
# ---- efeitos
def whoosh(dur=1.2, up=True):
    m = int(dur * SR); nz = rng.standard_normal(m).astype(np.float32)
    out = np.zeros(m, np.float32); cs = np.geomspace(300, 5000, 7)
    bands = [signal.sosfilt(signal.butter(2, [c * 0.7, c * 1.4], "bandpass", fs=SR, output="sos"), nz) for c in cs]
    pos = np.linspace(0, 1, m) if up else np.linspace(1, 0, m)
    for i, b in enumerate(bands):
        w = np.clip(1 - np.abs(pos * (len(cs) - 1) - i), 0, 1); out += b * w
    env = np.sin(np.pi * np.linspace(0, 1, m)) ** 2
    return (out * env / np.abs(out).max()).astype(np.float32)
def pop():
    d = np.arange(int(0.12 * SR)) / SR; f = 520 + 380 * np.exp(-d * 60)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-d * 38)).astype(np.float32)
def thunder(dur=2.4):
    m = int(dur * SR); nz = rng.standard_normal(m).astype(np.float32)
    nz = signal.sosfilt(signal.butter(3, 140, "lowpass", fs=SR, output="sos"), nz)
    env = (1 - np.exp(-np.linspace(0, 1, m) * 40)) * np.exp(-np.linspace(0, 1, m) * 3.0)
    return (nz * env / np.abs(nz * env).max()).astype(np.float32)
sfx = np.zeros(n, np.float32)
for tm, d, up, g in [(1.0, 1.8, True, 0.55), (L["h2"]["start"] + 0.2, 1.6, True, 0.5), (L["d1"]["start"] + 0.0, 1.2, False, 0.4), (L["f1"]["start"] + 0.2, 1.3, True, 0.45),
                     (L["f2"]["start"] + 0.2, 1.2, True, 0.4), (L["f3"]["start"] + 0.2, 1.4, True, 0.45), (L["c1"]["start"] + 0.3, 2.6, False, 0.6)]:
    place(sfx, whoosh(d, up), tm, g)
for tm in [Wd("h1", "Jerusalém", 0.1), Wd("d1", "divisor", -0.1), Wd("f1", "Um", 0.0), Wd("f2", "Dois", 0.0), Wd("f3", "Três", 0.0), Wd("c1", "Segue", -0.1)]:
    place(sfx, pop(), tm, 0.35)
mix = voice + music * 0.55 + sfx * 0.45
mix = mix / max(np.abs(mix).max(), 1e-6) * 0.92
st = np.stack([mix, mix], 1)
with wave.open("out/audio.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes())
print("ok", round(total, 2), "s")
