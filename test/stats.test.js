import test from 'node:test';
import assert from 'node:assert/strict';
import { pearson, fisherCI, welch, buildInsights, summary, sortedEntries, MIN_ENTRIES, addDays } from '../js/stats.js';
import { makeDemo } from '../js/demo.js';

test('pearson: correlação perfeita e inversa', () => {
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  assert.ok(Math.abs(pearson([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-9);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
});

test('fisherCI contém r e estreita com mais dados', () => {
  const small = fisherCI(0.5, 10), big = fisherCI(0.5, 100);
  assert.ok(small[0] < 0.5 && small[1] > 0.5);
  assert.ok(big[1] - big[0] < small[1] - small[0]);
});

test('welch: diferença e sinal', () => {
  const w = welch([8, 9, 8, 9, 10], [4, 5, 4, 5, 6]);
  assert.ok(w.diff > 3 && w.t > 5);
});

test('abaixo do mínimo não gera correlações', () => {
  const today = '2026-11-25';
  const few = sortedEntries(makeDemo(today, 14));
  const r = buildInsights(few);
  assert.equal(r.ready, false);
  assert.equal(r.insights.length, 0);
  assert.ok(r.needed > 0);
});

test('dados de exemplo revelam sono, exercício e álcool no dia seguinte', () => {
  const entries = sortedEntries(makeDemo('2026-11-25', 70));
  assert.ok(entries.length >= MIN_ENTRIES);
  const r = buildInsights(entries, (t) => t);
  assert.equal(r.ready, true);
  const sleep = r.insights.find((i) => i.kind === 'sleep');
  assert.ok(sleep && sleep.r > 0.3, 'sono deveria correlacionar positivamente');
  const ex = r.insights.find((i) => i.kind === 'tag' && i.tag === 'exercicio');
  assert.ok(ex && ex.diff > 0, 'exercício deveria elevar o humor');
  const al = r.insights.find((i) => i.kind === 'tagNext' && i.tag === 'alcool');
  assert.ok(al && al.diff < 0, 'álcool deveria pesar no dia seguinte');
});

test('ruído puro não deve inventar achados fortes', () => {
  let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const entries = [];
  for (let i = 0; i < 60; i++) entries.push({ date: addDays('2026-10-01', i), mood: 1 + Math.floor(rnd() * 10), sleep: 5 + Math.floor(rnd() * 8) / 2, energy: 1 + Math.floor(rnd() * 5), tags: rnd() < 0.4 ? ['x'] : [] });
  const strong = buildInsights(entries).insights.filter((i) => i.strength === 'strong');
  assert.equal(strong.length, 0);
});

test('summary: sequência de dias', () => {
  const today = '2026-11-25';
  const e = sortedEntries({ a: { date: today, mood: 6 }, b: { date: addDays(today, -1), mood: 5 }, c: { date: addDays(today, -3), mood: 7 } });
  assert.equal(summary(e, today).streak, 2);
});
