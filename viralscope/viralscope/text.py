"""Transcrição (opcional), ritmo de fala e análise do gancho falado/escrito.

A pontuação do gancho é uma HEURÍSTICA de mecanismos (vocabulário), não um modelo treinado.
Os mecanismos vêm de taxonomias públicas de gancho (curiosidade, contrário, pergunta, número,
prova, dor, história, autoridade, urgência, 'você'); os pesos são priors editáveis.
"""
from __future__ import annotations

import os
import re

import numpy as np

# ---------------------------------------------------------------- transcrição
_TS = re.compile(r"(\d+):(\d+):(\d+)[.,](\d+)|(\d+):(\d+)[.,](\d+)")


def _to_sec(m: re.Match) -> float:
    g = m.groups()
    if g[0] is not None:
        return int(g[0]) * 3600 + int(g[1]) * 60 + int(g[2]) + int(g[3]) / 10 ** len(g[3])
    return int(g[4]) * 60 + int(g[5]) + int(g[6]) / 10 ** len(g[6])


def parse(src: str) -> list[tuple[float | None, float | None, str]]:
    """Aceita caminho de .srt/.vtt/.txt ou o próprio texto. Retorna [(início, fim, texto)]."""
    raw = open(src, encoding="utf-8").read() if os.path.isfile(src) else src
    cues = []
    for block in re.split(r"\n\s*\n", raw.strip()):
        lines = [l for l in block.splitlines() if l.strip()]
        for i, line in enumerate(lines):
            if "-->" in line:
                a, b = line.split("-->")[:2]
                ma, mb = _TS.search(a), _TS.search(b)
                if ma and mb:
                    text = " ".join(lines[i + 1:])
                    text = re.sub(r"<[^>]+>", "", text)
                    cues.append((_to_sec(ma), _to_sec(mb), text))
                break
    if cues:
        return cues
    return [(None, None, " ".join(raw.split()))]


def transcribe(path: str):
    """faster-whisper ou openai-whisper, se instalados. Senão, None."""
    try:
        from faster_whisper import WhisperModel  # type: ignore
        model = WhisperModel("small", compute_type="int8")
        segs, _ = model.transcribe(path)
        return [(s.start, s.end, s.text.strip()) for s in segs]
    except Exception:
        pass
    try:
        import whisper  # type: ignore
        res = whisper.load_model("small").transcribe(path)
        return [(s["start"], s["end"], s["text"].strip()) for s in res["segments"]]
    except Exception:
        return None


def words_per_second(cues, seconds: int) -> np.ndarray | None:
    if not cues or cues[0][0] is None:
        return None
    w = np.zeros(seconds)
    for a, b, text in cues:
        n = len(text.split())
        dur = max(b - a, 0.2)
        for s in range(int(a), min(int(np.ceil(b)), seconds)):
            lo, hi = max(a, s), min(b, s + 1)
            w[s] += n * max(0.0, hi - lo) / dur
    return w


def opening_text(cues, seconds_limit: float = 4.0) -> str:
    """Texto dito nos primeiros segundos (ou a primeira frase, se a transcrição não tem tempos)."""
    if not cues:
        return ""
    if cues[0][0] is None:
        return re.split(r"(?<=[.!?])\s+", cues[0][2])[0]
    return " ".join(t for a, b, t in cues if a < seconds_limit)


def first_word_time(cues) -> float | None:
    if not cues or cues[0][0] is None:
        return None
    return float(min(a for a, _, t in cues if t.strip()))


# ----------------------------------------------------------- gancho (heurística)
MECHANISMS = {
    "pergunta": (r"\?|^(por que|porque|como|qual|quais|quem|quando|onde|você sabia|vc sabia|sabe |"
                 r"what|why|how|who|when|did you|do you|are you|is it)\b", 0.14),
    "número/especificidade": (r"\d|\b(r\$|us\$|%|por cento|mil|milhão|milhões|million|thousand)\b", 0.14),
    "contrário/mito": (r"\b(não|nunca|pare de|para de|ninguém|mito|erro|errado|errada|jamais|mentira|"
                       r"stop|never|don't|dont|myth|mistake|wrong|nobody|lie|lying)\b", 0.14),
    "fala com 'você'": (r"\b(você|vc|voce|seu|sua|seus|suas|te|you|your|you're)\b", 0.10),
    "lacuna de curiosidade": (r"(segredo|ninguém te conta|ninguém fala|o que acontece|descobri|a verdade|"
                              r"por isso|o motivo|o real motivo|escondid|secret|nobody tells|what happens|"
                              r"the truth|here's why|here is why|hidden|what they don't)", 0.18),
    "dor/aposta": (r"\b(perder|perdendo|perdi|problema|cansad[oa]|medo|culpa|falha|falhar|quebrar|quebrou|"
                   r"arruinar|prejuízo|lose|losing|lost|problem|tired|afraid|fail|failing|ruin|broke)\b", 0.08),
    "prova/resultado": (r"\b(testei|provei|resultado|em \d+|consegui|ganhei|fiz|funcionou|prova|"
                        r"i tested|i tried|proof|result|worked|made \$)\b", 0.10),
    "história/confissão": (r"\b(eu (era|fui|fiz|perdi|achava|quase)|aconteceu|confesso|minha vez|"
                           r"i was|i used to|i almost|confession|happened)\b", 0.08),
    "autoridade": (r"\b(anos de|especialista|cientistas?|estudo|pesquisa|engenheir[oa]|médic[oa]|"
                   r"years of|expert|scientists?|study|research|engineer|doctor)\b", 0.06),
    "urgência/limite": (r"\b(agora|antes que|última chance|só hoje|em \d+ segundos|rápido|"
                        r"right now|before it|last chance|only today|in \d+ seconds|quickly)\b", 0.06),
}
_GENERIC = (r"^(oi|olá|ola|fala galera|fala pessoal|e aí|e ai|beleza|bom dia|boa tarde|boa noite|hoje eu vou|hoje vou|"
            r"neste vídeo|nesse vídeo|nesse short|bem-vindo|salve|hey guys|hi |hello|what's up|in this video|today i)")
_CTA_EARLY = r"\b(se inscreva|inscreva-se|deixa o like|curta|siga|segue|follow|subscribe|like and)\b"
_FILLER = r"^(então|tipo|é |né|hum|ahn|bom,|bem,|well,|so |um |uh)"


def score_hook_text(text: str) -> dict:
    t = text.strip().lower()
    if not t:
        return {"score": 0.0, "signals": [], "words": 0, "notes": ["Sem texto de abertura."]}
    words = len(t.split())
    hits = [k for k, (rx, _) in MECHANISMS.items() if re.search(rx, t)]
    weights = sorted((MECHANISMS[k][1] for k in hits), reverse=True)
    mech = sum(w * (0.75 ** i) for i, w in enumerate(weights))  # retorno decrescente
    score = 0.12 + mech
    notes = []
    if words <= 14:
        score += 0.14
    elif words <= 22:
        score += 0.06
    else:
        notes.append(f"Abertura longa ({words} palavras); enxugue para ~14 ou menos.")
    if re.search(_GENERIC, t):
        score -= 0.30
        notes.append("Abertura genérica (saudação/'hoje eu vou'); comece direto no conflito ou na promessa.")
    if re.search(_FILLER, t):
        score -= 0.08
        notes.append("Começa com muleta ('então', 'tipo', 'bom'); corte a primeira palavra.")
    if re.search(_CTA_EARLY, t):
        score -= 0.20
        notes.append("Pedido de inscrição/like logo na abertura; deixe para o fim.")
    if not hits:
        notes.append("Nenhum mecanismo de gancho detectado (pergunta, número, contrário, 'você', curiosidade, dor, prova).")
    return {"score": float(min(1.0, max(0.0, score))), "signals": hits, "words": words, "notes": notes}


def rank_hooks(hooks: list[str]) -> list[dict]:
    out = []
    for h in hooks:
        r = score_hook_text(h)
        r["hook"] = h
        out.append(r)
    return sorted(out, key=lambda r: -r["score"])


# ------------------------------------------------------------------ roteiro inteiro
_CTA_END = r"\b(se inscreva|inscreva-se|segue|siga|comenta|comente|curta|link|follow|subscribe|comment)\b"
_FILLER_WORDS = ("tipo", "né", "então", "assim", "basicamente", "like", "basically", "actually", "literally")


def analyze_script(text: str, wps_target: float = 2.7) -> dict:
    """Análise de roteiro (sem vídeo): gancho, ritmo estimado, frases longas, muletas, CTA."""
    clean = " ".join(text.split())
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean) if s.strip()]
    words = clean.split()
    lens = [len(s.split()) for s in sents]
    first10 = " ".join(words[: int(10 * wps_target)])
    hook = score_hook_text(sents[0] if sents else "")
    hook10 = score_hook_text(first10)
    low = clean.lower()
    filler = sum(low.count(f" {w} ") for w in _FILLER_WORDS)
    notes = list(hook["notes"])
    if lens and max(lens) > 24:
        notes.append(f"Há frase de {max(lens)} palavras; frases longas pioram a clareza falada (alvo ≤ 20).")
    if filler / max(1, len(words)) > 0.03:
        notes.append("Muitas muletas ('tipo', 'né', 'então'...); enxugue.")
    has_cta_end = bool(re.search(_CTA_END, " ".join(sents[-2:]).lower())) if sents else False
    return {
        "words": len(words), "sentences": len(sents),
        "est_duration_s": round(len(words) / wps_target, 1),
        "avg_sentence_words": round(float(np.mean(lens)), 1) if lens else 0.0,
        "hook_first_sentence": hook, "hook_first_10s": hook10,
        "filler_ratio": round(filler / max(1, len(words)), 3),
        "cta_at_end": has_cta_end,
        "notes": notes,
    }
