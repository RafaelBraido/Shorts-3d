import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { PowerManager } from './power.js';
import { sendMagicPacket } from './wol.js';
import { plugSwitch } from './plug.js';

export const VERSION = '1.0.0';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
export const tokenOk = (given, expected) => crypto.timingSafeEqual(sha(given), sha(expected));

export function localMacs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal && i.mac !== '00:00:00:00:00:00') {
        out.push({ iface: name, ip: i.address, mac: i.mac, netmask: i.netmask });
      }
    }
  }
  return out;
}

function cpuSampler() {
  let prev = os.cpus();
  return () => {
    const cur = os.cpus();
    let idle = 0, total = 0;
    cur.forEach((c, i) => {
      const p = prev[i];
      for (const k of Object.keys(c.times)) total += c.times[k] - p.times[k];
      idle += c.times.idle - p.times.idle;
    });
    prev = cur;
    return total ? Math.round((1 - idle / total) * 100) : 0;
  };
}

export function createAgent(cfg) {
  const clients = new Set();
  const fails = new Map(); // ip -> { n, until }
  let state = 'online';
  let pending = null;
  const sampleCpu = cpuSampler();

  const broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const ws of clients) if (ws.readyState === 1) ws.send(data);
  };

  const power = new PowerManager({
    allowed: cfg.allowedActions,
    onState: (p) => {
      if ('state' in p) state = p.state;
      if ('pending' in p) pending = p.pending;
      broadcast({ type: 'state', state, pending, error: p.error });
    },
  });

  const hello = () => ({
    type: 'hello',
    version: VERSION,
    hostname: os.hostname(),
    platform: os.platform(),
    nics: localMacs(),
    actions: cfg.allowedActions.filter((a) => power.supports(a)),
    state,
    pending,
  });

  const statusMsg = () => ({
    type: 'status',
    state,
    pending,
    uptimeSec: Math.round(os.uptime()),
    cpu: sampleCpu(),
    memUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100),
  });

  async function handle(ws, msg) {
    const reply = (extra) => ws.send(JSON.stringify({ type: 'ack', id: msg.id, ok: true, ...extra }));
    const fail = (error) => ws.send(JSON.stringify({ type: 'ack', id: msg.id, ok: false, error }));
    try {
      switch (msg.type) {
        case 'ping': return ws.send(JSON.stringify({ type: 'pong', id: msg.id }));
        case 'info': return ws.send(JSON.stringify(hello()));
        case 'power': {
          const r = power.schedule(msg.action, msg.delaySec ?? cfg.defaultDelaySec);
          return reply({ pending: r });
        }
        case 'cancel': return reply({ cancelled: power.cancel() });
        case 'wol': // acorda OUTRA máquina da LAN a partir deste PC
          await sendMagicPacket(msg.mac, msg.broadcast ? { broadcast: msg.broadcast } : {});
          return reply();
        case 'plug':
          if (!['on', 'off'].includes(msg.state)) return fail('state deve ser on|off');
          await plugSwitch(cfg.plug, msg.state);
          return reply();
        default: return fail(`tipo desconhecido: ${msg.type}`);
      }
    } catch (e) {
      fail(e.message);
    }
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, name: 'pc-remote-agent', version: VERSION }));
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const ip = req.socket.remoteAddress;
    const f = fails.get(ip);
    if (f && f.until > Date.now()) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return socket.destroy(); }
    const url = new URL(req.url, 'http://x');
    const given = req.headers['x-pcr-token'] || url.searchParams.get('token') || '';
    if (!tokenOk(given, cfg.token)) {
      const n = (f?.n ?? 0) + 1;
      fails.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    fails.delete(ip);
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.send(JSON.stringify(hello()));
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        handle(ws, msg);
      });
      ws.on('close', () => clients.delete(ws));
    });
  });

  const ticker = setInterval(() => broadcast(statusMsg()), 3000);
  ticker.unref();

  return {
    server,
    power,
    listen: () => new Promise((r) => server.listen(cfg.port, cfg.host, r)),
    close: () => { clearInterval(ticker); for (const c of clients) c.terminate(); wss.close(); server.close(); },
  };
}
