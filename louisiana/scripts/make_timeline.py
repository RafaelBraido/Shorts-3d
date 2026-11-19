"""Une as frases (duração real do TTS) numa linha do tempo e estima o tempo de cada palavra p/ a legenda."""
import json, re
raw = json.load(open("out/voice/timing_raw.json"))
LEAD, TAIL = 0.9, 1.0
SUBS = {
    ("h1", "um quarto"): "1/4",
    ("f1", "mil oitocentos e três"): "1803", ("f2", "dois milhões"): "2 milhões", ("f3", "quinze milhões"): "15 milhões",
    ("f3", "duzentos e vinte e dois"): "222", ("f3", "dezessete"): "17", ("c1", "dois"): "2",
}
t = LEAD; lines = []
norm = lambda s: re.sub(r"[^\wÀ-ÿ]", "", s).lower()
for i, l in enumerate(raw):
    words = []
    for p in l["parts"]:
        toks = p["text"].split(); wts = []
        for w in toks:
            core = re.sub(r"[^\wÀ-ÿ]", "", w)
            wts.append(max(len(core), 2) + (3.5 if w.endswith(",") else 0) + (3 if w.endswith((":", ".", "?", "!")) else 0))
        tot = sum(wts); c = t + p["t0"]; span = p["t1"] - p["t0"]
        for w, wt in zip(toks, wts):
            d = span * wt / tot; words.append({"w": w, "t0": round(c, 3), "t1": round(c + d, 3)}); c += d
    for (lid, phrase), shown in SUBS.items():
        if lid != l["id"]: continue
        ps = phrase.split(); out = []; k = 0
        while k < len(words):
            if [norm(x["w"]) for x in words[k:k + len(ps)]] == ps:
                tail = words[k + len(ps) - 1]["w"]; punct = re.sub(r"[\wÀ-ÿ]", "", tail)
                out.append({"w": shown + punct, "t0": words[k]["t0"], "t1": words[k + len(ps) - 1]["t1"]}); k += len(ps)
            else: out.append(words[k]); k += 1
        words = out
    lines.append({"id": l["id"], "text": l["text"], "start": round(t, 3), "dur": round(l["dur"], 3), "end": round(t + l["dur"], 3), "words": words})
    t += l["dur"] + l["gap"]
total = round(t - raw[-1]["gap"] + TAIL, 3)
json.dump({"total": total, "lines": lines}, open("out/timeline.json", "w"), ensure_ascii=False, indent=1)
for l in lines: print(l["id"], l["start"], l["end"])
print("total", total)
