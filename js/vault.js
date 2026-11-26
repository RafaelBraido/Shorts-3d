// Criptografia do diário, 100% no navegador (Web Crypto).
// A senha vira uma chave com PBKDF2 (SHA-256) e os dados são cifrados com AES-GCM de 256 bits.
// A senha nunca é guardada: só dá para abrir o diário sabendo a senha.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITER = 600000; // custo da derivação: torna cada tentativa de senha lenta

export function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const newSalt = () => crypto.getRandomValues(new Uint8Array(16));

export async function deriveKey(password, salt, iterations = ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Cifra um objeto com um IV novo a cada gravação. */
export async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** Decifra; lança erro se a senha (chave) estiver errada ou o dado tiver sido alterado. */
export async function open(key, { iv, ct }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct));
  return JSON.parse(dec.decode(pt));
}
