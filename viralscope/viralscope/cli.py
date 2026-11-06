from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import sys
from pathlib import Path

from . import __version__, history, profiles, report, scoring, text

VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi")


def _run(path: str, args) -> dict:
    weights = json.load(open(args.weights)) if getattr(args, "weights", None) else None
    r = scoring.analyze(path, getattr(args, "transcript", None), getattr(args, "transcribe", False),
                        weights, platform=args.platform)
    model = json.load(open(args.model)) if getattr(args, "model", None) else (
        None if getattr(args, "no_learned", False) else history.load_model())
    if model:
        from . import calibrate
        r["probability"] = calibrate.apply(model, r)
    return r


def _write_report(r: dict, path: str, out_dir: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.abspath(os.path.join(out_dir, Path(path).stem + ".viralscope.html"))
    Path(dest).write_text(report.to_html(r, os.path.basename(path)), encoding="utf-8")
    return Path(dest).as_uri()


def cmd_analyze(args) -> int:
    if not os.path.isfile(args.video):
        print(f"Arquivo não encontrado: {args.video}", file=sys.stderr)
        return 2
    r = _run(args.video, args)
    url = None if args.no_report else _write_report(r, args.video, args.out_dir)
    if args.json:
        r["report_url"] = url
        print(report.to_json(r))
    elif args.format == "higgsfield":
        print(report.to_higgsfield(r, url))
    else:
        print(report.to_text(r, url))
    return 0


def cmd_compare(args) -> int:
    ra, rb = _run(args.a, args), _run(args.b, args)
    rows = [("Nota geral", ra["overall"], rb["overall"]), ("Gancho %", ra["hook"] * 100, rb["hook"] * 100),
            ("Pico do gancho %", ra["peak_hook_pct"], rb["peak_hook_pct"]), ("Sustentação %", ra["sustain"] * 100, rb["sustain"] * 100),
            ("Divagação % (menor melhor)", (ra["regions"]["default_mode"] or 0) * 100, (rb["regions"]["default_mode"] or 0) * 100)]
    for k in ("visual", "auditory", "language", "attention"):
        rows.append((k.capitalize() + " %", (ra["regions"][k] or 0) * 100, (rb["regions"][k] or 0) * 100))
    print(f"{'':30s}{'A':>8s}{'B':>8s}  melhor")
    print(f"{'':30s}{os.path.basename(args.a)[:8]:>8s}{os.path.basename(args.b)[:8]:>8s}")
    for name, x, y in rows:
        lower = "menor melhor" in name
        best = "=" if abs(x - y) < 1 else ("A" if (x < y) == lower else "B")
        print(f"{name:30s}{x:8.0f}{y:8.0f}  {best}")
    win = "A" if ra["overall"] > rb["overall"] else "B"
    print(f"\nMaior nota geral: {win} ({max(ra['overall'], rb['overall']):.0f} vs {min(ra['overall'], rb['overall']):.0f})")
    return 0


def cmd_batch(args) -> int:
    files = sorted(f for f in glob.glob(os.path.join(args.folder, "**", "*"), recursive=True)
                   if f.lower().endswith(VIDEO_EXT))
    if not files:
        print("Nenhum vídeo encontrado.", file=sys.stderr)
        return 2
    rows = []
    for f in files:
        try:
            r = _run(f, args)
        except RuntimeError as e:
            print(f"! {f}: {e}", file=sys.stderr)
            continue
        if not args.no_report:
            _write_report(r, f, args.out_dir)
        rows.append({"video": f, "overall": r["overall"], "hook": r["hook"], "peak_hook_pct": r["peak_hook_pct"],
                     "sustain": r["sustain"], "default_mode": r["regions"]["default_mode"],
                     **{f"c_{k}": v for k, v in r["components"].items()},
                     "prob": (r["probability"]["p"] if r.get("probability") else "")})
    rows.sort(key=lambda x: -x["overall"])
    for i, x in enumerate(rows, 1):
        print(f"{i:2d}. {x['overall']:5.1f}  gancho {x['hook'] * 100:3.0f}%  {os.path.relpath(x['video'], args.folder)}")
    if args.csv and rows:
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)
        print(f"\nCSV: {args.csv}")
    return 0


def cmd_hook(args) -> int:
    r = text.score_hook_text(args.frase)
    print(f"Gancho: {r['score'] * 100:.0f}%  mecanismos: {', '.join(r['signals']) or 'nenhum'}")
    for n in r["notes"]:
        print(f"  - {n}")
    return 0


def cmd_hooks(args) -> int:
    src = open(args.arquivo, encoding="utf-8").read().splitlines() if os.path.isfile(args.arquivo) else args.arquivo.split("|")
    hooks = [h.strip() for h in src if h.strip()]
    for i, r in enumerate(text.rank_hooks(hooks), 1):
        print(f"{i:2d}. {r['score'] * 100:3.0f}%  {r['hook']}  [{', '.join(r['signals']) or '-'}]")
    return 0


def cmd_script(args) -> int:
    raw = open(args.arquivo, encoding="utf-8").read() if os.path.isfile(args.arquivo) else args.arquivo
    r = text.analyze_script(raw)
    print(f"Palavras: {r['words']}  ·  frases: {r['sentences']}  ·  duração falada estimada: {r['est_duration_s']} s")
    print(f"Gancho (1ª frase): {r['hook_first_sentence']['score'] * 100:.0f}%  ·  (10 s iniciais): {r['hook_first_10s']['score'] * 100:.0f}%")
    print(f"Muletas: {r['filler_ratio'] * 100:.1f}%  ·  CTA no fim: {'sim' if r['cta_at_end'] else 'não'}")
    for n in r["notes"]:
        print(f"  - {n}")
    return 0


def cmd_image(args) -> int:
    from . import thumb
    r = thumb.analyze_image(args.imagem, args.platform)
    if args.json:
        print(json.dumps(r, ensure_ascii=False, indent=2, default=float))
        return 0
    q = r["quality"]
    print(f"Nota da imagem: {r['score']:.0f}/100  ({r['size'][0]}x{r['size'][1]})")
    print(f"Nitidez {q['sharpness'] * 100:.0f}% · Exposição {q['exposure'] * 100:.0f}% · Contraste {q['contrast'] * 100:.0f}% · "
          f"Cor {q['colorfulness'] * 100:.0f}% · Foco {q['focus'] * 100:.0f}% · Enquadramento {q['placement'] * 100:.0f}%")
    for f in r["fixes"]:
        print(f"  - {f['text']}")
    return 0


def cmd_learn(args) -> int:
    pairs = []
    if args.importar:
        with open(args.importar, newline="", encoding="utf-8") as fh:
            pairs = [(r["video"], float(r["target"])) for r in csv.DictReader(fh)]
    elif args.video and args.target is not None:
        pairs = [(args.video, args.target)]
    elif args.video or args.target is not None:
        print("Informe o vídeo e --target juntos (ou use --status / --import).", file=sys.stderr)
        return 2
    for path, target in pairs:
        if not os.path.isfile(path):
            print(f"! não encontrado: {path}", file=sys.stderr)
            continue
        r = scoring.analyze(path, platform=args.platform, keyframes=False)
        n = history.record(r, target, os.path.basename(path))
        print(f"registrado: {os.path.basename(path)} (nota {r['overall']:.0f}, alvo {target:g}) · total {n}")
    st = history.refit()
    print(history.describe(st))
    return 0


def cmd_calibrate(args) -> int:
    from . import calibrate
    calibrate.fit(args.csv, args.out, args.threshold, args.platform)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="viralscope", description="Analisador local de gancho, imagem, áudio e retenção para vídeos curtos.")
    p.add_argument("--version", action="version", version=f"viralscope {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp, video=True):
        sp.add_argument("--platform", choices=list(profiles.PROFILES), default="shorts", help="perfil de plataforma (padrão: shorts)")
        sp.add_argument("--weights", help="JSON com pesos da nota geral")
        sp.add_argument("--model", help="modelo gerado por `calibrate` (adiciona probabilidade calibrada)")
        sp.add_argument("--transcript", help="arquivo .srt/.vtt/.txt (ou o próprio texto)")
        sp.add_argument("--transcribe", action="store_true", help="transcreve com whisper, se instalado")
        sp.add_argument("--out-dir", default="viralscope_reports", help="onde salvar os relatórios HTML")
        sp.add_argument("--no-learned", action="store_true", help="ignora o modelo aprendido do canal")
        sp.add_argument("--no-report", action="store_true", help="não gera o HTML")

    a = sub.add_parser("analyze", help="analisa um vídeo")
    a.add_argument("video")
    common(a)
    a.add_argument("--format", choices=["texto", "higgsfield"], default="texto", help="'higgsfield' imita o resumo do Virality Predictor")
    a.add_argument("--json", action="store_true")
    a.set_defaults(fn=cmd_analyze)

    c = sub.add_parser("compare", help="compara dois vídeos lado a lado")
    c.add_argument("a")
    c.add_argument("b")
    common(c)
    c.set_defaults(fn=cmd_compare, no_report=True)

    b = sub.add_parser("batch", help="analisa uma pasta e ranqueia")
    b.add_argument("folder")
    b.add_argument("--csv", help="salva o ranking em CSV")
    common(b)
    b.set_defaults(fn=cmd_batch)

    h = sub.add_parser("hook", help="pontua só a frase de abertura")
    h.add_argument("frase")
    h.set_defaults(fn=cmd_hook)

    hs = sub.add_parser("hooks", help="ranqueia vários ganchos (arquivo com um por linha, ou 'a|b|c')")
    hs.add_argument("arquivo")
    hs.set_defaults(fn=cmd_hooks)

    sc = sub.add_parser("script", help="analisa um roteiro (arquivo ou texto)")
    sc.add_argument("arquivo")
    sc.set_defaults(fn=cmd_script)

    im = sub.add_parser("image", help="analisa uma imagem (thumbnail/capa)")
    im.add_argument("imagem")
    im.add_argument("--platform", choices=list(profiles.PROFILES), default="shorts")
    im.add_argument("--json", action="store_true")
    im.set_defaults(fn=cmd_image)

    lr = sub.add_parser("learn", help="registra um vídeo com a métrica real e reajusta o modelo do canal")
    lr.add_argument("video", nargs="?")
    lr.add_argument("--target", type=float, help="métrica real (retenção %, views 7d, ...)")
    lr.add_argument("--import", dest="importar", help="CSV video,target para registrar vários de uma vez")
    lr.add_argument("--status", action="store_true", help="só mostra o estado do aprendizado")
    lr.add_argument("--platform", choices=list(profiles.PROFILES), default="shorts")
    lr.set_defaults(fn=cmd_learn)

    k = sub.add_parser("calibrate", help="ajusta uma probabilidade com seus vídeos (CSV: video,target)")
    k.add_argument("csv")
    k.add_argument("--out", default="model.json")
    k.add_argument("--threshold", type=float, help="limiar do alvo (padrão: mediana)")
    k.add_argument("--platform", choices=list(profiles.PROFILES), default="shorts")
    k.set_defaults(fn=cmd_calibrate)

    args = p.parse_args(argv)
    try:
        return args.fn(args)
    except (RuntimeError, ValueError) as e:
        print(f"Erro: {e}", file=sys.stderr)
        return 1
