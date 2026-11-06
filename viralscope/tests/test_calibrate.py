import numpy as np
import pytest

from viralscope import calibrate


def _data(n, signal=True, seed=0):
    rng = np.random.default_rng(seed)
    X = rng.random((n, len(calibrate.FEATURES)))
    target = (3 * X[:, 0] + 2 * X[:, 2] if signal else np.zeros(n)) + rng.normal(0, 0.3, n)
    return X, target


def test_recovers_real_signal():
    X, t = _data(120)
    m = calibrate.fit_arrays(X, t)
    assert m["auc_loo"] > 0.85 and m["n"] == 120


def test_pure_noise_gives_auc_near_half():
    X, _ = _data(120, seed=1)
    t = np.random.default_rng(5).normal(size=120)
    assert calibrate.fit_arrays(X, t)["auc_loo"] < 0.65


def test_refuses_small_samples_and_one_class():
    X, t = _data(10)
    with pytest.raises(ValueError, match="pelo menos"):
        calibrate.fit_arrays(X, t)
    X, t = _data(40)
    with pytest.raises(ValueError, match="classes"):
        calibrate.fit_arrays(X, t, threshold=t.max() + 1)


def test_apply_returns_probability_in_range():
    X, t = _data(60)
    m = calibrate.fit_arrays(X, t)
    r = {"components": dict(zip(calibrate.FEATURES, X[0]))}
    p = calibrate.apply(m, r)
    assert 0.0 <= p["p"] <= 1.0 and p["n"] == 60
    hi = {"components": dict(zip(calibrate.FEATURES, [1, 1, 1, 1, 1, 1, 1, 1, 1]))}
    lo = {"components": dict(zip(calibrate.FEATURES, [0] * 9))}
    assert calibrate.apply(m, hi)["p"] > calibrate.apply(m, lo)["p"]


def test_auc_basic():
    assert calibrate.auc(np.array([0, 0, 1, 1]), np.array([.1, .2, .8, .9])) == 1.0
    assert calibrate.auc(np.array([0, 1]), np.array([.5, .5])) == 0.5
