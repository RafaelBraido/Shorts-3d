import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { buildMagicPacket, parseMac } from '../src/wol.js';
import { PowerManager, COMMANDS } from '../src/power.js';
import { createAgent } from '../src/server.js';

test('magic packet tem 102 bytes e formato correto', () => {
  const p = buildMagicPacket('AA:BB:CC:DD:EE:FF');
  assert.equal(p.length, 102);
  assert.deepEqual([...p.subarray(0, 6)], Array(6).fill(255));
  assert.deepEqual([...p.subarray(96)], [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
  assert.deepEqual(parseMac('aa-bb-cc-dd-ee-ff'), parseMac('AABBCCDDEEFF'));
  assert.throws(() => parseMac('xyz'));
});

test('todas as plataformas têm os mesmos comandos básicos', () => {
  for (const p of Object.keys(COMMANDS)) {
    for (const a of ['shutdown', 'restart', 'sleep', 'lock']) assert.ok(COMMANDS[p][a], `${p}/${a}`);
  }
});

test('PowerManager agenda, bloqueia duplicado e cancela', () => {
  const pm = new PowerManager({ allowed: ['shutdown'], platform: 'linux', dryRun: true });
  pm.schedule('shutdown', 30);
  assert.throws(() => pm.schedule('shutdown', 30), /pendente/);
  assert.equal(pm.cancel(), true);
  assert.throws(() => pm.schedule('restart', 1), /não suportada/);
});

function open(port, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { 'x-pcr-token': token } });
    ws.log = [];
    ws.on('message', (raw) => ws.log.push(JSON.parse(raw)));
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('unexpected-response', (_, res) => reject(new Error(`HTTP ${res.statusCode}`)));
  });
}
// espera por mensagem (já recebida ou futura) que satisfaça pred
const next = async (ws, pred) => {
  for (let i = 0; i < 100; i++) {
    const m = ws.log.find(pred);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timeout aguardando mensagem');
};

test('WS: auth, hello, power com cancelamento', async () => {
  process.env.PCR_DRY_RUN = '1';
  const agent = createAgent({ port: 0, host: '127.0.0.1', token: 'segredo', allowedActions: ['shutdown', 'sleep'], defaultDelaySec: 5 });
  await agent.listen();
  const port = agent.server.address().port;
  await assert.rejects(open(port, 'errado'), /401/);

  const ws = await open(port, 'segredo');
  const info = await next(ws, (m) => m.type === 'hello');
  assert.ok(info.actions.includes('shutdown'));

  ws.send(JSON.stringify({ id: 1, type: 'power', action: 'shutdown', delaySec: 30 }));
  const ack = await next(ws, (m) => m.type === 'ack' && m.id === 1);
  assert.equal(ack.ok, true);
  ws.send(JSON.stringify({ id: 2, type: 'cancel' }));
  const c = await next(ws, (m) => m.type === 'ack' && m.id === 2);
  assert.equal(c.cancelled, true);
  ws.send(JSON.stringify({ id: 3, type: 'power', action: 'hibernate' }));
  assert.equal((await next(ws, (m) => m.id === 3)).ok, false);

  ws.close();
  agent.close();
});
