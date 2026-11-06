"""Junta os sinais medidos em: nota geral, gancho, sustentação, cinco "regiões" e correções priorizadas.

O QUE É MEDIDO e o que é HEURÍSTICA:
  * Medido no arquivo: cortes, movimento (fluxo óptico), nitidez, exposição, contraste, cor, saliência,
    rosto (Haar), texto na tela (proxy morfológico), loudness EBU R128, picos, silêncio, ataques,
    ritmo de fala por envelope de voz, semelhança fim-início.
  * Heurística (priors editáveis, NÃO treinados com dados reais): como esses sinais viram canais 0..1,
    os pesos da nota geral, os alvos (ex.: ~6 sílabas/s, -14 LUFS) e os limiares de aviso.
  * Calibração: `viralscope calibrate` ajusta uma probabilidade com os SEUS vídeos + métrica real.

As "regiões" (Visual, Auditory, Language, Attention, Default Mode) repetem os NOMES do relatório do
Virality Predictor da Higgsfield, mas aqui são proxies de sinais do arquivo. Não medem atividade cerebral.
"""
from __future__ import annotations

import numpy as np

from . import audio as audio_mod
from . import profiles
from . import text as text_mod
from . import video as video_mod
from .frames import sat

HOOK_SECONDS = 3

DEFAULT_WEIGHTS = {
    # canais -> engajamento por segundo
    "visual": 0.30, "auditory": 0.25, "language": 0.15, "attention": 0.30,
    # nota geral
    "hook": 0.30, "body": 0.20, "sustain": 0.12, "no_drift": 0.10, "image": 0.08,
    "format": 0.07, "loop": 0.05, "captions": 0.04, "audio_tech": 0.04,
}
OVERALL_KEYS = ["hook", "body", "sustain", "no_drift", "image", "format", "loop", "captions", "audio_tech"]


# ------------------------------------------------------------------ utilidades
def _ema(x: np.ndarray, alpha: float) -> np.ndarray:
    out = np.zeros(len(x))
    for i, v in enumerate(x):
        out[i] = v if i == 0 else alpha * v + (1 - alpha) * out[i - 1]
    return out


def _smooth(x: np.ndarray, k: int = 3) -> np.ndarray:
    if len(x) < k:
        return x.copy()
    pad = np.pad(x, (k // 2, k // 2), mode="edge")
    return np.convolve(pad, np.ones(k) / k, mode="valid")


def _runs(mask: np.ndarray, min_len: int):
    runs, start = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                runs.append((start, i))
            start = None
    return runs


def _pace(r: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Sobe de 0 a 1 até `lo`, fica em 1 até `hi`, cai até 0,4 em 1,6*hi."""
    r = np.asarray(r, dtype=float)
    up = np.clip(r / lo, 0, 1)
    down = np.where(r > hi, 1.0 - 0.6 * np.clip((r - hi) / (0.6 * hi), 0, 1), 1.0)
    return up * down


def label(score: float) -> str:
    if score >= 75:
        return "forte"
    if score >= 55:
        return "bom, com pontos a melhorar"
    if score >= 35:
        return "mediano"
    return "fraco"


# ----------------------------------------------------------------------- formato
def format_score(meta: dict, prof: dict) -> tuple[float, list[str]]:
    notes, s = [], 1.0
    w, h, d = meta["width"], meta["height"], meta["duration"]
    if h < w:
        s -= 0.5
        notes.append(f"Vídeo horizontal ({w}x{h}); {prof['nome']} pede vertical 9:16.")
    elif abs(w / h - prof["aspect"]) > 0.05:
        s -= 0.2
        notes.append(f"Proporção {w}:{h} diferente de 9:16.")
    if min(w, h) < 720:
        s -= 0.15
        notes.append("Resolução baixa (menos de 720 px no lado menor); suba para 1080x1920.")
    lo, hi = prof["ideal_dur"]
    if d > prof["max_dur"]:
        s -= 0.5
        notes.append(f"Acima do limite de {prof['nome']} ({prof['max_dur']:.0f} s).")
    elif d > hi:
        s -= min(0.3, 0.3 * (d - hi) / hi)
        notes.append(f"Duração {d:.0f} s acima da faixa em que o formato costuma segurar ({lo:.0f}–{hi:.0f} s); corte o que não avança a história.")
    elif d < 6:
        s -= 0.3
        notes.append("Muito curto (menos de 6 s).")
    elif d < lo:
        s -= 0.1
    if meta.get("fps") and meta["fps"] < 24:
        s -= 0.05
        notes.append(f"Taxa de quadros baixa ({meta['fps']:.0f} fps).")
    return float(max(0.0, s)), notes


# ------------------------------------------------------------------- análise
def analyze(path: str, transcript: str | None = None, do_transcribe: bool = False,
            weights: dict | None = None, platform: str = "shorts", keyframes: bool = True) -> dict:
    W = {**DEFAULT_WEIGHTS, **(weights or {})}
    prof = profiles.get(platform)
    meta = video_mod.probe(path)
    v = video_mod.extract(path, meta, keyframes=keyframes,
                          safe_bottom=prof["safe_bottom"], safe_right=prof["safe_right"])
    S = v["seconds"]
    a = audio_mod.extract(path, S) if meta["has_audio"] else None

    cues = None
    if transcript:
        cues = text_mod.parse(transcript)
    elif do_transcribe:
        cues = text_mod.transcribe(path)
    wps = text_mod.words_per_second(cues, S) if cues else None
    return build(v, a, meta, cues, wps, W, prof)


def build(v: dict, a: dict | None, meta: dict, cues, wps, W: dict, prof: dict) -> dict:
    S = v["seconds"]
    z = np.zeros(S)

    # ------------------------------ canal Visual
    motion01 = sat(v["motion"], 0.12)
    cut_ev = np.minimum(1.0, v["cuts"])
    cut_ev = np.maximum(cut_ev, 0.6 * np.concatenate([[0.0], cut_ev[:-1]]))
    subject = np.array(v["subject"])
    if v["face"] is not None:
        subject = np.maximum(subject, 0.75 * v["face"])
    visual = np.clip(0.36 * motion01 + 0.20 * cut_ev + 0.16 * v["score"] + 0.12 * v["colorfulness"] + 0.16 * subject, 0, 1)

    # ------------------------------ canal Auditory
    ebu = a.get("ebu") if a else None
    if a is not None:
        loud01 = np.clip((a["loud_db"] + 45.0) / 27.0, 0, 1)
        onset01 = np.minimum(1.0, a["onsets"] / 2.0)
        presence = np.maximum(a["voice_ratio"], sat(a["flux"], 0.5)) * (~a["silent"])
        auditory = np.clip(0.45 * loud01 + 0.30 * onset01 + 0.25 * presence, 0, 1)
    else:
        auditory = z.copy()

    # ------------------------------ canal Language
    language, language_src = None, "ausente"
    if wps is not None:
        language = _smooth(_pace(wps, 1.8, 3.4))
        language_src = "transcrição"
    elif a is not None and a["speech_seconds"] >= 2:
        language = _smooth(_pace(a["syll_rate"], 4.0, 7.5))
        language_src = "ritmo de voz medido no áudio"
    elif a is not None:
        language = z.copy()
        language_src = "sem fala detectada"

    # ------------------------------ canal Attention (quebras de padrão)
    med = np.array([np.median(v["motion"][max(0, i - 2):i + 3]) for i in range(S)])
    spike = np.clip((v["motion"] - med) / (med + 0.05), 0, 1)
    hist01 = np.clip(v["hist_dist"] / 0.4, 0, 1)
    if a is not None:
        att_raw = 0.35 * cut_ev + 0.20 * spike + 0.15 * hist01 + 0.20 * np.minimum(1.0, a["onsets"]) + 0.10 * sat(a["flux"], 0.5)
    else:
        att_raw = 0.45 * cut_ev + 0.30 * spike + 0.25 * hist01
    attention = np.clip(_ema(np.clip(att_raw, 0, 1), 0.6), 0, 1)

    chan = {"visual": visual, "attention": attention}
    if a is not None:
        chan["auditory"] = auditory
    if language is not None:
        chan["language"] = language
    wsum = sum(W[k] for k in chan)
    engagement = sum(W[k] * chan[k] for k in chan) / wsum
    e_sm = _smooth(engagement)

    # ------------------------------ Default Mode: risco de divagação
    mindwander = _smooth(np.clip((0.40 - e_sm) / 0.40, 0, 1))
    default_mode = float(np.mean(mindwander))
    low = (e_sm < 0.30) & (attention < 0.18)
    drift_runs = _runs(low, 3)
    drift = float(sum(b - s0 for s0, b in drift_runs) / S)

    # ------------------------------ gancho
    n_hook = min(HOOK_SECONDS, S)
    hook_dyn = float(np.mean(engagement[:n_hook]))
    ff_q = float(np.mean(v["score"][: max(1, min(2, S))]))
    if v["start_black_s"] > 0.3:
        ff_q *= 0.5
    parts = {"dyn": (0.55, hook_dyn), "frame": (0.20, ff_q)}
    first_sound = a["first_sound_s"] if a else None
    if a is not None:
        audio_start = 0.0 if first_sound is None else float(1.0 - np.clip((first_sound - 0.3) / 1.7, 0, 1))
        parts["audio"] = (0.10, audio_start)
    else:
        audio_start = 0.0
        parts["audio"] = (0.10, 0.0)
    hook_info = None
    if cues:
        hook_info = text_mod.score_hook_text(text_mod.opening_text(cues))
        parts["text"] = (0.15, hook_info["score"])
    hook = float(sum(w * x for w, x in parts.values()) / sum(w for w, _ in parts.values()))
    peak_sec = int(np.argmax(engagement[: min(5, S)]))
    peak_hook = float(engagement[peak_sec])

    body_arr = e_sm[n_hook:] if S > n_hook else e_sm
    body = float(np.mean(engagement[n_hook:] if S > n_hook else engagement))
    sustain = float(np.mean(np.clip(body_arr / 0.45, 0, 1)))

    # ------------------------------ imagem, legendas, áudio técnico, formato, loop
    image_q = float(np.mean(v["score"]))
    text_sec = float(np.mean(v["text_ratio"] > 0.015))
    captions = float(np.clip(text_sec / 0.6, 0, 1))
    audio_tech = 0.0
    if a is not None:
        target = prof["target_lufs"]
        lufs_score = 0.5 if not ebu else float(np.clip(1.0 - max(0.0, target - ebu["lufs"]) / 12.0 - max(0.0, ebu["lufs"] - (target + 6)) / 12.0, 0, 1))
        audio_tech = float(np.clip(lufs_score - 4.0 * a["clip_ratio"], 0, 1))
    fmt, fmt_notes = format_score(meta, prof)
    loop = float(v["loop_similarity"])
    if a is not None:
        loop = 0.7 * loop + 0.3 * a["loop_audio"]

    comps = {"hook": hook, "body": body, "sustain": sustain, "no_drift": 1 - drift, "image": image_q,
             "format": fmt, "loop": loop, "captions": captions, "audio_tech": audio_tech}
    overall = 100.0 * sum(W[k] * comps[k] for k in OVERALL_KEYS) / sum(W[k] for k in OVERALL_KEYS)
    overall = float(np.clip(overall, 0, 100))

    regions = {"visual": float(np.mean(visual)), "auditory": float(np.mean(auditory)) if a is not None else None,
               "language": float(np.mean(language)) if language is not None else None,
               "attention": float(np.mean(attention)), "default_mode": default_mode}

    res = {
        "schema": "viralscope/2",
        "overall": round(overall, 1), "verdict": label(overall),
        "hook": round(hook, 3), "peak_hook_pct": round(peak_hook * 100), "peak_hook_second": peak_sec,
        "body": round(body, 3), "sustain": round(sustain, 3), "drift_risk": round(drift, 3),
        "format": round(fmt, 3), "loop": round(loop, 3),
        "regions": {k: (None if x is None else round(x, 3)) for k, x in regions.items()},
        "components": {k: round(x, 4) for k, x in comps.items()},
        "language_source": language_src,
        "hook_text": hook_info,
        "drift_runs": [(int(s0), int(b)) for s0, b in drift_runs],
        "timeline": {"engagement": engagement.round(3).tolist(), "visual": visual.round(3).tolist(),
                     "auditory": auditory.round(3).tolist(), "attention": attention.round(3).tolist(),
                     "language": (language.round(3).tolist() if language is not None else None),
                     "default_mode": mindwander.round(3).tolist(),
                     "cuts": v["cuts"].tolist(), "cut_times": v["cut_times"]},
        "meta": {**meta, "platform": prof["nome"], "has_transcript": bool(cues),
                 "has_face_detector": v["has_face_detector"]},
        "keyframes": v["keyframes"],
    }
    res["measured"] = _measured(v, a, ebu, meta, text_sec)
    res["fixes"] = _fixes(v, a, ebu, meta, prof, comps, res, cues, wps, hook_info, fmt_notes, audio_start, first_sound)
    return res


def _measured(v, a, ebu, meta, text_sec) -> list[dict]:
    S, d = v["seconds"], max(meta["duration"], 1e-6)
    m = [
        ("Cortes por minuto", round(len(v["cut_times"]) / d * 60, 1), "cortes/min", "medido"),
        ("Cortes nos 3 primeiros segundos", int(v["cuts"][: min(3, S)].sum()), "cortes", "medido"),
        ("Movimento médio (fluxo óptico)", round(float(np.mean(v["motion"])), 3), "larg. do quadro/s", "medido"),
        ("Nitidez (var. do Laplaciano, 320 px)", round(float(np.mean(v["sharpness_raw"])), 1), "", "medido"),
        ("Luminância média", round(float(np.mean(v["luma_mean"])), 1), "0–255", "medido"),
        ("Colorfulness (Hasler-Süsstrunk)", round(float(np.mean(v["colorfulness"])), 3), "0–1", "medido"),
        ("Foco/saliência (resíduo espectral)", round(float(np.mean(v["focus"])), 3), "0–1", "medido"),
        ("Posição do ponto de interesse", round(float(np.mean(v["placement"])), 3), "0–1", "heurística"),
        ("Segundos com texto na tela", f"{text_sec * 100:.0f}%", "", "proxy"),
        ("Início preto/fade", round(v["start_black_s"], 2), "s", "medido"),
    ]
    if v["face"] is not None:
        m.append(("Segundos com rosto frontal", f"{float(np.mean(v['face'])) * 100:.0f}%", "", "medido"))
    if a is not None:
        m += [
            ("Primeiro som", None if a["first_sound_s"] is None else round(a["first_sound_s"], 2), "s", "medido"),
            ("Primeira sílaba de fala", None if a["first_speech_s"] is None else round(a["first_speech_s"], 2), "s", "medido"),
            ("Ritmo de fala (envelope de voz)", round(a["speech_rate_syl_s"], 1), "sílabas/s", "proxy"),
            ("Silêncio", f"{a['silence_ratio'] * 100:.0f}%", "", "medido"),
            ("Clipping (amostras estouradas)", f"{a['clip_ratio'] * 100:.2f}%", "", "medido"),
        ]
        if ebu:
            m += [("Loudness integrada", ebu["lufs"], "LUFS", "medido"),
                  ("Pico real", ebu["true_peak_db"], "dBTP", "medido")]
    return [{"name": n, "value": val, "unit": u, "kind": k} for n, val, u, k in m]


def _fixes(v, a, ebu, meta, prof, comps, res, cues, wps, hook_info, fmt_notes, audio_start, first_sound) -> list[dict]:
    out: list[dict] = []
    S = v["seconds"]
    nh = min(HOOK_SECONDS, S)

    def add(prio, area, text, t0=None, t1=None):
        out.append({"priority": float(prio), "area": area, "text": text,
                    "time": None if t0 is None else [t0, t1 if t1 is not None else t0]})

    if comps["hook"] < 0.40:
        add(0.95, "gancho", "Gancho fraco nos 3 primeiros segundos: abra com corte, movimento ou impacto sonoro já no segundo 0.", 0, nh)
    if v["cuts"][:nh].sum() == 0 and float(np.mean(v["motion"][:nh])) < 0.03:
        add(0.9, "gancho", "Os 3 primeiros segundos estão quase estáticos (sem corte e com pouco movimento).", 0, nh)
    if v["start_black_s"] > 0.3:
        add(0.85, "imagem", f"O vídeo começa preto/em fade por {v['start_black_s']:.1f} s; comece já no primeiro quadro útil.", 0, 1)
    if float(np.mean(v["score"][:2])) < 0.35:
        add(0.7, "imagem", "O primeiro quadro tem pouca qualidade (nitidez, exposição ou enquadramento); é o que aparece antes de o espectador decidir.", 0, 1)
    if float(np.mean(v["sharpness_raw"][:nh])) < 40:
        add(0.55, "imagem", "Imagem pouco nítida no início (foco, compressão ou resolução baixa).", 0, nh)
    if float(np.mean(v["luma_mean"])) < 55:
        add(0.5, "imagem", "Imagem muito escura em média; levante a exposição.")
    elif float(np.mean(v["luma_mean"])) > 200:
        add(0.5, "imagem", "Imagem muito clara/estourada em média; reduza a exposição.")
    if float(np.mean(v["focus"][:nh])) < 0.25 and float(np.mean(v["motion"][:nh])) < 0.05:
        add(0.35, "imagem", "O início não tem um ponto de interesse claro; faça o sujeito dominar o quadro.", 0, nh)
    if a is None:
        add(0.8, "áudio", "O vídeo não tem áudio; a maioria dos Shorts depende de voz ou trilha para segurar atenção.")
    else:
        if first_sound is None or first_sound > 0.8:
            add(0.85, "áudio", "Silêncio no início: comece com voz ou som já no primeiro segundo.", 0, 1)
        if a["first_speech_s"] is not None and a["first_speech_s"] > 1.5:
            add(0.6, "áudio", f"A voz só entra em {a['first_speech_s']:.1f} s; antecipe a primeira frase.", 0, int(a["first_speech_s"]) + 1)
        if ebu and ebu["lufs"] < prof["target_lufs"] - 5:
            add(0.55, "áudio", f"Áudio baixo ({ebu['lufs']:.1f} LUFS); ideal perto de {prof['target_lufs']:.0f} LUFS.")
        if a["clip_ratio"] > 0.005 or (ebu and ebu["true_peak_db"] is not None and ebu["true_peak_db"] > -0.5):
            add(0.5, "áudio", "Áudio estourando (clipping); abaixe o ganho ou use limitador.")
        if a["speech_seconds"] >= 3:
            r = a["speech_rate_syl_s"]
            if r > 8.5:
                add(0.4, "linguagem", f"Fala muito rápida (~{r:.1f} sílabas/s); ideal entre 5 e 7,5.")
            elif r < 4.0:
                add(0.4, "linguagem", f"Fala lenta (~{r:.1f} sílabas/s); ideal entre 5 e 7,5.")
        if a["silence_ratio"] > 0.35:
            add(0.45, "áudio", f"{a['silence_ratio'] * 100:.0f}% do vídeo está em silêncio; preencha com trilha ou efeitos.")
    for s0, s1 in res["drift_runs"]:
        add(0.8, "retenção", f"Risco de a atenção cair entre {s0}s e {s1}s: sem corte, movimento ou som novo. Insira uma quebra de padrão.", s0, s1)
    if wps is not None:
        wpm = float(wps.sum() / max(1, (wps > 0).sum()) * 60)
        if wpm > 200:
            add(0.4, "linguagem", f"Fala muito rápida (~{wpm:.0f} palavras/min); ideal entre 140 e 180.")
        elif wpm < 110:
            add(0.4, "linguagem", f"Fala lenta (~{wpm:.0f} palavras/min); ideal entre 140 e 180.")
    if hook_info:
        for n in hook_info["notes"]:
            add(0.65, "gancho", n, 0, nh)
    if comps["captions"] < 0.15 and (cues or (a and a["speech_seconds"] >= 3)):
        add(0.45, "legenda", "Quase não há texto na tela, mas há fala: grande parte do público assiste sem som; adicione legendas.")
    txt = v["text_ratio"] > 0.015
    if txt.any() and float(np.mean(v["text_unsafe"][txt])) > 0.4:
        add(0.5, "legenda", f"Boa parte do texto fica na zona coberta pela interface de {prof['nome']} (base/lateral direita); suba a legenda.")
    for n in fmt_notes:
        add(0.5, "formato", n)
    if comps["loop"] < 0.4:
        add(0.2, "retenção", "O final não conversa com o começo; um fecho que reaproveita o primeiro quadro/som incentiva rever (loop).")
    out.sort(key=lambda f: -f["priority"])
    return out
