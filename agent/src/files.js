import fs from 'node:fs';
import path from 'node:path';

const MAX_ENTRIES = 500;

/** Acesso a arquivos restrito a pastas liberadas. Caminhos virtuais: "/Downloads/sub/arquivo". */
export function makeFiles(roots) {
  const map = new Map();
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    map.set(path.basename(r) || r, fs.realpathSync(r));
  }

  const inside = (real, base) => real === base || real.startsWith(base + path.sep);

  /** Resolve um caminho virtual para um caminho real seguro (precisa existir). */
  function resolve(virtual) {
    const parts = String(virtual || '').split('/').filter(Boolean);
    if (!parts.length) return null; // lista de raízes
    const base = map.get(parts[0]);
    if (!base) throw new Error('pasta não liberada');
    const real = fs.realpathSync(path.resolve(base, ...parts.slice(1))); // segue symlinks
    if (!inside(real, base)) throw new Error('fora da pasta liberada');
    return real;
  }

  function list(virtual) {
    const real = resolve(virtual);
    if (real === null) {
      return [...map.keys()].map((name) => ({ name, dir: true, size: 0 }));
    }
    const out = [];
    for (const d of fs.readdirSync(real, { withFileTypes: true })) {
      if (out.length >= MAX_ENTRIES) break;
      try {
        const st = fs.statSync(path.join(real, d.name));
        out.push({ name: d.name, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs });
      } catch { /* arquivo sumiu/sem permissão: ignora */ }
    }
    return out.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
  }

  function fileForDownload(virtual) {
    const real = resolve(virtual);
    if (!real || !fs.statSync(real).isFile()) throw new Error('não é um arquivo');
    return real;
  }

  /** Destino de upload: pasta virtual existente + nome sanitizado. */
  function uploadTarget(virtualDir, name) {
    const dir = resolve(virtualDir);
    if (!dir || !fs.statSync(dir).isDirectory()) throw new Error('escolha uma pasta');
    const safe = path.basename(String(name || '')).replace(/[\\/:*?"<>|\0]/g, '_');
    if (!safe || safe === '.' || safe === '..') throw new Error('nome inválido');
    return path.join(dir, safe);
  }

  return { list, fileForDownload, uploadTarget, roots: [...map.keys()] };
}
