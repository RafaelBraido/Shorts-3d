"""Une as frases (duração real do TTS) numa linha do tempo e estima o tempo de cada palavra p/ a legenda."""
import json, re
raw = json.load(open("out/voice/timing_raw.json"))
LEAD, GAP, TAIL = 0.45, 0.34, 0.9
SUBS = {  # fala -> texto na tela
    ("s6", "duzentos e dez"): "210", ("s9", "dois"): "2",
}
t = LEAD; lines = []
for i, l in enumerate(raw):
    toks = l["text"].split()
    wts = []
    for w in toks:
        core = re.sub(r"[^\wÀ-ÿ]", "", w)
        wt = max(len(core), 2) + (3.5 if w.endswith(",") else 0) + (5 if w.endswith((":", ".", "?")) else 0) * 0.6
        wts.append(wt)
    active = l["dur"] - 0.10
    tot = sum(wts); words = []; c = t
    for w, wt in zip(toks, wts):
        d = active * wt / tot
        words.append({"w": w, "t0": round(c, 3), "t1": round(c + d, 3)}); c += d
    # substituições (junta palavras faladas em um token de tela)
    for (lid, phrase), shown in SUBS.items():
        if lid != l["id"]: continue
        ps = phrase.split(); out = []; k = 0
        norm = lambda s: re.sub(r"[^\wÀ-ÿ]", "", s).lower()
        while k < len(words):
            if [norm(x["w"]) for x in words[k:k + len(ps)]] == ps:
                tail = words[k + len(ps) - 1]["w"]; punct = re.sub(r"[\wÀ-ÿ]", "", tail)
                out.append({"w": shown + punct, "t0": words[k]["t0"], "t1": words[k + len(ps) - 1]["t1"]}); k += len(ps)
            else: out.append(words[k]); k += 1
        words = out
    lines.append({"id": l["id"], "text": l["text"], "start": round(t, 3), "dur": round(l["dur"], 3), "end": round(t + l["dur"], 3), "words": words})
    t += l["dur"] + GAP
total = round(t - GAP + TAIL, 3)
json.dump({"total": total, "lines": lines}, open("out/timeline.json", "w"), ensure_ascii=False, indent=1)
for l in lines: print(l["id"], l["start"], l["end"])
print("total", total)
