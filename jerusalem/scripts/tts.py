"""Piper pt_BR (sherpa-onnx): sintetiza cada trecho com sua velocidade (s>1 = mais lento, p/ ênfase) e grava out/voice/<id>.wav + timing_raw.json."""
import json, sys, wave, numpy as np, sherpa_onnx
model_dir, out_dir = sys.argv[1], sys.argv[2]
def engine(scale):
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
        model=f"{model_dir}/pt_BR-faber-medium.onnx", tokens=f"{model_dir}/tokens.txt", data_dir=f"{model_dir}/espeak-ng-data",
        length_scale=scale, noise_scale=0.55, noise_scale_w=0.6), num_threads=4))
    return sherpa_onnx.OfflineTts(cfg)
GLOBAL = 1.5  # Faber é muito rápido; 1.5 leva o total a ~155 WPM com as pausas
cache = {}
lines = json.load(open("scripts/narration.json")); res = []
def trim(s, sr):
    idx = np.where(np.abs(s) > 0.012)[0]
    return s[max(idx[0] - int(.02 * sr), 0): idx[-1] + int(.04 * sr)]
FLUID = 1.08      # fala contínua: uma síntese por frase, sem cortes de velocidade; ~165 WPM com as pausas
for l in lines:
    text = " ".join(p["t"] for p in l["parts"]); sr = 22050
    if FLUID not in cache: cache[FLUID] = engine(FLUID)
    a = cache[FLUID].generate(text, sid=0, speed=1.0); sr = a.sample_rate
    s = trim(np.array(a.samples, np.float32), sr)
    with wave.open(f"{out_dir}/{l['id']}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes())
    res.append({"id": l["id"], "gap": min(l.get("gap", 0.12), 0.2), "parts": [{"text": text, "t0": 0.0, "t1": len(s) / sr}], "dur": len(s) / sr, "sr": sr, "text": text})
    print(l["id"], round(len(s) / sr, 2), flush=True)
json.dump(res, open(f"{out_dir}/timing_raw.json", "w"), ensure_ascii=False, indent=1)
