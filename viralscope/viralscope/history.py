"""Memória do canal: guarda cada vídeo analisado + resultado real e reajusta o modelo sozinho.

Quanto mais vídeos com métrica real você registra (`viralscope learn video.mp4 --target 12345`),
melhor a probabilidade fica. Com menos de 20 vídeos nada é prometido (ver calibrate.MIN_N).
Os dados ficam em $VIRALSCOPE_HOME (padrão: ./.viralscope): history.jsonl e model.json.
"""
from __future__ import annotations

import json
import os
import time

import numpy as np

from . import calibrate

NAMES = {"hook": "gancho", "body": "corpo", "sustain": "sustentação", "no_drift": "ausência de divagação",
         "image": "imagem", "format": "formato", "loop": "loop", "captions": "legendas", "audio_tech": "áudio técnico"}


def home() -> str:
    d = os.environ.get("VIRALSCOPE_HOME") or os.path.join(os.getcwd(), ".viralscope")
    os.makedirs(d, exist_ok=True)
    return d


def _paths():
    h = home()
    return os.path.join(h, "history.jsonl"), os.path.join(h, "model.json")


def load() -> list[dict]:
    p, _ = _paths()
    if not os.path.isfile(p):
        return []
    return [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()]


def record(result: dict, target: float, name: str) -> int:
    """Acrescenta (ou substitui, se o nome já existe) e devolve o total."""
    rows = [r for r in load() if r["name"] != name]
    rows.append({"name": name, "ts": int(time.time()), "target": float(target),
                 "components": result["components"], "overall": result["overall"]})
    p, _ = _paths()
    with open(p, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(rows)


def refit() -> dict:
    """Reajusta o modelo com todo o histórico. Devolve o status (sempre), com `model` se houve ajuste."""
    rows = load()
    n = len(rows)
    st = {"n": n, "need": max(0, calibrate.MIN_N - n), "model": None, "error": None, "insights": []}
    if n < calibrate.MIN_N:
        return st
    X = np.array([[r["components"][k] for k in calibrate.FEATURES] for r in rows])
    t = np.array([r["target"] for r in rows])
    try:
        m = calibrate.fit_arrays(X, t)
    except ValueError as e:
        st["error"] = str(e)
        return st
    w = np.array(m["w"][1:])
    order = np.argsort(-np.abs(w))
    st["insights"] = [(NAMES[calibrate.FEATURES[i]], float(w[i])) for i in order[:3]]
    st["model"] = m
    _, mp = _paths()
    json.dump(m, open(mp, "w"), indent=2)
    return st


def load_model() -> dict | None:
    _, mp = _paths()
    if not os.path.isfile(mp):
        return None
    m = json.load(open(mp))
    return m if m.get("features") == calibrate.FEATURES else None


def describe(st: dict) -> str:
    if st["model"] is None:
        if st["error"]:
            return f"{st['n']} vídeos registrados. {st['error']}"
        return (f"{st['n']} vídeo(s) registrado(s). Faltam {st['need']} para a primeira calibração "
                f"(mínimo {calibrate.MIN_N}); até lá nenhuma probabilidade é mostrada.")
    m = st["model"]
    q = "fraca: ainda não confie" if m["auc_loo"] < 0.6 else ("razoável" if m["auc_loo"] < 0.75 else "boa")
    lines = [f"Modelo reajustado com {m['n']} vídeos · AUC leave-one-out {m['auc_loo']:.2f} ({q})."]
    if m["auc_loo"] >= 0.6 and st["insights"]:
        lines.append("No seu canal, o que mais separa os bons dos ruins: " +
                     ", ".join(f"{n} ({'+' if v > 0 else '−'})" for n, v in st["insights"]) + ".")
    return "\n".join(lines)
