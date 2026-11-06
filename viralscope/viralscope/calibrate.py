"""Calibração com os SEUS vídeos: transforma os componentes da nota em uma probabilidade real.

CSV de entrada: colunas `video` (caminho) e `target` (uma métrica real do vídeo: retenção média %,
views em 7 dias, % de visualizações vs. rolagem etc.). O vídeo é "bom" se target > limiar (padrão:
mediana do canal). Ajusta uma regressão logística (L2) sobre os componentes e relata a AUC em
leave-one-out. Só emite probabilidade com n >= 20; com menos, recusa (seria ruído).
"""
from __future__ import annotations

import csv
import json

import numpy as np

from . import scoring

FEATURES = ["hook", "body", "sustain", "no_drift", "image", "format", "loop", "captions", "audio_tech"]
MIN_N = 20


def vector(r: dict) -> list[float]:
    return [float(r["components"][k]) for k in FEATURES]


def _fit(X: np.ndarray, y: np.ndarray, l2: float = 1.0, iters: int = 60):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = np.hstack([np.ones((len(X), 1)), (X - mu) / sd])
    w = np.zeros(Z.shape[1])
    R = l2 * np.eye(Z.shape[1])
    R[0, 0] = 0
    for _ in range(iters):  # IRLS (Newton) com L2
        p = 1 / (1 + np.exp(-Z @ w))
        g = Z.T @ (p - y) + R @ w
        H = Z.T @ (Z * (p * (1 - p))[:, None]) + R + 1e-6 * np.eye(len(w))
        step = np.linalg.solve(H, g)
        w -= step
        if np.max(np.abs(step)) < 1e-8:
            break
    return w, mu, sd


def _predict(w, mu, sd, X):
    Z = np.hstack([np.ones((len(X), 1)), (np.atleast_2d(X) - mu) / sd])
    return 1 / (1 + np.exp(-Z @ w))


def auc(y: np.ndarray, s: np.ndarray) -> float:
    pos, neg = s[y == 1], s[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    cmp = (pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
    return float(cmp / (len(pos) * len(neg)))


def fit_arrays(X: np.ndarray, target: np.ndarray, threshold: float | None = None) -> dict:
    n = len(target)
    if n < MIN_N:
        raise ValueError(f"Só {n} vídeos: precisa de pelo menos {MIN_N} (idealmente 50+) para calibrar. "
                         "Com menos, qualquer 'probabilidade' seria ruído.")
    thr = float(np.median(target)) if threshold is None else float(threshold)
    y = (target > thr).astype(float)
    if y.sum() < 5 or (n - y.sum()) < 5:
        raise ValueError("Poucos exemplos de uma das classes (>=5 de cada); mude o limiar ou traga mais vídeos.")
    loo = np.zeros(n)
    for i in range(n):
        m = np.arange(n) != i
        w, mu, sd = _fit(X[m], y[m])
        loo[i] = _predict(w, mu, sd, X[i:i + 1])[0]
    w, mu, sd = _fit(X, y)
    a = auc(y, loo)
    return {"features": FEATURES, "w": w.tolist(), "mu": mu.tolist(), "sd": sd.tolist(), "threshold": thr,
            "n": int(n), "auc_loo": a, "positives": int(y.sum())}


def fit(csv_path: str, out_path: str, threshold: float | None = None, platform: str = "shorts") -> dict:
    X, t = [], []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            X.append(vector(scoring.analyze(row["video"], platform=platform, keyframes=False)))
            t.append(float(row["target"]))
    try:
        model = fit_arrays(np.array(X), np.array(t), threshold)
    except ValueError as e:
        raise SystemExit(str(e))
    json.dump(model, open(out_path, "w"), indent=2)
    print(f"{model['n']} vídeos · limiar do alvo = {model['threshold']:.4g} · AUC leave-one-out = {model['auc_loo']:.2f}")
    if model["auc_loo"] < 0.6:
        print("Aviso: AUC baixa; esses sinais explicam pouco o seu alvo. Não confie na probabilidade.")
    print(f"Modelo salvo em {out_path}")
    return model


def apply(model: dict, r: dict) -> dict:
    w, mu, sd = np.array(model["w"]), np.array(model["mu"]), np.array(model["sd"])
    p = float(_predict(w, mu, sd, np.array([vector(r)]))[0])
    return {"p": p, "auc_loo": float(model["auc_loo"]), "n": int(model["n"]), "threshold": float(model["threshold"])}
