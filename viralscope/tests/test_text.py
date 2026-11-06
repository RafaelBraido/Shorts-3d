from viralscope import text


def test_hook_text_rewards_mechanisms_and_penalizes_greeting():
    weak = text.score_hook_text("Oi pessoal, hoje eu vou falar sobre rotina matinal")
    strong = text.score_hook_text("Você está errando isso há 8 meses e ninguém te conta?")
    assert strong["score"] > weak["score"] + 0.5
    assert {"pergunta", "número/especificidade", "fala com 'você'"} <= set(strong["signals"])


def test_hook_penalties_for_early_cta_filler_and_length():
    assert text.score_hook_text("Se inscreva no canal e deixa o like")["score"] < 0.15
    assert any("muleta" in n for n in text.score_hook_text("Então, tipo, vamos começar")["notes"])
    long = text.score_hook_text(" ".join(["palavra"] * 30))
    assert any("longa" in n for n in long["notes"])
    assert text.score_hook_text("")["score"] == 0.0


def test_english_hooks_are_recognised():
    r = text.score_hook_text("I tested 7 days without sugar and the result shocked me")
    assert "prova/resultado" in r["signals"] and r["score"] > 0.4


def test_diminishing_returns_cap_at_one():
    r = text.score_hook_text("Você sabia que 90% dos erros que ninguém te conta arruínam seu canal agora?")
    assert 0.0 <= r["score"] <= 1.0


def test_rank_hooks_orders_by_score():
    out = text.rank_hooks(["Oi pessoal, hoje eu vou falar de café", "Você toma café errado há 8 anos?"])
    assert out[0]["hook"].startswith("Você") and out[0]["score"] > out[1]["score"]


def test_srt_parse_opening_wps_and_first_word():
    srt = "1\n00:00:00,300 --> 00:00:02,500\nVocê nunca deveria fazer isso\n\n2\n00:00:02,500 --> 00:00:05,000\nnos primeiros segundos\n"
    cues = text.parse(srt)
    assert len(cues) == 2 and "nunca" in text.opening_text(cues)
    wps = text.words_per_second(cues, 6)
    assert wps[0] > 0 and wps[5] == 0
    assert abs(text.first_word_time(cues) - 0.3) < 1e-6


def test_plain_text_without_times():
    cues = text.parse("Você sabia disso? Nem eu.")
    assert cues[0][0] is None and text.words_per_second(cues, 5) is None
    assert text.opening_text(cues) == "Você sabia disso?"


def test_script_analysis_flags_issues():
    good = "Você está errando isso há 8 meses? Veja o que mudou. Comenta se funcionou."
    bad = "Então, tipo, hoje eu vou falar " + "de uma coisa que " * 8 + "muito importante né."
    g, b = text.analyze_script(good), text.analyze_script(bad)
    assert g["hook_first_sentence"]["score"] > b["hook_first_sentence"]["score"]
    assert g["cta_at_end"] and not b["cta_at_end"]
    assert any("frase" in n or "muletas" in n for n in b["notes"])
