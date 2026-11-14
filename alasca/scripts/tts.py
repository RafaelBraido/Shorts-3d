"""Voz Piper pt_BR (faber) suavizada: uma síntese por frase, pronúncia corrigida, fades nas pontas e tratamento de áudio
(menos aspereza metálica e um toque de sala), sem cortar o fim das palavras. Uso: python3 scripts/tts.py <pasta do modelo piper> out/voice"""
import json, re, subprocess, sys, wave, numpy as np, sherpa_onnx
model_dir, out_dir = sys.argv[1], sys.argv[2]
LENGTH, NOISE, NOISE_W = 1.12, 0.5, 0.7
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
    model=f"{model_dir}/pt_BR-faber-medium.onnx", tokens=f"{model_dir}/tokens.txt", data_dir=f"{model_dir}/espeak-ng-data",
    length_scale=LENGTH, noise_scale=NOISE, noise_scale_w=NOISE_W), num_threads=4))
tts = sherpa_onnx.OfflineTts(cfg)
RESPELL = {"Neymar": "Neimar", "Alasca": "Alasca", "Alascas": "Alascas"}      # só na síntese; as legendas mantêm a grafia correta
def say(t):
    for k, v in RESPELL.items(): t = re.sub(rf"\b{k}\b", v, t)
    return t
FX = ("highpass=f=70,lowpass=f=9500,equalizer=f=220:t=q:w=1:g=2,equalizer=f=3400:t=q:w=1.2:g=-2.5,"
      "acompressor=threshold=-20dB:ratio=2.2:attack=15:release=160:makeup=2,aecho=0.85:0.55:28:0.10")
res = []
for l in json.load(open("scripts/narration.json")):
    text = say(" ".join(p["t"] for p in l["parts"]))
    a = tts.generate(text, sid=0, speed=1.0); sr = a.sample_rate; s = np.array(a.samples, np.float32)
    idx = np.where(np.abs(s) > 0.003)[0]; s = s[max(idx[0] - int(.03 * sr), 0): idx[-1] + int(.12 * sr)]   # limiar baixo + cauda longa: não corta fim de palavra
    f = int(.02 * sr); s[:f] *= np.linspace(0, 1, f); s[-f * 3:] *= np.linspace(1, 0, f * 3)               # fades: sem cliques
    raw = f"{out_dir}/{l['id']}_raw.wav"
    with wave.open(raw, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", FX, f"{out_dir}/{l['id']}.wav"], check=True)
    res.append({"id": l["id"], "gap": min(l.get("gap", 0.12), 0.2), "parts": [{"text": " ".join(p["t"] for p in l["parts"]), "t0": 0.0, "t1": len(s) / sr}], "dur": len(s) / sr, "sr": sr, "text": " ".join(p["t"] for p in l["parts"])})
    print(l["id"], round(len(s) / sr, 2), flush=True)
json.dump(res, open(f"{out_dir}/timing_raw.json", "w"), ensure_ascii=False, indent=1)
