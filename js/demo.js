// Dados de exemplo inventados (para ver os Padrões antes de ter histórico próprio).
// Relações embutidas: dormir mais ajuda; esporte e amigos ajudam; telas até tarde pesam no dia seguinte.
import { addDays } from './stats.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function makeDemo(todayKey, days = 56) {
  const rand = rng(42);
  const gauss = () => (rand() + rand() + rand() + rand() - 2) * 1.2;
  const out = {};
  let telasOntem = false;
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(todayKey, -i);
    if (rand() < 0.08) { telasOntem = false; continue; } // dias sem registro
    const sleep = Math.round(Math.max(5.5, Math.min(11, 8.5 + gauss() * 1.1)) * 2) / 2;
    const tags = [];
    const dow = new Date(date + 'T12:00:00').getDay();
    const escola = dow >= 1 && dow <= 5 && rand() < 0.6;
    const esporte = rand() < 0.35;
    const amigos = rand() < (dow === 5 || dow === 6 ? 0.6 : 0.25);
    const telas = (dow === 5 || dow === 6 || rand() < 0.1) && rand() < 0.5;
    if (escola) tags.push('escola');
    if (esporte) tags.push('esporte');
    if (amigos) tags.push('amigos');
    if (telas) tags.push('telas');
    let mood = 3.3 + 0.45 * (sleep - 8.5) + (esporte ? 0.8 : 0) + (amigos ? 0.5 : 0) - (escola ? 0.45 : 0) - (telasOntem ? 0.9 : 0) + gauss() * 0.45;
    mood = Math.max(1, Math.min(5, Math.round(mood)));
    const energy = Math.max(1, Math.min(5, Math.round(2.9 + (mood - 3.2) * 0.6 + (sleep - 8.5) * 0.2 + gauss() * 0.5)));
    const note = mood >= 4 ? 'Foi um dia bom.' : mood <= 2 ? 'Dia pesado.' : '';
    out[date] = { date, mood, sleep, energy, tags, note, demo: true };
    telasOntem = telas;
  }
  return out;
}
