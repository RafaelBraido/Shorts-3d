"""Saídas: texto (pt-BR), formato Higgsfield (Virality Predictor), JSON e HTML autocontido."""
from __future__ import annotations

import base64
import html
import json

REGION_PT = {"visual": "Visual", "auditory": "Auditory (áudio)", "language": "Language (linguagem)",
             "attention": "Attention (atenção)", "default_mode": "Default Mode (divagação)"}
REGION_EN = {"visual": "Visual", "auditory": "Auditory", "language": "Language",
             "attention": "Attention", "default_mode": "Default Mode"}
KIND_PT = {"medido": "medido", "proxy": "proxy", "heurística": "heurística"}


def _pct(x) -> str:
    return "n/d" if x is None else f"{x * 100:.0f}%"


def strongest_region(r: dict) -> str | None:
    cand = {k: v for k, v in r["regions"].items() if k != "default_mode" and v is not None}
    best = max(cand, key=cand.get) if cand else None
    return best if best and cand[best] >= 0.10 else None


def risk_line(r: dict, en: bool = False) -> str | None:
    dm = r["regions"]["default_mode"]
    if dm is not None and dm >= 0.25:
        return ("Default Mode is high, which can indicate mind-wandering." if en
                else "Default Mode alto: há trechos de baixa estimulação em que a atenção tende a divagar.")
    return None


def to_higgsfield(r: dict, report_url: str | None = None) -> str:
    """Mesmo formato do resumo do Virality Predictor da Higgsfield (rótulos em inglês, valores locais)."""
    reg = r["regions"]
    lines = [
        f"Overall score: {r['overall']:.0f}/100",
        f"Peak hook: {r['peak_hook_pct']}% at {r['peak_hook_second']}s",
        f"Sustain: {r['sustain'] * 100:.0f}%",
    ]
    for k in ("visual", "auditory", "language", "attention", "default_mode"):
        if reg.get(k) is not None:
            suffix = " (lower is better)" if k == "default_mode" else ""
            lines.append(f"{REGION_EN[k]}: {reg[k] * 100:.0f}%{suffix}")
    sr = strongest_region(r)
    if sr:
        lines.append(f"Strongest region: {REGION_EN[sr]}")
    rk = risk_line(r, en=True)
    if rk:
        lines.append(f"Risk: {rk}")
    if report_url:
        lines += ["", f"Open report: {report_url}"]
    return "\n".join(lines)


def to_text(r: dict, report_url: str | None = None) -> str:
    reg = r["regions"]
    sr = strongest_region(r)
    lines = [
        f"Nota geral: {r['overall']:.0f}/100 ({r['verdict']})  ·  {r['meta']['platform']}",
        f"Gancho (0-3 s): {_pct(r['hook'])}  |  Pico do gancho: {r['peak_hook_pct']}% em {r['peak_hook_second']}s",
        f"Sustentação: {_pct(r['sustain'])}  |  Nível médio do corpo: {_pct(r['body'])}",
        "Regiões (proxies de sinais do arquivo, não atividade cerebral):",
    ]
    for k in ("visual", "auditory", "language", "attention", "default_mode"):
        extra = ""
        if k == "default_mode":
            extra = "  (menor é melhor)"
        if k == "language" and reg.get(k) is not None:
            extra = f"  (fonte: {r['language_source']})"
        lines.append(f"  {REGION_PT[k]}: {_pct(reg.get(k))}{extra}")
    if sr:
        lines.append(f"Região mais forte: {REGION_EN[sr]}")
    c = r["components"]
    lines.append(f"Imagem: {_pct(c['image'])}  |  Formato: {_pct(c['format'])}  |  Loop: {_pct(c['loop'])}  |  "
                 f"Legendas: {_pct(c['captions'])}  |  Áudio técnico: {_pct(c['audio_tech'])}")
    ht = r.get("hook_text")
    if ht:
        lines.append(f"Gancho falado: {_pct(ht['score'])} (mecanismos: {', '.join(ht['signals']) or 'nenhum'})")
    if r.get("probability") is not None:
        p = r["probability"]
        lines.append(f"Probabilidade calibrada de superar a mediana do seu canal: {p['p'] * 100:.0f}% "
                     f"(AUC leave-one-out {p['auc_loo']:.2f}, n={p['n']})")
    lines.append("")
    lines.append("O que corrigir (por prioridade):" if r["fixes"] else "Nada crítico encontrado.")
    for f in r["fixes"]:
        t = ""
        if f["time"]:
            t = f" [{f['time'][0]}–{f['time'][1]} s]"
        lines.append(f"  - ({f['area']}){t} {f['text']}")
    if report_url:
        lines += ["", f"Relatório: {report_url}"]
    lines += ["", "Aviso: mede a qualidade de atenção do material com sinais do arquivo; não prevê views. "
              "Para uma probabilidade do SEU canal, use `viralscope calibrate`."]
    return "\n".join(lines)


def to_dict(r: dict) -> dict:
    d = {k: v for k, v in r.items() if k != "keyframes"}
    return d


def to_json(r: dict) -> str:
    return json.dumps(to_dict(r), ensure_ascii=False, indent=2, default=float)


# --------------------------------------------------------------------------- HTML
def _polyline(vals, W, H, pad, color, width=2, dash=""):
    n = len(vals)
    dx = (W - 2 * pad) / max(1, n - 1)
    pts = " ".join(f"{pad + i * dx:.1f},{H - pad - float(x) * (H - 2 * pad):.1f}" for i, x in enumerate(vals))
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<polyline fill="none" stroke="{color}" stroke-width="{width}"{d} points="{pts}"/>'


def to_html(r: dict, title: str = "Relatório viralscope") -> str:
    tl = r["timeline"]
    n = len(tl["engagement"])
    W, H, pad = 760, 220, 30
    dx = (W - 2 * pad) / max(1, n - 1)
    hook_w = min(3, n - 1) * dx
    drift = "".join(f'<rect x="{pad + a * dx:.1f}" y="{pad}" width="{(b - a) * dx:.1f}" height="{H - 2 * pad}" '
                    f'fill="var(--bad)" opacity=".14"/>' for a, b in r["drift_runs"])
    cuts = "".join(f'<line x1="{pad + c * dx:.1f}" x2="{pad + c * dx:.1f}" y1="{H - pad}" y2="{H - pad + 8}" '
                   f'stroke="var(--c4)" stroke-width="1.5"/>' for c in tl["cut_times"])
    series = [("engagement", "var(--ink)", 3, ""), ("visual", "var(--c1)", 1.5, ""), ("auditory", "var(--c2)", 1.5, ""),
              ("attention", "var(--c3)", 1.5, ""), ("language", "var(--c5)", 1.5, "4 3")]
    lines = "".join(_polyline(tl[k], W, H, pad, col, w, d) for k, col, w, d in series if tl.get(k))
    grid = "".join(f'<line x1="{pad}" x2="{W - pad}" y1="{H - pad - g * (H - 2 * pad):.1f}" y2="{H - pad - g * (H - 2 * pad):.1f}" '
                   f'stroke="var(--line)"/><text x="4" y="{H - pad - g * (H - 2 * pad) + 4:.1f}" font-size="10" fill="var(--mute)">{int(g * 100)}</text>'
                   for g in (0, .5, 1))
    legend = "".join(f'<span><i style="background:{col}"></i>{name}</span>' for name, col in
                     [("Engajamento", "var(--ink)"), ("Visual", "var(--c1)"), ("Áudio", "var(--c2)"),
                      ("Atenção", "var(--c3)"), ("Linguagem", "var(--c5)")])
    svg = (f'<svg viewBox="0 0 {W} {H + 20}" width="100%" role="img" aria-label="Engajamento por segundo">{grid}'
           f'<rect x="{pad}" y="{pad}" width="{hook_w:.1f}" height="{H - 2 * pad}" fill="var(--c1)" opacity=".10"/>'
           f'{drift}{lines}{cuts}'
           f'<text x="{pad}" y="{H + 16}" font-size="11" fill="var(--mute)">0 s</text>'
           f'<text x="{W - pad - 24}" y="{H + 16}" font-size="11" fill="var(--mute)">{n} s</text></svg>')

    reg = r["regions"]
    rows = []
    for k in ("visual", "auditory", "language", "attention", "default_mode"):
        v = reg.get(k)
        name = REGION_PT[k]
        if v is None:
            rows.append(f'<div class="ch"><span>{name}</span><div class="bar"></div><b>n/d</b></div>')
            continue
        cls = " dm" if k == "default_mode" else ""
        hint = ' <small>menor é melhor</small>' if k == "default_mode" else ""
        rows.append(f'<div class="ch"><span>{name}{hint}</span><div class="bar{cls}"><i style="width:{v * 100:.0f}%"></i></div><b>{v * 100:.0f}%</b></div>')
    regions = "".join(rows)

    comp_names = {"hook": "Gancho", "body": "Corpo", "sustain": "Sustentação", "no_drift": "Sem divagação",
                  "image": "Imagem", "format": "Formato", "loop": "Loop", "captions": "Legendas", "audio_tech": "Áudio técnico"}
    comps = "".join(f'<div class="ch"><span>{comp_names[k]}</span><div class="bar"><i style="width:{v * 100:.0f}%"></i></div><b>{v * 100:.0f}%</b></div>'
                    for k, v in r["components"].items())
    fixes = "".join(
        f'<li><em class="tag">{html.escape(f["area"])}</em>'
        + (f' <span class="t">{f["time"][0]}–{f["time"][1]} s</span>' if f["time"] else "")
        + f' {html.escape(f["text"])}</li>' for f in r["fixes"]) or "<li>Nada crítico encontrado.</li>"
    meas = "".join(
        f'<tr><td>{html.escape(m["name"])}</td><td>{html.escape("n/d" if m["value"] is None else str(m["value"]))} {html.escape(m["unit"])}</td>'
        f'<td><span class="k {m["kind"]}">{KIND_PT.get(m["kind"], m["kind"])}</span></td></tr>' for m in r["measured"])
    frames = ""
    for t, jpg in r.get("keyframes", []):
        b64 = base64.b64encode(jpg).decode()
        frames += f'<figure><img alt="quadro em {t} s" src="data:image/jpeg;base64,{b64}"><figcaption>{t} s</figcaption></figure>'
    frames = f'<h3>Primeiros segundos (o que o espectador vê)</h3><div class="frames">{frames}</div>' if frames else ""
    prob = ""
    if r.get("probability") is not None:
        p = r["probability"]
        prob = (f'<div class="card"><small>Prob. calibrada de superar a mediana do canal</small><b>{p["p"] * 100:.0f}%</b>'
                f'<small>AUC LOO {p["auc_loo"]:.2f} · n={p["n"]}</small></div>')
    ht = r.get("hook_text")
    hooktxt = ""
    if ht:
        hooktxt = (f'<p><b>Gancho falado:</b> {ht["score"] * 100:.0f}% · mecanismos: '
                   f'{html.escape(", ".join(ht["signals"]) or "nenhum")}</p>')
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title>
<style>
:root{{--bg:#fff;--card:#f4f5f7;--ink:#1d2430;--mute:#667085;--line:#e3e6ea;--bad:#d64545;--c1:#2563eb;--c2:#0f9d7a;--c3:#e08a00;--c4:#d64545;--c5:#8b5cf6}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#10141a;--card:#1a2029;--ink:#e8ecf2;--mute:#9aa6b6;--line:#2a323d;--bad:#ef6b6b;--c1:#6ea0ff;--c2:#38c9a1;--c3:#f0a93a;--c4:#ef6b6b;--c5:#b39dff}}}}
body{{font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:1.2rem 16px 3rem;background:var(--bg);color:var(--ink)}}
h1{{font-size:1.3rem;margin:.2rem 0}} h3{{margin:1.6rem 0 .4rem}}
.score{{font-size:56px;font-weight:700;line-height:1}} .score small{{font-size:1rem;font-weight:400;color:var(--mute)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:1rem 0}}
.card{{background:var(--card);border-radius:10px;padding:10px 12px}} .card b{{display:block;font-size:22px}} small{{color:var(--mute)}}
.ch{{display:grid;grid-template-columns:minmax(120px,210px) 1fr 46px;gap:8px;align-items:center;margin:5px 0}}
.bar{{background:var(--line);border-radius:6px;height:10px}} .bar i{{display:block;height:10px;border-radius:6px;background:var(--c1)}} .bar.dm i{{background:var(--c4)}}
.legend{{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--mute)}} .legend i{{display:inline-block;width:14px;height:4px;margin-right:4px;vertical-align:middle}}
.frames{{display:flex;gap:8px;overflow-x:auto}} figure{{margin:0}} figure img{{height:160px;border-radius:8px;display:block}} figcaption{{font-size:12px;color:var(--mute);text-align:center}}
ul{{padding-left:1.1rem}} li{{margin:.4rem 0}} .tag{{font-style:normal;font-size:12px;background:var(--card);border-radius:6px;padding:1px 6px;margin-right:4px}} .t{{color:var(--mute);font-size:13px}}
table{{border-collapse:collapse;width:100%;font-size:14px}} td{{padding:4px 6px;border-bottom:1px solid var(--line)}}
.k{{font-size:11px;border-radius:6px;padding:1px 6px;background:var(--card)}} .k.medido{{color:var(--c2)}} .k.proxy{{color:var(--c3)}} .k.heurística{{color:var(--c5)}}
</style></head><body>
<h1>{html.escape(title)}</h1><small>{html.escape(r['meta']['platform'])} · {r['meta']['width']}x{r['meta']['height']} · {r['meta']['duration']:.1f} s</small>
<div class="score">{r['overall']:.0f}<small>/100 · {r['verdict']}</small></div>
<div class="grid">
<div class="card"><small>Gancho 0–3 s</small><b>{r['hook'] * 100:.0f}%</b></div>
<div class="card"><small>Pico do gancho</small><b>{r['peak_hook_pct']}% <small>em {r['peak_hook_second']} s</small></b></div>
<div class="card"><small>Sustentação</small><b>{r['sustain'] * 100:.0f}%</b></div>
<div class="card"><small>Divagação (menor é melhor)</small><b>{(reg['default_mode'] or 0) * 100:.0f}%</b></div>{prob}</div>
{hooktxt}{frames}
<h3>Engajamento por segundo</h3>{svg}<div class="legend">{legend}</div>
<small>Faixa azul = gancho · faixas vermelhas = risco de divagação · marcas vermelhas na base = cortes</small>
<h3>Regiões <small>(proxies de sinais do arquivo; não medem atividade cerebral)</small></h3>{regions}
<h3>Componentes da nota</h3>{comps}
<h3>O que corrigir</h3><ul>{fixes}</ul>
<h3>Sinais medidos</h3><table>{meas}</table>
<p><small>Nota de qualidade de atenção com sinais do arquivo e pesos heurísticos; não prevê views.
“medido” = calculado no pixel/áudio · “proxy” = estimativa indireta · “heurística” = convenção ajustável.</small></p>
</body></html>"""
