import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { makeFiles } from '../src/files.js';
import { createAgent } from '../src/server.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcr-'));
const root = path.join(tmp, 'Downloads');
fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
fs.writeFileSync(path.join(root, 'a.txt'), '0123456789');
fs.writeFileSync(path.join(tmp, 'segredo.txt'), 'nao pode');
fs.symlinkSync(path.join(tmp, 'segredo.txt'), path.join(root, 'atalho.txt'));

test('files: lista, bloqueia ../ e symlink para fora', () => {
  const f = makeFiles([root]);
  assert.deepEqual(f.list('').map((e) => e.name), ['Downloads']);
  assert.deepEqual(f.list('/Downloads').map((e) => e.name), ['sub', 'a.txt', 'atalho.txt']);
  assert.throws(() => f.list('/Downloads/../'), /fora/);
  assert.throws(() => f.fileForDownload('/Downloads/atalho.txt'), /fora/);
  assert.throws(() => f.list('/Outra'), /não liberada/);
  assert.throws(() => f.uploadTarget('/Downloads', '..'), /inválido/);
  assert.equal(path.basename(f.uploadTarget('/Downloads', '../../x.txt')), 'x.txt');
});

// Ollama falso: responde 3 tokens em NDJSON
const fake = http.createServer((req, res) => {
  res.write(JSON.stringify({ message: { content: 'Olá' } }) + '\n');
  res.write(JSON.stringify({ message: { content: ', ' } }) + '\n');
  res.end(JSON.stringify({ message: { content: 'mundo' }, done: true }) + '\n');
});

test('HTTP download (Range), upload e chat em streaming', async () => {
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const agent = createAgent({
    port: 0, host: '127.0.0.1', token: 't', allowedActions: [], fileRoots: [root], maxUploadMB: 1,
    ollama: { url: `http://127.0.0.1:${fake.address().port}`, model: 'x' },
  });
  await agent.listen();
  const base = `http://127.0.0.1:${agent.server.address().port}`;
  const H = { 'x-pcr-token': 't' };

  assert.equal((await fetch(`${base}/download?path=/Downloads/a.txt`)).status, 401);
  const full = await fetch(`${base}/download?path=/Downloads/a.txt`, { headers: H });
  assert.equal(await full.text(), '0123456789');
  const part = await fetch(`${base}/download?path=/Downloads/a.txt`, { headers: { ...H, range: 'bytes=3-5' } });
  assert.equal(part.status, 206);
  assert.equal(await part.text(), '345');
  assert.equal((await fetch(`${base}/download?path=/Downloads/atalho.txt`, { headers: H })).status, 400);

  const up = await fetch(`${base}/upload?dir=/Downloads/sub&name=${encodeURIComponent('../novo.txt')}`, { method: 'PUT', headers: H, body: 'oi' });
  assert.equal(up.status, 201);
  assert.equal(fs.readFileSync(path.join(root, 'sub', 'novo.txt'), 'utf8'), 'oi');
  assert.equal(fs.existsSync(path.join(root, 'novo.txt')), false);
  const again = await fetch(`${base}/upload?dir=/Downloads&name=a.txt`, { method: 'PUT', headers: H, body: 'novo' });
  assert.equal(JSON.parse(await again.text()).name, 'a (1).txt');
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), '0123456789'); // original intacto
  const big = await fetch(`${base}/upload?dir=/Downloads&name=big`, { method: 'PUT', headers: { ...H, 'content-length': String(2 * 1024 * 1024) }, body: Buffer.alloc(2 * 1024 * 1024) }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);

  const ws = new WebSocket(`ws://${base.slice(7)}`, { headers: H });
  const log = [];
  ws.on('message', (r) => log.push(JSON.parse(r)));
  await new Promise((r) => ws.once('open', r));
  ws.send(JSON.stringify({ id: 1, type: 'ls', path: '/Downloads' }));
  ws.send(JSON.stringify({ id: 2, type: 'chat', messages: [{ role: 'user', content: 'oi' }] }));
  for (let i = 0; i < 100 && !log.some((m) => m.type === 'chat_chunk' && m.done); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(log.find((m) => m.id === 1 && m.type === 'ack').entries.length, 4);
  assert.equal(log.filter((m) => m.text).map((m) => m.text).join(''), 'Olá, mundo');

  for (let i = 0; i < 5; i++) await fetch(`${base}/download?path=/Downloads/a.txt`, { headers: { 'x-pcr-token': 'x' } });
  assert.equal((await fetch(`${base}/download?path=/Downloads/a.txt`, { headers: { 'x-pcr-token': 't' } })).status, 429); // bloqueado mesmo com token certo

  ws.close(); agent.close(); fake.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
