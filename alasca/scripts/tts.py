"""Voz neural Kokoro (sherpa-onnx), português do Brasil: uma síntese por frase -> out/voice/<id>.wav + timing_raw.json.
Uso: python3 scripts/tts.py <pasta kokoro-multi-lang-v1_0> out/voice [speaker=43 (pm_alex) | 42 (pf_dora) | 44 (pm_santa)] [speed=1.08]"""
import json, sys, wave, numpy as np, sherpa_onnx
D, out_dir = sys.argv[1], sys.argv[2]
SID = int(sys.argv[3]) if len(sys.argv) > 3 else 43
SPEED = float(sys.argv[4]) if len(sys.argv) > 4 else 1.08
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
    model=D + "/model.onnx", voices=D + "/voices.bin", tokens=D + "/tokens.txt", data_dir=D + "/espeak-ng-data", dict_dir=D + "/dict",
    lexicon=D + "/lexicon-us-en.txt", lang="pt-br"), num_threads=4))
tts = sherpa_onnx.OfflineTts(cfg)
def trim(s, sr):
    idx = np.where(np.abs(s) > 0.012)[0]
    return s[max(idx[0] - int(.02 * sr), 0): idx[-1] + int(.05 * sr)]
res = []
for l in json.load(open("scripts/narration.json")):
    text = " ".join(p["t"] for p in l["parts"])
    a = tts.generate(text, sid=SID, speed=SPEED); sr = a.sample_rate
    s = trim(np.array(a.samples, np.float32), sr)
    with wave.open(f"{out_dir}/{l['id']}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(s, -1, 1) * 32767).astype(np.int16).tobytes())
    res.append({"id": l["id"], "gap": min(l.get("gap", 0.12), 0.2), "parts": [{"text": text, "t0": 0.0, "t1": len(s) / sr}], "dur": len(s) / sr, "sr": sr, "text": text})
    print(l["id"], round(len(s) / sr, 2), flush=True)
json.dump(res, open(f"{out_dir}/timing_raw.json", "w"), ensure_ascii=False, indent=1)
