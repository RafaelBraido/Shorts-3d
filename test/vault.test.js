import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, seal, open, newSalt, toB64, fromB64 } from '../js/vault.js';

const FAST = 1000; // poucas iterações só para o teste ficar rápido

test('cifra e decifra com a mesma senha', async () => {
  const salt = newSalt();
  const key = await deriveKey('SenhaDeTeste1', salt, FAST);
  const data = { entries: { '2026-11-25': { date: '2026-11-25', mood: 4, note: 'olá, ação ✓' } }, customTags: [] };
  const box = await seal(key, data);
  assert.ok(!JSON.stringify(box).includes('olá'), 'o texto não pode aparecer em claro');
  const again = await deriveKey('SenhaDeTeste1', salt, FAST);
  assert.deepEqual(await open(again, box), data);
});

test('senha errada não abre', async () => {
  const salt = newSalt();
  const box = await seal(await deriveKey('certa-123', salt, FAST), { a: 1 });
  await assert.rejects(open(await deriveKey('errada-123', salt, FAST), box));
});

test('dado alterado é rejeitado (integridade)', async () => {
  const salt = newSalt();
  const key = await deriveKey('certa-123', salt, FAST);
  const box = await seal(key, { a: 1 });
  const bytes = fromB64(box.ct); bytes[0] ^= 1;
  await assert.rejects(open(key, { iv: box.iv, ct: toB64(bytes) }));
});

test('cada gravação usa um IV diferente', async () => {
  const key = await deriveKey('x-123456', newSalt(), FAST);
  const a = await seal(key, { a: 1 }), b = await seal(key, { a: 1 });
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test('senha com acentos: normalização igual', async () => {
  const salt = newSalt();
  const box = await seal(await deriveKey('Senáha1', salt, FAST), { ok: true }); // a + acento combinado
  assert.deepEqual(await open(await deriveKey('Senáha1', salt, FAST), box), { ok: true }); // á composto
});
