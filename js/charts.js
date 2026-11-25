// Gráficos em SVG/HTML sem dependências. Cores de humor: rampa sequencial com luminosidade monotônica
// (escura = pior, clara = melhor), então a leitura não depende só do matiz.
import { fromKey, addDays } from './stats.js';
import { esc, fmt, hours, dateLong, dateShort } from './util.js';

const STOPS = [[1, 0.36, 0.09, 275], [4, 0.55, 0.10, 235], [7, 0.74, 0.11, 175], [10, 0.90, 0.15, 95]];

export function moodColor(m) {
  const v = Math.max(1, Math.min(10, m));
  let i = 0;
  while (i < STOPS.length - 2 && v > STOPS[i + 1][0]) i++;
  const [m0, l0, c0, h0] = STOPS[i], [m1, l1, c1, h1] = STOPS[i + 1];
  const t = (v - m0) / (m1 - m0);
  const L = l0 + (l1 - l0) * t, C = c0 + (c1 - c0) * t, H = h0 + (h1 - h0) * t;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}
/** Texto claro sobre cores escuras. */
export const lightText = (m) => m < 4.8;

export const MOOD_WORDS = ['', 'No fundo', 'Muito pesado', 'Pesado', 'Abaixo do normal', 'Neutro', 'Tranquilo', 'Bem', 'Bom', 'Muito bom', 'Radiante'];
export const ENERGY_WORDS = ['', 'Sem energia', 'Baixa', 'Média', 'Boa', 'Alta'];

/** Cria (ou recria) um gráfico responsivo medindo a largura real do contêiner. */
function responsive(box, draw) {
  if (box._ro) box._ro.disconnect();
  let last = 0;
  const run = () => { const w = Math.floor(box.clientWidth); if (w && w !== last) { last = w; draw(w); } };
  box._ro = new ResizeObserver(run);
  box._ro.observe(box);
  run();
}

function tipFor(box) {
  let tip = box.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('aria-hidden', 'true'); box.appendChild(tip); }
  return tip;
}
function placeTip(box, tip, x, y) {
  const w = box.clientWidth, tw = tip.offsetWidth || 160;
  tip.style.left = `${Math.max(0, Math.min(w - tw, x + 14 > w - tw ? x - tw - 14 : x + 14))}px`;
  tip.style.top = `${Math.max(0, y - 20)}px`;
}

/** Linha do tempo: humor (1–10) em cima, horas de sono embaixo. Duas medidas, dois painéis, um eixo X. */
export function timeline(box, entries, lastKey, tagLabel, windowDays = 60) {
  const start = addDays(lastKey, -(windowDays - 1));
  const data = entries.filter((e) => e.date >= start && e.date <= lastKey);
  const span = windowDays;
  const idx = (k) => Math.round((fromKey(k) - fromKey(start)) / 86400000);
  responsive(box, (W) => {
    const m = { l: 26, r: 6, t: 8 }, Hm = 160, gap = 30, Hs = 64, B = 24;
    const H = m.t + Hm + gap + Hs + B, pw = W - m.l - m.r;
    const x = (i) => m.l + (span === 1 ? pw / 2 : (i / (span - 1)) * pw);
    const ym = (v) => m.t + Hm - ((v - 1) / 9) * Hm;
    const sTop = m.t + Hm + gap, ys = (h) => sTop + Hs - (Math.min(12, h) / 12) * Hs;
    let g = '';
    for (const v of [1, 5, 10]) g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${ym(v)}" y2="${ym(v)}"/><text x="${m.l - 8}" y="${ym(v) + 4}" text-anchor="end">${v}</text>`;
    for (const h of [0, 6, 12]) g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${ys(h)}" y2="${ys(h)}"/><text x="${m.l - 8}" y="${ys(h) + 4}" text-anchor="end">${h}</text>`;
    const bw = Math.max(2, Math.min(9, (pw / span) * 0.62));
    let bars = '', dots = '', path = '', prev = null;
    for (const e of data) {
      const i = idx(e.date), cx = x(i);
      if (typeof e.sleep === 'number') bars += `<rect class="sleepbar" x="${cx - bw / 2}" y="${ys(e.sleep)}" width="${bw}" height="${sTop + Hs - ys(e.sleep)}" rx="${Math.min(4, bw / 2)}"/>`;
      path += `${prev !== null && i - prev <= 2 ? 'L' : 'M'}${cx.toFixed(1)} ${ym(e.mood).toFixed(1)}`;
      dots += `<circle class="dot" cx="${cx}" cy="${ym(e.mood)}" r="5" fill="${moodColor(e.mood)}"/>`;
      prev = i;
    }
    const lab = [0, Math.floor((span - 1) / 2), span - 1].map((i, n) => `<text x="${x(i)}" y="${H - 4}" text-anchor="${n === 0 ? 'start' : n === 2 ? 'end' : 'middle'}">${dateShort(fromKey(addDays(start, i)))}</text>`).join('');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Linha do tempo de humor e horas de sono dos últimos ${windowDays} dias. Uma tabela com os mesmos dados está logo abaixo.">${g}${bars}<path class="line" d="${path}"/>${dots}${lab}<line class="cross" id="cx" y1="${m.t}" y2="${sTop + Hs}" opacity="0"/></svg>`;
    const tip = tipFor(box), svg = box.querySelector('svg'), cx = svg.querySelector('#cx');
    const hide = () => { tip.classList.remove('on'); cx.setAttribute('opacity', 0); };
    svg.addEventListener('pointermove', (ev) => {
      const r = svg.getBoundingClientRect(), px = ev.clientX - r.left;
      let best = null, bd = 1e9;
      for (const e of data) { const d = Math.abs(x(idx(e.date)) - px); if (d < bd) { bd = d; best = e; } }
      if (!best || bd > Math.max(14, pw / span)) return hide();
      const bx = x(idx(best.date));
      cx.setAttribute('x1', bx); cx.setAttribute('x2', bx); cx.setAttribute('opacity', 0.6);
      tip.innerHTML = `<b>${esc(dateLong(fromKey(best.date)))}</b>Humor ${best.mood}${typeof best.sleep === 'number' ? ` · sono ${hours(best.sleep)}` : ''}${best.energy ? ` · energia ${best.energy}/5` : ''}${best.tags?.length ? `<br>${best.tags.map((t) => esc(tagLabel(t))).join(', ')}` : ''}`;
      tip.classList.add('on'); placeTip(box, tip, bx, ym(best.mood));
    });
    svg.addEventListener('pointerleave', hide);
  });
}

/** Dispersão humor × (sono | energia) com linha de tendência. */
export function scatter(box, ins) {
  const isSleep = ins.kind === 'sleep';
  responsive(box, (W) => {
    const m = { l: 26, r: 10, t: 8, b: 34 }, H = 230, pw = W - m.l - m.r, ph = H - m.t - m.b;
    const xs = ins.points.map((p) => p.x);
    const lo = isSleep ? Math.floor(Math.min(...xs) - 0.5) : 0.5, hi = isSleep ? Math.ceil(Math.max(...xs) + 0.5) : 5.5;
    const X = (v) => m.l + ((v - lo) / (hi - lo)) * pw, Y = (v) => m.t + ph - ((v - 1) / 9) * ph;
    let g = '';
    for (const v of [1, 5, 10]) g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    const ticks = isSleep ? Array.from({ length: Math.floor((hi - lo) / 2) + 1 }, (_, i) => lo + i * 2).filter((v) => v <= hi) : [1, 2, 3, 4, 5];
    for (const v of ticks) g += `<text x="${X(v)}" y="${H - 14}" text-anchor="middle">${isSleep ? v + 'h' : v}</text>`;
    g += `<text x="${m.l + pw / 2}" y="${H - 1}" text-anchor="middle">${isSleep ? 'horas de sono' : 'energia (1 a 5)'}</text>`;
    const pts = ins.points.map((p, i) => ({ ...p, jx: isSleep ? p.x : p.x + (((i * 37) % 11) - 5) * 0.03, jy: p.y + (((i * 53) % 9) - 4) * 0.04 }));
    const dots = pts.map((p) => `<circle class="dot" cx="${X(p.jx).toFixed(1)}" cy="${Y(Math.max(1, Math.min(10, p.jy))).toFixed(1)}" r="6" fill="${moodColor(p.y)}"/>`).join('');
    const clamp = (v) => Math.max(1, Math.min(10, v));
    const trend = `<line class="trend" x1="${X(lo)}" y1="${Y(clamp(ins.intercept + ins.slope * lo))}" x2="${X(hi)}" y2="${Y(clamp(ins.intercept + ins.slope * hi))}"/>`;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Dispersão de humor contra ${isSleep ? 'horas de sono' : 'energia'}; correlação ${fmt(ins.r, 2)}.">${g}${trend}${dots}</svg>`;
    const tip = tipFor(box), svg = box.querySelector('svg');
    svg.addEventListener('pointermove', (ev) => {
      const r = svg.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
      let best = null, bd = 1e9;
      for (const p of pts) { const d = Math.hypot(X(p.jx) - px, Y(p.jy) - py); if (d < bd) { bd = d; best = p; } }
      if (!best || bd > 22) return tip.classList.remove('on');
      tip.innerHTML = `<b>${esc(dateLong(fromKey(best.date)))}</b>Humor ${best.y} · ${isSleep ? 'sono ' + hours(best.x) : 'energia ' + best.x + '/5'}`;
      tip.classList.add('on'); placeTip(box, tip, X(best.jx), Y(best.jy));
    });
    svg.addEventListener('pointerleave', () => tip.classList.remove('on'));
  });
}
