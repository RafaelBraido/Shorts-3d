// Dados de exemplo sintéticos (para ver os Padrões antes de ter histórico próprio).
// Relações embutidas: mais sono → humor melhor; exercício ajuda; álcool pesa no dia seguinte.
import { addDays } from './stats.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function makeDemo(todayKey, days = 56) {
  const rand = rng(42);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.2;
  const out = {};
  let drankYesterday = false;
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(todayKey, -i);
    if (rand() < 0.08) { drankYesterday = false; continue; } // dias sem registro
    const sleep = Math.round(Math.max(4.5, Math.min(9.5, 7 + gauss() * 1.1)) * 2) / 2;
    const tags = [];
    const dow = new Date(date + 'T12:00:00').getDay();
    const work = dow >= 1 && dow <= 5 && rand() < 0.55;
    const exercise = rand() < 0.35;
    const social = rand() < (dow === 5 || dow === 6 ? 0.55 : 0.2);
    const alcohol = (dow === 5 || dow === 6) && rand() < 0.45;
    if (work) tags.push('trabalho');
    if (exercise) tags.push('exercicio');
    if (social) tags.push('social');
    if (alcohol) tags.push('alcool');
    let mood = 5.4 + 0.75 * (sleep - 7) + (exercise ? 1.1 : 0) + (social ? 0.6 : 0) - (work ? 0.7 : 0) - (drankYesterday ? 1.2 : 0) + gauss() * 0.9;
    mood = Math.max(1, Math.min(10, Math.round(mood)));
    const energy = Math.max(1, Math.min(5, Math.round(2.9 + (mood - 5.5) * 0.35 + (sleep - 7) * 0.2 + gauss() * 0.5)));
    out[date] = { date, mood, sleep, energy, tags, note: '', demo: true };
    drankYesterday = alcohol;
  }
  return out;
}
