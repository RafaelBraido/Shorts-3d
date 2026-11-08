"""Piper pt_BR (sherpa-onnx): sintetiza cada trecho com sua velocidade (s>1 = mais lento, p/ ênfase) e grava out/voice/<id>.wav + timing_raw.json."""
import json, sys, wave, numpy as np, sherpa_onnx
model_dir, out_dir = sys.argv[1], sys.argv[2]
def engine(scale):
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
        model=f"{model_dir}/pt_BR-faber-medium.onnx", tokens=f"{model_dir}/tokens.txt", data_dir=f"{model_dir}/espeak-ng-data",
        length_scale=scale, noise_scale=0.62, noise_scale_w=0.85), num_threads=4))
    return sherpa_onnx.OfflineTts(cfg)
GLOBAL = 1.5  # Faber é muito rápido; 1.5 leva o total a ~155 WPM com as pausas
cache = {}
lines = json.load(open("scripts/narration.json")); res = []
def trim(s, sr):
    idx = np.where(np.abs(s) > 0.012)[0]
    return s[max(idx[0] - int(.02 * sr), 0): idx[-1] + int(.04 * sr)]
for l in lines:
    chunks, parts, off, sr = [], [], 0.0, 22050
    for p in l["parts"]:
        sc = round(p["s"] * GLOBAL, 2)
        if sc not in cache: cache[sc] = engine(sc)
        a = cache[sc].generate(p["t"], sid=0, speed=1.0); sr = a.sample_rate
        s = trim(np.array(a.samples, np.float32), sr)
        parts.append({"text": p["t"], "t0": off, "t1": off + len(s) / sr}); chunks.append(s); off += len(s) / sr
        pause = p.get("pause", 0.03)
        chunks.append(np.zeros(int(pause * sr), np.float32)); off += pause
    s = np.concatenate(chunks)
    with wave.open(f"{out_dir}/{l['id']}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes())
    res.append({"id": l["id"], "gap": l.get("gap", 0.28), "parts": parts, "dur": len(s) / sr, "sr": sr, "text": " ".join(p["t"] for p in l["parts"])})
    print(l["id"], round(len(s) / sr, 2), flush=True)
json.dump(res, open(f"{out_dir}/timing_raw.json", "w"), ensure_ascii=False, indent=1)
