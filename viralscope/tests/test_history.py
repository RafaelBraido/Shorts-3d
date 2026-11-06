import numpy as np
import pytest

from viralscope import calibrate, history
from viralscope.cli import main


@pytest.fixture(autouse=True)
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("VIRALSCOPE_HOME", str(tmp_path / "h"))


def _res(rng, good):
    c = {k: float(np.clip(rng.normal(0.65 if (good and k == "hook") else 0.45, 0.1), 0, 1)) for k in calibrate.FEATURES}
    return {"components": c, "overall": 50.0}, 1000.0 if good else 100.0


def test_below_minimum_promises_nothing():
    rng = np.random.default_rng(0)
    for i in range(5):
        r, t = _res(rng, i % 2)
        history.record(r, t, f"v{i}")
    st = history.refit()
    assert st["model"] is None and st["need"] == calibrate.MIN_N - 5
    assert "Faltam" in history.describe(st) and history.load_model() is None


def test_learns_and_improves_with_more_data():
    rng = np.random.default_rng(1)
    aucs = []
    for i in range(60):
        r, t = _res(rng, i % 2)
        t += rng.normal(0, 150)
        history.record(r, t, f"v{i}")
        if i + 1 in (24, 60):
            aucs.append(history.refit()["model"]["auc_loo"])
    assert aucs[-1] > 0.7 and history.load_model() is not None
    st = history.refit()
    assert st["insights"][0][0] == "gancho"  # o sinal plantado é o gancho


def test_record_replaces_same_name():
    r = {"components": {k: 0.5 for k in calibrate.FEATURES}, "overall": 50.0}
    history.record(r, 1, "a")
    assert history.record(r, 2, "a") == 1 and history.load()[0]["target"] == 2


def test_cli_learn_status_and_usage(capsys):
    assert main(["learn", "--status"]) == 0
    assert "Faltam 20" in capsys.readouterr().out
    assert main(["learn", "x.mp4"]) == 2
