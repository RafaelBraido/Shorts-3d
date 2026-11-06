import json

import numpy as np
import pytest

from conftest import needs_ffmpeg
from viralscope import report, scoring

pytestmark = needs_ffmpeg


@pytest.fixture(scope="module")
def R(vids):
    return {k: scoring.analyze(v) for k, v in vids.items()}


def test_ordering_dynamic_over_slow_over_flat(R):
    assert R["dyn"]["overall"] > R["slow"]["overall"] > R["flat"]["overall"]
    assert R["flat"]["overall"] < 25
    assert R["slow"]["hook"] < R["dyn"]["hook"]


def test_cut_detection_is_exact_on_hard_cuts(R):
    assert R["dyn"]["timeline"]["cut_times"] and len(R["dyn"]["timeline"]["cut_times"]) == 3
    assert [round(t) for t in R["dyn"]["timeline"]["cut_times"]] == [3, 6, 9]
    assert len(R["flat"]["timeline"]["cut_times"]) == 0


def test_flat_video_gets_actionable_fixes(R):
    r = R["flat"]
    areas = {f["area"] for f in r["fixes"]}
    assert {"gancho", "áudio", "retenção"} <= areas
    assert r["drift_runs"] and r["regions"]["default_mode"] > 0.9
    assert r["fixes"] == sorted(r["fixes"], key=lambda f: -f["priority"])


def test_slow_start_is_flagged_with_time_range(R):
    gancho = [f for f in R["slow"]["fixes"] if f["area"] == "gancho"]
    assert gancho and gancho[0]["time"] == [0, 3]


def test_no_audio_video(R):
    r = R["noaudio"]
    assert r["regions"]["auditory"] is None and r["components"]["audio_tech"] == 0.0
    assert any("não tem áudio" in f["text"] for f in r["fixes"])


def test_black_start_detected(R):
    assert R["blackstart"]["measured"] and any("começa preto" in f["text"] for f in R["blackstart"]["fixes"])
    assert not any("começa preto" in f["text"] for f in R["dyn"]["fixes"])


def test_landscape_penalized_in_format(R):
    assert R["landscape"]["format"] < R["dyn"]["format"]
    assert any("horizontal" in f["text"] for f in R["landscape"]["fixes"])


def test_blur_and_dark_lower_image_component(R, vids):
    base = scoring.analyze(vids["noaudio"])
    assert R["blur"]["components"]["image"] < base["components"]["image"]
    assert R["dark"]["components"]["image"] < base["components"]["image"]
    assert any("escura" in f["text"] for f in R["dark"]["fixes"])


def test_captions_component_and_unsafe_zone(R):
    assert R["caption"]["components"]["captions"] > R["nocaption"]["components"]["captions"] + 0.3
    assert any("sem som" in f["text"] or "legendas" in f["text"] for f in R["nocaption"]["fixes"])
    assert any("interface" in f["text"] for f in R["unsafe"]["fixes"])
    assert not any("interface" in f["text"] for f in R["caption"]["fixes"])


def test_speech_pace_is_measured_without_transcript(R):
    m = {x["name"]: x["value"] for x in R["speech"]["measured"]}
    assert abs(m["Ritmo de fala (envelope de voz)"] - 5.5) < 1.0
    assert R["speech"]["language_source"].startswith("ritmo de voz")


def test_transcript_changes_language_source_and_adds_hook_text(vids):
    srt = "1\n00:00:00,400 --> 00:00:03,000\nVocê está errando isso há 8 meses?\n\n2\n00:00:03,000 --> 00:00:07,000\nVeja o que mudou quando eu testei\n"
    r = scoring.analyze(vids["speech"], transcript=srt)
    assert r["language_source"] == "transcrição" and r["hook_text"]["score"] > 0.5
    weak = scoring.analyze(vids["speech"], transcript="1\n00:00:00,400 --> 00:00:03,000\nOi pessoal hoje eu vou falar\n")
    assert r["hook"] > weak["hook"]


def test_platform_changes_format_notes(vids):
    long_ok = scoring.analyze(vids["dyn"], platform="shorts")
    assert long_ok["meta"]["platform"] == "YouTube Shorts"
    assert scoring.analyze(vids["dyn"], platform="reels")["meta"]["platform"] == "Instagram Reels"
    with pytest.raises(ValueError):
        scoring.analyze(vids["dyn"], platform="orkut")


def test_ranges_and_schema(R):
    for r in R.values():
        assert 0 <= r["overall"] <= 100
        for k, x in r["components"].items():
            assert 0 <= x <= 1, k
        for k, x in r["regions"].items():
            assert x is None or 0 <= x <= 1, k
        n = r["meta"]["duration"]
        assert abs(len(r["timeline"]["engagement"]) - n) <= 1
        assert r["schema"] == "viralscope/2"
        names = {m["name"] for m in r["measured"]}
        assert "Cortes por minuto" in names
        assert {m["kind"] for m in r["measured"]} <= {"medido", "proxy", "heurística"}


def test_reports_render(R):
    r = R["dyn"]
    js = json.loads(report.to_json(r))
    assert "keyframes" not in js and js["overall"] == r["overall"]
    hf = report.to_higgsfield(r, "file:///x.html").splitlines()
    assert hf[0].startswith("Overall score: ") and hf[1].startswith("Peak hook: ") and hf[2].startswith("Sustain: ")
    for label in ("Visual:", "Auditory:", "Language:", "Attention:", "Default Mode:", "Strongest region:", "Open report: file:///x.html"):
        assert any(l.startswith(label) for l in hf), label
    assert any("lower is better" in l for l in hf)
    html = report.to_html(r, "meu video")
    assert "<svg" in html and "data:image/jpeg;base64" in html and "meu video" in html and "prefers-color-scheme" in html
    txt = report.to_text(r)
    assert "Nota geral" in txt and "não atividade cerebral" in txt


def test_flat_report_has_risk_line(R):
    assert "Risk: Default Mode is high" in report.to_higgsfield(R["flat"])


def test_no_false_cuts_on_smooth_dark_video(R):
    """Regressão: fundo escuro com cor variando suavemente não pode gerar cortes."""
    for k in ("caption", "nocaption", "unsafe", "flat"):
        assert len(R[k]["timeline"]["cut_times"]) == 0, k
