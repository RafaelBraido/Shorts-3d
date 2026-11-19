"""Áudio de teste de 5 s, 100% procedural (só numpy + wave, que já vêm no Python do Blender): pad, arpejo, whoosh e pop.
Sem voz (a voz entra pelo voz_sapi.ps1). Uso: blender -b --python-expr "exec(open('cinema/audio_teste.py').read())"  ou  python3 cinema/audio_teste.py"""
import numpy as np, wave, os
SR = 44100; D = 5.0; n = int(SR * D); t = np.arange(n) / SR; rng = np.random.default_rng(7)
def lp(x, fc):                                  # passa-baixa de um polo
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); s = 0.0
    for i, v in enumerate(x): s = (1 - a) * v + a * s; y[i] = s
    return y
pad = np.zeros(n)
for f in (110.0, 164.81, 220.0, 261.63):        # Lá menor
    for det in (-0.004, 0.0, 0.004): pad += np.sin(2 * np.pi * f * (1 + det) * t + rng.uniform(0, 6.28)) * 0.22 + 0.06 * np.sin(4 * np.pi * f * (1 + det) * t)
pad = lp(pad, 900) * np.clip(t / 0.8, 0, 1) * np.clip((D - t) / 1.0, 0, 1)
arp = np.zeros(n)
for k, f in enumerate([220, 261.63, 329.63, 392.0, 329.63, 261.63, 220, 329.63, 392.0]):
    i0 = int((0.35 + 0.5 * k) * SR); dd = np.arange(min(int(0.8 * SR), n - i0)) / SR
    if len(dd): arp[i0:i0 + len(dd)] += (np.sin(2 * np.pi * f * dd) + 0.4 * np.sin(4 * np.pi * f * dd)) * np.exp(-dd * 4.5) * 0.30
nz = rng.standard_normal(n); wh = np.zeros(n); i0, i1 = int(0.2 * SR), int(1.6 * SR); seg = nz[i0:i1]; env = np.sin(np.pi * np.linspace(0, 1, len(seg))) ** 2
wh[i0:i1] = lp(seg, 3500) * env * 0.5 - lp(seg, 400) * env * 0.5          # sobe em frequência (faixa passante aproximada)
dp = np.arange(int(0.14 * SR)) / SR; pop = np.sin(2 * np.pi * np.cumsum(520 + 380 * np.exp(-dp * 60)) / SR) * np.exp(-dp * 38) * 0.5
pp = np.zeros(n); pp[int(2.4 * SR):int(2.4 * SR) + len(pop)] += pop; pp[int(3.6 * SR):int(3.6 * SR) + len(pop)] += pop * 0.8
mix = pad * 0.55 + arp * 0.7 + wh * 0.5 + pp * 0.45; mix = mix / np.abs(mix).max() * 0.85
os.makedirs("data", exist_ok=True)
with wave.open("data/audio_teste_5s.wav", "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
print("ok data/audio_teste_5s.wav", round(len(mix) / SR, 1), "s")
