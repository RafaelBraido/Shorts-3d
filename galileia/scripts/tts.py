"""Gera um wav por frase com Piper pt_BR (via sherpa-onnx) e escreve out/timing.json."""
import json, sys, wave, numpy as np, sherpa_onnx
model_dir, out_dir = sys.argv[1], sys.argv[2]
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
    model=f"{model_dir}/pt_BR-faber-medium.onnx", tokens=f"{model_dir}/tokens.txt", data_dir=f"{model_dir}/espeak-ng-data",
    length_scale=0.97, noise_scale=0.6), num_threads=4))
tts = sherpa_onnx.OfflineTts(cfg)
lines = json.load(open("scripts/narration.json"))
res = []
for l in lines:
    a = tts.generate(l["text"], sid=0, speed=1.0)
    s = np.array(a.samples, dtype=np.float32)
    # corta silêncio nas pontas
    idx = np.where(np.abs(s) > 0.01)[0]
    s = s[max(idx[0]-int(.03*a.sample_rate),0): idx[-1]+int(.12*a.sample_rate)]
    with wave.open(f"{out_dir}/{l['id']}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(a.sample_rate)
        w.writeframes((np.clip(s, -1, 1)*32767).astype(np.int16).tobytes())
    res.append({**l, "dur": len(s)/a.sample_rate, "sr": a.sample_rate})
    print(l["id"], round(len(s)/a.sample_rate, 2))
json.dump(res, open(f"{out_dir}/timing_raw.json", "w"), ensure_ascii=False, indent=1)
