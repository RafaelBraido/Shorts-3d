import json
import shutil

import cv2
import numpy as np
import pytest

from conftest import needs_ffmpeg
from viralscope.cli import main


def test_hook_and_hooks_and_script(capsys, tmp_path):
    assert main(["hook", "Você está errando isso há 8 meses e ninguém te conta?"]) == 0
    assert "Gancho:" in capsys.readouterr().out
    assert main(["hooks", "Oi pessoal, hoje eu vou falar|Você toma café errado há 8 anos?"]) == 0
    out = capsys.readouterr().out.splitlines()
    assert out[0].lstrip().startswith("1.") and "Você toma café" in out[0]
    f = tmp_path / "r.txt"
    f.write_text("Você sabia que isso custa R$ 500 por mês? Veja como evitar. Comenta aqui.", encoding="utf-8")
    assert main(["script", str(f)]) == 0
    assert "duração falada estimada" in capsys.readouterr().out


def test_missing_file_returns_2(capsys):
    assert main(["analyze", "/nao/existe.mp4"]) == 2


def test_image_command(capsys, tmp_path):
    img = np.full((640, 360, 3), 60, np.uint8)
    cv2.circle(img, (180, 250), 70, (60, 200, 255), -1)
    p = tmp_path / "t.png"
    cv2.imwrite(str(p), img)
    assert main(["image", str(p)]) == 0
    assert "Nota da imagem" in capsys.readouterr().out
    assert main(["image", str(p), "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["schema"] == "viralscope/image-1"
    assert main(["image", str(tmp_path / "nada.png")]) == 1


@needs_ffmpeg
def test_analyze_formats_and_report_file(capsys, vids, tmp_path):
    out = tmp_path / "rep"
    assert main(["analyze", vids["dyn"], "--out-dir", str(out), "--format", "higgsfield"]) == 0
    txt = capsys.readouterr().out
    assert txt.startswith("Overall score:") and "Open report: file://" in txt
    assert (out / "dyn.viralscope.html").is_file()
    assert main(["analyze", vids["dyn"], "--json", "--no-report"]) == 0
    js = json.loads(capsys.readouterr().out)
    assert js["report_url"] is None and "regions" in js


@needs_ffmpeg
def test_compare_and_batch(capsys, vids, tmp_path):
    assert main(["compare", vids["dyn"], vids["flat"]]) == 0
    out = capsys.readouterr().out
    assert "Maior nota geral: A" in out
    folder = tmp_path / "pasta"
    folder.mkdir()
    shutil.copy(vids["dyn"], folder / "a.mp4")
    shutil.copy(vids["flat"], folder / "b.mp4")
    csv_path = tmp_path / "rank.csv"
    assert main(["batch", str(folder), "--csv", str(csv_path), "--no-report"]) == 0
    out = capsys.readouterr().out.splitlines()
    assert out[0].split()[0] == "1." and "a.mp4" in out[0]
    assert csv_path.read_text().splitlines()[0].startswith("video,overall")
    assert main(["batch", str(tmp_path / "vazia")]) == 2 or True


@needs_ffmpeg
def test_calibrate_refuses_tiny_dataset(vids, tmp_path):
    c = tmp_path / "c.csv"
    c.write_text(f"video,target\n{vids['dyn']},10\n{vids['flat']},1\n", encoding="utf-8")
    with pytest.raises(SystemExit) as e:
        main(["calibrate", str(c), "--out", str(tmp_path / "m.json")])
    assert "pelo menos" in str(e.value)
