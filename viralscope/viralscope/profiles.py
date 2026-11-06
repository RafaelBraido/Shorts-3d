"""Perfis de plataforma.

ATENÇÃO: são *priors* (valores iniciais razoáveis), não parâmetros estimados com dados.
Duração, zona segura de texto e loudness-alvo vêm de recomendações públicas das plataformas
e de convenção de mercado; a interface de cada app muda com o tempo. Ajuste conforme o seu canal.
"""
from __future__ import annotations

PROFILES = {
    "shorts": {
        "nome": "YouTube Shorts",
        "aspect": 9 / 16,
        "ideal_dur": (15.0, 50.0),   # faixa em que o formato costuma funcionar bem
        "max_dur": 180.0,            # limite atual do formato
        "safe_bottom": 0.22,         # fração inferior coberta por título/botões
        "safe_right": 0.14,          # coluna direita com ícones
        "target_lufs": -14.0,        # referência de normalização do YouTube
    },
    "tiktok": {
        "nome": "TikTok",
        "aspect": 9 / 16,
        "ideal_dur": (12.0, 45.0),
        "max_dur": 600.0,
        "safe_bottom": 0.25,
        "safe_right": 0.16,
        "target_lufs": -14.0,
    },
    "reels": {
        "nome": "Instagram Reels",
        "aspect": 9 / 16,
        "ideal_dur": (10.0, 45.0),
        "max_dur": 180.0,
        "safe_bottom": 0.22,
        "safe_right": 0.14,
        "target_lufs": -14.0,
    },
}


def get(name: str) -> dict:
    if name not in PROFILES:
        raise ValueError(f"Plataforma desconhecida: {name!r}. Use: {', '.join(PROFILES)}")
    return PROFILES[name]
