export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? '–' : x.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d }));
export const fmtSigned = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x), d);
export const hours = (h) => { if (h === null || h === undefined) return '–'; const t = Math.round((h * 60) / 5) * 5; const hh = Math.floor(t / 60); const mm = t % 60; return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`; };

const dfLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const dfShort = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format;
const dfMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const dfWk = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
export const dateLong = (d) => dfLong.format(d);
export const dateShort = (d) => dfShort(d).replace('.', '');
export const monthYear = (d) => dfMonth.format(d);
export const weekday = (d) => dfWk.format(d);
