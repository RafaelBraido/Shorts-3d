// Armazenamento local e protegido por senha. Nada sai do navegador.
// Os registros ficam cifrados (AES-GCM) em localStorage; em memória só existem enquanto o diário está aberto.
import { ITER, deriveKey, seal, open, newSalt, toB64, fromB64 } from './vault.js';

const KEY = 'mare:v2'; // cofre cifrado
const OLD = 'mare:v1'; // versão sem senha (migrada na primeira criação de senha)

const empty = () => ({ version: 1, entries: {}, customTags: [] });
const normalize = (data) => ({ ...empty(), ...data, entries: data?.entries || {}, customTags: data?.customTags || [] });

let state = empty();
let key = null, salt = null, iter = ITER;
let storageOk = true;
let chain = Promise.resolve(true);

const rawVault = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/** Cifra um retrato do estado e grava, em fila, para gravações não se atropelarem. */
function persist() {
  if (!key) return Promise.resolve(true);
  const k = key, s = salt, it = iter, snapshot = JSON.parse(JSON.stringify(state));
  chain = chain.then(async () => {
    try {
      const box = await seal(k, snapshot);
      localStorage.setItem(KEY, JSON.stringify({ v: 2, iter: it, salt: toB64(s), ...box }));
      storageOk = true;
    } catch {
      storageOk = false; // modo privado ou cota cheia
    }
    return storageOk;
  });
  return chain;
}

export const store = {
  get ok() { return storageOk; },

  /* ---------- senha ---------- */
  /** 'nopass' = ainda não tem senha · 'locked' = tem senha, fechado · 'open' = aberto */
  status: () => (key ? 'open' : rawVault() ? 'locked' : 'nopass'),
  async create(password) {
    let seed = empty();
    try { const old = localStorage.getItem(OLD); if (old) seed = normalize(JSON.parse(old)); } catch { /* ignora */ }
    salt = newSalt(); iter = ITER; key = await deriveKey(password, salt, iter); state = seed;
    const ok = await persist();
    if (!ok) { key = null; state = empty(); throw new Error('storage'); }
    try { localStorage.removeItem(OLD); } catch { /* ignora */ }
  },
  /** Devolve true se a senha abriu o cofre. */
  async unlock(password) {
    try {
      const v = JSON.parse(rawVault());
      const k = await deriveKey(password, fromB64(v.salt), v.iter);
      state = normalize(await open(k, v));
      key = k; salt = fromB64(v.salt); iter = v.iter;
      return true;
    } catch { return false; }
  },
  /** Confere a senha sem abrir nada (usado ao trocar de senha). */
  async verify(password) {
    try { const v = JSON.parse(rawVault()); await open(await deriveKey(password, fromB64(v.salt), v.iter), v); return true; } catch { return false; }
  },
  async changePassword(password) {
    salt = newSalt(); iter = ITER; key = await deriveKey(password, salt, iter);
    return persist();
  },
  /** Relê o cofre (outra aba gravou). 'ok' = atualizado · 'relock' = senha trocada em outra aba · 'gone' = apagado. */
  async reload() {
    try {
      const raw = rawVault();
      if (!raw) return 'gone';
      const v = JSON.parse(raw);
      if (!salt || v.salt !== toB64(salt)) return 'relock';
      state = normalize(await open(key, v));
      return 'ok';
    } catch { return 'relock'; }
  },
  /** Fecha o diário: apaga os dados da memória. */
  lock() { key = null; salt = null; state = empty(); },

  /* ---------- registros ---------- */
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
  /** Apaga tudo, inclusive a senha: volta ao começo. */
  clearAll() {
    state = empty(); key = null; salt = null;
    try { localStorage.removeItem(KEY); localStorage.removeItem(OLD); } catch { /* ignora */ }
  },
  exportJson() {
    const real = Object.fromEntries(Object.entries(state.entries).filter(([, e]) => !e.demo));
    return JSON.stringify({ app: 'mare', version: 1, exportedAt: new Date().toISOString(), entries: real, customTags: state.customTags }, null, 2);
  },
  exportCsv(tagLabel) {
    const rows = Object.values(state.entries).filter((e) => !e.demo).sort((a, b) => (a.date < b.date ? -1 : 1));
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const head = ['data', 'nota', 'sono_horas', 'energia', 'eventos', 'resumo'];
    return [head.join(','), ...rows.map((e) => [e.date, e.mood, e.sleep ?? '', e.energy ?? '', esc((e.tags || []).map(tagLabel).join('; ')), esc(e.note)].join(','))].join('\n');
  },
  /** Importa JSON exportado pelo app. Valida cada registro. */
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
        note: typeof e.note === 'string' ? e.note.slice(0, 280) : '',
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
    return new Blob([rawVault() || '']).size;
  },
};
