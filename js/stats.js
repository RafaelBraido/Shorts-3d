// Estatística pura (sem DOM) para os padrões do diário.
// Tudo é calculado no navegador, sobre os registros locais.

export const MIN_ENTRIES = 21; // ~3 semanas
export const MIN_GROUP = 4; // dias mínimos com e sem um evento

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function variance(xs) {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Intervalo de confiança de 95% para r (transformação de Fisher). */
export function fisherCI(r, n) {
  if (n < 4) return [-1, 1];
  const z = Math.atanh(Math.max(-0.9999, Math.min(0.9999, r)));
  const se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)];
}

/** Regressão simples: y = a + b x */
export function slope(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { b, a: my - b * mx };
}

/** Teste t de Welch: devolve diferença de médias (a - b) e estatística t. */
export function welch(a, b) {
  const ma = mean(a), mb = mean(b);
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  return { diff: ma - mb, t: se === 0 ? 0 : (ma - mb) / se, meanA: ma, meanB: mb };
}

// ---------- datas ----------
export const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function fromKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(k, n) { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); }

export function sortedEntries(map) {
  return Object.values(map).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function strength(r, ci) {
  const sig = ci[0] > 0 || ci[1] < 0;
  const a = Math.abs(r);
  if (!sig) return a >= 0.3 ? 'possible' : 'none';
  return a >= 0.5 ? 'strong' : a >= 0.3 ? 'moderate' : 'weak';
}
function strengthT(t, diff) {
  const a = Math.abs(t);
  if (Math.abs(diff) < 0.25) return 'none';
  if (a >= 2.5) return 'strong';
  if (a >= 2) return 'moderate';
  if (a >= 1.3) return 'possible';
  return 'none';
}

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Gera os achados. `entries` = lista ordenada. `tagLabel(id)` resolve o nome de um evento.
 * Devolve { ready, count, needed, insights[], weekdays[] }.
 */
export function buildInsights(entries, tagLabel = (x) => x) {
  const count = entries.length;
  const base = { ready: count >= MIN_ENTRIES, count, needed: Math.max(0, MIN_ENTRIES - count), insights: [], weekdays: [] };
  if (!base.ready) return base;

  const moods = entries.map((e) => e.mood);
  const overall = mean(moods);
  const byDate = Object.fromEntries(entries.map((e) => [e.date, e]));
  const insights = [];

  // 1) correlações numéricas (sono, energia)
  for (const [key, label] of [['sleep', 'Sono'], ['energy', 'Energia']]) {
    const pairs = entries.filter((e) => typeof e[key] === 'number');
    if (pairs.length < 14) continue;
    const xs = pairs.map((e) => e[key]), ys = pairs.map((e) => e.mood);
    const r = pearson(xs, ys);
    if (r === null) continue;
    const ci = fisherCI(r, pairs.length);
    const st = strength(r, ci);
    if (st === 'none') continue;
    const { b, a } = slope(xs, ys);
    insights.push({ kind: key, label, r, ci, n: pairs.length, strength: st, slope: b, intercept: a, points: pairs.map((e) => ({ x: e[key], y: e.mood, date: e.date })), score: Math.abs(r) * 1.2 });
  }

  // 2) eventos: mesmo dia e dia seguinte
  const tags = new Set();
  entries.forEach((e) => (e.tags || []).forEach((t) => tags.add(t)));
  for (const tag of tags) {
    const withT = entries.filter((e) => (e.tags || []).includes(tag)).map((e) => e.mood);
    const without = entries.filter((e) => !(e.tags || []).includes(tag)).map((e) => e.mood);
    if (withT.length >= MIN_GROUP && without.length >= MIN_GROUP) {
      const w = welch(withT, without);
      const st = strengthT(w.t, w.diff);
      if (st !== 'none') insights.push({ kind: 'tag', tag, label: tagLabel(tag), diff: w.diff, t: w.t, meanWith: w.meanA, meanWithout: w.meanB, nWith: withT.length, nWithout: without.length, strength: st, score: Math.abs(w.t) / 3 });
    }
    // dia seguinte
    const next = [], rest = [];
    for (const e of entries) {
      const n = byDate[addDays(e.date, 1)];
      if (!n) continue;
      ((e.tags || []).includes(tag) ? next : rest).push(n.mood);
    }
    if (next.length >= MIN_GROUP && rest.length >= MIN_GROUP) {
      const w = welch(next, rest);
      const st = strengthT(w.t, w.diff);
      if (st !== 'none') insights.push({ kind: 'tagNext', tag, label: tagLabel(tag), diff: w.diff, t: w.t, meanWith: w.meanA, meanWithout: w.meanB, nWith: next.length, nWithout: rest.length, strength: st, score: Math.abs(w.t) / 3.4 });
    }
  }

  // 3) dia da semana
  const wk = Array.from({ length: 7 }, () => []);
  entries.forEach((e) => wk[fromKey(e.date).getDay()].push(e.mood));
  base.weekdays = wk.map((xs, i) => ({ day: i, name: WEEKDAYS[i], n: xs.length, mean: xs.length ? mean(xs) : null }));
  const enough = base.weekdays.filter((w) => w.n >= 3);
  if (enough.length >= 5) {
    const best = enough.reduce((a, b) => (b.mean > a.mean ? b : a));
    const worst = enough.reduce((a, b) => (b.mean < a.mean ? b : a));
    const w = welch(wk[best.day], wk[worst.day]);
    const st = strengthT(w.t, w.diff);
    if (st !== 'none' && w.diff >= 0.5) insights.push({ kind: 'weekday', best, worst, diff: w.diff, t: w.t, strength: st, score: Math.abs(w.t) / 3.6 });
  }

  base.overall = overall;
  base.insights = insights.sort((a, b) => b.score - a.score);
  return base;
}

/** Resumo simples, disponível desde o primeiro registro. */
export function summary(entries, todayKey) {
  const last = (days) => entries.filter((e) => e.date > addDays(todayKey, -days) && e.date <= todayKey);
  const l7 = last(7), l30 = last(30), prev7 = entries.filter((e) => e.date > addDays(todayKey, -14) && e.date <= addDays(todayKey, -7));
  const avg = (xs) => (xs.length ? mean(xs.map((e) => e.mood)) : null);
  const have = new Set(entries.map((e) => e.date));
  let streak = 0, k = have.has(todayKey) ? todayKey : addDays(todayKey, -1);
  while (have.has(k)) { streak++; k = addDays(k, -1); }
  const sl = l30.filter((e) => typeof e.sleep === 'number');
  return { avg7: avg(l7), avg30: avg(l30), prev7: avg(prev7), n7: l7.length, n30: l30.length, streak, sleep30: sl.length ? mean(sl.map((e) => e.sleep)) : null, total: entries.length };
}
