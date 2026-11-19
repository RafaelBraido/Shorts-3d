"""Voz + batida 128 bpm sintetizada + passos, respiração, batimento e efeitos -> out/audio.wav (44,1 kHz estéreo)."""
import json, re, wave, unicodedata, numpy as np
from scipy import signal
SR = 44100
TL = json.load(open("out/timeline.json")); total = TL["total"]; L = {l["id"]: l for l in TL["lines"]}
norm = lambda s: re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode())
def Wd(i, w, dt=0):
    ws = L[i]["words"]; k = next((x for x in ws if norm(x["w"]) == norm(w)), None) or next(x for x in ws if norm(x["w"]).startswith(norm(w))); return k["t0"] + dt
n = int((total + 0.5) * SR); rng = np.random.default_rng(5); t = np.arange(n) / SR
def place(buf, x, tm, g=1.0):
    i = int(tm * SR); j = min(i + len(x), len(buf))
    if 0 <= i < len(buf): buf[i:j] += x[:j - i] * g
def rd(p):
    with wave.open(p) as w: return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768, w.getframerate()
voice = np.zeros(n, np.float32)
for l in TL["lines"]:
    x, sr = rd(f"out/voice/{l['id']}.wav")
    if sr != SR: x = signal.resample_poly(x, SR, sr)
    place(voice, x, l["start"])
voice = voice / max(np.abs(voice).max(), 1e-6) * 0.9
voice += 0.12 * signal.sosfilt(signal.butter(2, [1800, 4500], "bandpass", fs=SR, output="sos"), voice)
env = signal.sosfilt(signal.butter(2, 8, "lowpass", fs=SR, output="sos"), np.abs(voice)); duck = 1 - 0.55 * np.clip(env / 0.12, 0, 1)
# batida 128 bpm
bpm = 128; beat = 60 / bpm; drums = np.zeros(n, np.float32)
def kick():
    d = np.arange(int(0.28 * SR)) / SR; f = 45 + 110 * np.exp(-d * 28); return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-d * 9)).astype(np.float32)
def hat(o=False):
    m = int((0.18 if o else 0.05) * SR); x = rng.standard_normal(m).astype(np.float32); x = signal.sosfilt(signal.butter(2, 7000, "highpass", fs=SR, output="sos"), x); return x * np.exp(-np.arange(m) / SR * (18 if o else 70)) * 0.4
def clap():
    m = int(0.16 * SR); x = rng.standard_normal(m).astype(np.float32); x = signal.sosfilt(signal.butter(2, [1200, 3500], "bandpass", fs=SR, output="sos"), x); return x * np.exp(-np.arange(m) / SR * 28) * 0.6
K0 = 0.35; kk = kick(); hh = hat(); ho = hat(True); cl = clap()
for b in range(int((total - K0) / beat) + 1):
    tm = K0 + b * beat; amp = 0.55 if tm < 3.5 else 0.9
    place(drums, kk, tm, amp)
    place(drums, ho, tm + beat / 2, 0.5)
    if b % 2 == 1 and tm > 3.5: place(drums, cl, tm, 0.5)
    if tm > 6: place(drums, hh, tm + beat / 4, 0.3); place(drums, hh, tm + 3 * beat / 4, 0.3)
# baixo + sintetizador (Am - F - C - G)
roots = [55.0, 43.65, 65.41, 49.0]; bass = np.zeros(n, np.float32); lead = np.zeros(n, np.float32)
for b in range(int((total - K0) / beat) + 1):
    tm = K0 + b * beat; r = roots[(b // 8) % 4]; i = int(tm * SR); m = int(beat * 0.9 * SR)
    if i + m >= n: break
    d = np.arange(m) / SR; bass[i:i + m] += (np.sin(2 * np.pi * r * d) + 0.35 * np.sin(2 * np.pi * 2 * r * d)) * np.exp(-d * 3.5) * 0.5
    if tm > 3.5:
        for j, mult in enumerate([4, 6, 5, 6]):
            ii = int((tm + j * beat / 4) * SR); mm = int(0.12 * SR)
            if ii + mm < n: dd = np.arange(mm) / SR; lead[ii:ii + mm] += np.sin(2 * np.pi * r * mult * dd) * np.exp(-dd * 22) * 0.12
music = drums + bass * 0.55 + lead
# passos (ritmo 2,9 Hz), respiração, batimento
steps = np.zeros(n, np.float32); th = int(0.07 * SR); dd = np.arange(th) / SR
thud = (rng.standard_normal(th) * np.exp(-dd * 70)).astype(np.float32); thud = signal.sosfilt(signal.butter(2, 900, "lowpass", fs=SR, output="sos"), thud)
for k in range(int(total * 2.9 * 2)): place(steps, thud, 0.2 + k / 5.8, 0.22 + 0.06 * (k % 2))
breath = np.zeros(n, np.float32)
for k in range(int(total / 1.3)):
    tm = 0.8 + k * 1.3; m = int(0.55 * SR); x = rng.standard_normal(m).astype(np.float32); x = signal.sosfilt(signal.butter(2, [500, 2500], "bandpass", fs=SR, output="sos"), x)
    place(breath, x * np.sin(np.pi * np.linspace(0, 1, m)) ** 2, tm, 0.10)
heart = np.zeros(n, np.float32); hb = (np.sin(2 * np.pi * 55 * np.arange(int(0.2 * SR)) / SR) * np.exp(-np.arange(int(0.2 * SR)) / SR * 22)).astype(np.float32)
for k in range(int(total * 1.45)): place(heart, hb, k / 1.45, 0.5); place(heart, hb, k / 1.45 + 0.22, 0.32)
def whoosh(d, up=True):
    m = int(d * SR); x = rng.standard_normal(m).astype(np.float32); out = np.zeros(m, np.float32); fc = np.linspace(300, 5000, m) if up else np.linspace(5000, 300, m)
    for a in range(0, m, 2048):
        b_ = min(a + 2048, m); f = float(fc[a]); sos = signal.butter(2, [max(f * .6, 60), min(f * 1.4, 18000)], "bandpass", fs=SR, output="sos"); out[a:b_] = signal.sosfilt(sos, x[a:b_])
    return (out * np.sin(np.pi * np.linspace(0, 1, m)) ** 2 / np.abs(out).max()).astype(np.float32)
def pop():
    d = np.arange(int(0.12 * SR)) / SR; f = 520 + 380 * np.exp(-d * 60); return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-d * 38)).astype(np.float32)
sfx = np.zeros(n, np.float32)
for tm, d, up, g in [(0.1, 1.2, True, 0.6), (L["d1"]["start"], 1.0, True, 0.5), (L["d2"]["start"] + 0.2, 1.0, True, 0.5), (L["d3"]["start"] + 1.4, 1.2, True, 0.5), (L["d4"]["start"], 1.0, False, 0.5), (L["f1"]["start"] - 0.2, 1.0, True, 0.5), (L["c1"]["start"] - 0.3, 1.4, True, 0.6)]:
    place(sfx, whoosh(d, up), tm, g)
for tm in [Wd("h1", "20", -0.1), Wd("d1", "largada", -0.1), Wd("d2", "ida", -0.1), Wd("d2", "trinta", -0.2), Wd("d3", "retorno", -0.2), Wd("d4", "volta", -0.1), Wd("f1", "3", -0.1), Wd("c1", "Venha", -0.1)]: place(sfx, pop(), tm, 0.3)
mix = voice + music * 0.5 * duck + steps * 0.8 + breath + heart * 0.6 + sfx * 0.45
fade = np.clip((total + 0.4 - t) / 0.8, 0, 1); mix = mix * fade
mix = mix / max(np.abs(mix).max(), 1e-6) * 0.92
with wave.open("out/audio.wav", "wb") as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.stack([mix, mix], 1) * 32767).astype(np.int16).tobytes())
print("ok", round(total, 2), "s")
