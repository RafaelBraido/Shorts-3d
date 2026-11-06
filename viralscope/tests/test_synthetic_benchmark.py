"""Benchmark SINTÉTICO: gera vídeos com 'dinamismo' conhecido (cortes por segundo) e checa que a nota sobe
junto (Spearman). Isso valida a coerência interna dos sinais, NÃO a previsão de viralização real."""
import numpy as np
import pytest

from conftest import ff, needs_ffmpeg
from viralscope import scoring

pytestmark = needs_ffmpeg


def _spearman(a, b):
    ra, rb = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def test_score_increases_with_cut_rate(tmp_path):
    """Segmentos de cor chapada: o corte é a única variável (sem movimento próprio)."""
    palette = ["0x802020", "0x208020", "0x202080", "0x808020", "0x802080", "0x208080", "0xc0c0c0", "0x404040"]
    levels = [0, 1, 2, 4]  # cortes por segundo (aprox.) em 8 s
    scores, cutrate = [], []
    for i, n in enumerate(levels):
        k = max(1, n * 8)
        segs, parts = [], []
        for j in range(k):
            segs += ["-f", "lavfi", "-i", f"color=c={palette[j % len(palette)]}:size=270x480:rate=30:duration={8 / k:.4f}"]
            parts.append(f"[{j}:v]")
        out = tmp_path / f"v{i}.mp4"
        ff(*segs, "-f", "lavfi", "-i", "anoisesrc=a=0.3:d=8:c=pink,tremolo=f=4:d=0.9",
           "-filter_complex", "".join(parts) + f"concat=n={k}:v=1:a=0[v]", "-map", "[v]", "-map", f"{k}:a",
           "-pix_fmt", "yuv420p", "-shortest", str(out))
        r = scoring.analyze(str(out), keyframes=False)
        scores.append(r["overall"])
        cutrate.append(len(r["timeline"]["cut_times"]))
    assert _spearman(levels, cutrate) > 0.9
    assert _spearman(levels, scores) > 0.8
    assert scores[-1] > scores[0] + 4  # corte sozinho vale alguns pontos; não deve dominar a nota
