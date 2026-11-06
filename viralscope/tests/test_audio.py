import shutil
import subprocess

import numpy as np
import pytest

from conftest import SR, speech_like, write_wav
from viralscope import audio


@pytest.mark.parametrize("rate", [3.0, 5.5, 7.0])
def test_syllable_rate_tracks_modulation(rate):
    r = audio.analyze_signal(speech_like(8.0, rate, 1.0, 7.0), 8)
    assert abs(r["speech_rate_syl_s"] - rate) < 0.8
    assert r["first_speech_s"] is not None and 1.0 <= r["first_speech_s"] < 1.6


def test_silence_and_leading_silence():
    r = audio.analyze_signal(np.zeros(SR * 5, dtype=np.float32), 5)
    assert r["silence_ratio"] == 1.0 and r["first_sound_s"] is None and r["speech_seconds"] == 0
    r2 = audio.analyze_signal(speech_like(6.0, 5.5, 2.0, 6.0), 6)
    assert 1.8 <= r2["first_sound_s"] <= 2.3


def test_clipping_and_peak():
    x = np.clip(speech_like(4.0, 5.0, 0.0, 4.0, level=1.0) * 30, -1, 1)
    r = audio.analyze_signal(x.astype(np.float32), 4)
    assert r["clip_ratio"] > 0.05 and r["peak_db"] > -0.2
    quiet = audio.analyze_signal(speech_like(4.0, 5.0, 0.0, 4.0, level=0.05), 4)
    assert quiet["clip_ratio"] == 0.0


def test_onsets_count_sudden_hits():
    x = np.zeros(SR * 4, dtype=np.float32)
    rng = np.random.default_rng(0)
    for t in (0.5, 1.5, 2.5):
        a = int(t * SR)
        x[a:a + 1600] = rng.standard_normal(1600).astype(np.float32) * 0.5
    r = audio.analyze_signal(x, 4)
    assert r["onsets"][:3].sum() >= 3
    assert audio.analyze_signal(speech_like(4.0, 5.0, 0.0, 4.0), 4)["onsets"].sum() < r["onsets"].sum() + 8


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="sem ffmpeg")
def test_ebu_r128_on_sine(tmp_path):
    p = tmp_path / "s.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=4", "-af", "volume=-20dB", str(p)], check=True)
    e = audio.ebu_r128(str(p))
    # o `sine` do ffmpeg nasce a -18 dBFS de pico; com -20 dB sobra -38 dBFS => ~ -41,8 LUFS
    assert e is not None and abs(e["lufs"] - (-41.8)) < 1.0 and abs(e["true_peak_db"] - (-38.0)) < 1.0


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="sem ffmpeg")
def test_extract_from_file_has_loop_and_ebu(tmp_path):
    p = tmp_path / "sp.wav"
    write_wav(p, speech_like(6.0, 5.5, 0.3))
    r = audio.extract(str(p), 6)
    assert r["ebu"] is not None and 0.0 <= r["loop_audio"] <= 1.0
