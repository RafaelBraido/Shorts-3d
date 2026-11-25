// Armazenamento 100% local (localStorage). Nada sai do navegador.
const KEY = 'mare:v1';

const empty = () => ({ version: 1, entries: {}, customTags: [] });

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    return { ...empty(), ...data, entries: data.entries || {}, customTags: data.customTags || [] };
  } catch {
    return empty();
  }
}

let state = read();
let storageOk = true;

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch {
    storageOk = false; // modo privado ou cota cheia
  }
  return storageOk;
}

export const store = {
  get ok() { return storageOk; },
  entries: () => state.entries,
  get: (date) => state.entries[date] || null,
  customTags: () => state.customTags,
  hasReal: () => Object.values(state.entries).some((e) => !e.demo),
  hasDemo: () => Object.values(state.entries).some((e) => e.demo),
  save(entry) { state.entries[entry.date] = entry; return persist(); },
  remove(date) { delete state.entries[date]; return persist(); },
  addCustomTag(tag) {
    if (!state.customTags.some((t) => t.id === tag.id)) state.customTags.push(tag);
    return persist();
  },
  removeDemo() {
    for (const [k, e] of Object.entries(state.entries)) if (e.demo) delete state.entries[k];
    return persist();
  },
  loadDemo(entries) {
    for (const [k, e] of Object.entries(entries)) if (!state.entries[k]) state.entries[k] = e;
    return persist();
  },
  clearAll() {
    state = empty();
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
  exportJson() {
    const real = Object.fromEntries(Object.entries(state.entries).filter(([, e]) => !e.demo));
    return JSON.stringify({ app: 'mare', version: 1, exportedAt: new Date().toISOString(), entries: real, customTags: state.customTags }, null, 2);
  },
  exportCsv(tagLabel) {
    const rows = Object.values(state.entries).filter((e) => !e.demo).sort((a, b) => (a.date < b.date ? -1 : 1));
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const head = ['data', 'humor', 'sono_horas', 'energia', 'eventos', 'nota'];
    return [head.join(','), ...rows.map((e) => [e.date, e.mood, e.sleep ?? '', e.energy ?? '', esc((e.tags || []).map(tagLabel).join('; ')), esc(e.note)].join(','))].join('\n');
  },
  /** Importa JSON exportado pelo app. mode: 'merge' | 'replace'. Valida cada registro. */
  importJson(text, mode) {
    const data = JSON.parse(text);
    if (!data || typeof data.entries !== 'object') throw new Error('Arquivo não reconhecido.');
    const ok = {};
    for (const e of Object.values(data.entries)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e?.date) || !Number.isFinite(e.mood) || e.mood < 1 || e.mood > 5) continue;
      ok[e.date] = {
        date: e.date, mood: Math.round(e.mood),
        sleep: Number.isFinite(e.sleep) ? Math.min(16, Math.max(0, e.sleep)) : null,
        energy: Number.isFinite(e.energy) ? Math.min(5, Math.max(1, Math.round(e.energy))) : null,
        tags: Array.isArray(e.tags) ? e.tags.filter((t) => typeof t === 'string').slice(0, 30) : [],
        note: typeof e.note === 'string' ? e.note.slice(0, 5000) : '',
      };
    }
    const count = Object.keys(ok).length;
    if (!count) throw new Error('Nenhum registro válido no arquivo.');
    if (mode === 'replace') state = empty();
    else this.removeDemo();
    Object.assign(state.entries, ok);
    for (const t of data.customTags || []) if (t?.id && t?.label) this.addCustomTag({ id: String(t.id), label: String(t.label).slice(0, 30) });
    persist();
    return count;
  },
  async size() {
    try { return new Blob([localStorage.getItem(KEY) || '']).size; } catch { return 0; }
  },
};
