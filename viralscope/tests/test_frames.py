import cv2
import numpy as np

from viralscope import frames as F


def _noise(seed=1, size=(640, 360)):
    return (np.random.default_rng(seed).random((size[0], size[1], 3)) * 255).astype("uint8")


def test_sharpness_drops_with_blur():
    img = _noise()
    assert F.sharpness_raw(img) > 100 * F.sharpness_raw(cv2.GaussianBlur(img, (0, 0), 6))
    assert F.sharpness(img) > F.sharpness(cv2.GaussianBlur(img, (0, 0), 6))


def test_exposure_penalizes_dark_and_blown():
    mid = np.full((200, 200, 3), 120, np.uint8)
    dark = np.full((200, 200, 3), 8, np.uint8)
    white = np.full((200, 200, 3), 250, np.uint8)
    assert F.exposure(mid)["score"] > 0.9
    assert F.exposure(dark)["score"] < 0.1 and F.exposure(white)["score"] < 0.1
    assert F.exposure(dark)["dark_clip"] > 0.9 and F.exposure(white)["bright_clip"] > 0.9


def test_text_regions_found_only_with_text():
    bg = np.full((640, 360, 3), 40, np.uint8)
    t = bg.copy()
    cv2.putText(t, "VOCE ESTA ERRANDO", (10, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 3)
    assert F.text_stats(t)["ratio"] > 0.01
    assert F.text_stats(bg)["ratio"] == 0.0
    assert F.text_stats(_noise())["ratio"] == 0.0


def test_text_in_unsafe_zone_is_detected():
    safe, unsafe = np.full((640, 360, 3), 40, np.uint8), np.full((640, 360, 3), 40, np.uint8)
    cv2.putText(safe, "VOCE ESTA ERRANDO", (10, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 3)
    cv2.putText(unsafe, "VOCE ESTA ERRANDO", (10, 600), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 3)
    assert F.text_stats(safe, 0.22, 0.14)["unsafe_ratio"] < 0.2
    assert F.text_stats(unsafe, 0.22, 0.14)["unsafe_ratio"] > 0.8


def test_composition_flat_has_no_subject_and_blob_has_focus():
    flat = np.full((640, 360, 3), 90, np.uint8)
    assert F.composition(flat)["focus"] == 0.0
    blob = np.full((640, 360, 3), 30, np.uint8)
    cv2.circle(blob, (180, 250), 70, (200, 220, 255), -1)
    c = F.composition(blob)
    assert c["focus"] > 0.5 and abs(c["cx"] - 0.5) < 0.1 and abs(c["cy"] - 250 / 640) < 0.15


def test_quality_ranks_good_frame_above_bad():
    good = np.full((640, 360, 3), 60, np.uint8)
    cv2.circle(good, (180, 250), 70, (60, 200, 255), -1)
    cv2.putText(good, "OLHA ISSO", (40, 400), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)
    bad = np.full((640, 360, 3), 10, np.uint8)
    qg, qb = F.quality(good), F.quality(bad)
    assert qg["score"] > qb["score"] + 0.2
    for k in ("sharpness", "exposure", "contrast", "colorfulness", "focus", "placement", "score"):
        assert 0.0 <= qg[k] <= 1.0 and 0.0 <= qb[k] <= 1.0


def test_resize_and_sat_helpers():
    assert F.resize_width(_noise(), 180).shape[1] == 180
    assert 0 < F.sat(1.0, 1.0) < 1 and F.sat(0.0, 1.0) == 0
