import http from 'node:http';
import os from 'node:os';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { PowerManager } from './power.js';
import { sendMagicPacket } from './wol.js';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { plugSwitch } from './plug.js';
import { makeFiles } from './files.js';
import { streamChat, listModels } from './ollama.js';

export const VERSION = '1.1.0';

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
  const files = makeFiles(cfg.fileRoots ?? []);
  const chats = new Map(); // ws -> AbortController

  // 5 tokens errados = bloqueio de 60 s por IP (vale para WS e HTTP).
  const blocked = (ip) => (fails.get(ip)?.until ?? 0) > Date.now();
  const authed = (ip, given) => {
    if (blocked(ip)) return false;
    if (tokenOk(given, cfg.token)) { fails.delete(ip); return true; }
    const n = (fails.get(ip)?.n ?? 0) + 1;
    fails.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    return false;
  };

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
        case 'ls': return reply({ path: msg.path ?? '', entries: files.list(msg.path) });
        case 'models': return reply({ models: await listModels(cfg.ollama.url), model: cfg.ollama.model });
        case 'chat': {
          chats.get(ws)?.abort();
          const ctl = new AbortController();
          chats.set(ws, ctl);
          reply(); // ack imediato; o texto vem em chat_chunk
          const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'chat_chunk', id: msg.id, ...o }));
          streamChat({
            url: cfg.ollama.url,
            model: msg.model || cfg.ollama.model,
            messages: msg.messages,
            signal: ctl.signal,
            onText: (text) => send({ text }),
          }).then(() => send({ done: true }), (e) => send({ done: true, error: ctl.signal.aborted ? undefined : e.message }));
          return;
        }
        case 'chat_stop': chats.get(ws)?.abort(); return reply();
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
    const url = new URL(req.url, 'http://x');
    const given = req.headers['x-pcr-token'] || url.searchParams.get('token') || '';
    if (!['/download', '/upload'].includes(url.pathname)) return res.writeHead(404).end();
    if (blocked(req.socket.remoteAddress)) return res.writeHead(429).end();
    if (!authed(req.socket.remoteAddress, given)) return res.writeHead(401).end();
    const fail = (code, msg) => { if (!res.headersSent) res.writeHead(code, { 'content-type': 'text/plain' }); res.end(msg); };
    try {
      if (url.pathname === '/download' && req.method === 'GET') return download(req, res, url, fail);
      if (url.pathname === '/upload' && req.method === 'PUT') return upload(req, res, url, fail);
      return fail(405, 'método não permitido');
    } catch (e) { return fail(400, e.message); }
  });

  function download(req, res, url, fail) {
    const file = files.fileForDownload(url.searchParams.get('path'));
    const { size } = fs.statSync(file);
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = size - 1, code = 200;
    if (range && (range[1] || range[2])) {
      if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), size - 1); }
      else { start = Math.max(size - Number(range[2]), 0); }
      if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
      code = 206;
    }
    const headers = {
      'content-type': 'application/octet-stream',
      'content-length': end - start + 1,
      'accept-ranges': 'bytes',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
    };
    if (code === 206) headers['content-range'] = `bytes ${start}-${end}/${size}`;
    res.writeHead(code, headers);
    pipeline(fs.createReadStream(file, { start, end }), res).catch(() => res.destroy());
  }

  function freeName(file) {
    const { dir, name, ext } = path.parse(file);
    let out = file;
    for (let i = 1; fs.existsSync(out) && i < 1000; i++) out = path.join(dir, `${name} (${i})${ext}`);
    return out;
  }

  async function upload(req, res, url, fail) {
    const limit = (cfg.maxUploadMB ?? 2048) * 1024 * 1024;
    if (Number(req.headers['content-length'] || 0) > limit) return fail(413, 'arquivo grande demais');
    const wanted = files.uploadTarget(url.searchParams.get('dir'), url.searchParams.get('name'));
    const target = freeName(wanted); // nunca sobrescreve: "foto.jpg" -> "foto (1).jpg"
    const tmp = `${target}.part`;
    let bytes = 0;
    req.on('data', (c) => { bytes += c.length; if (bytes > limit) req.destroy(); });
    try {
      await pipeline(req, fs.createWriteStream(tmp, { flags: 'wx' }));
      fs.renameSync(tmp, target);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: path.basename(target), bytes }));
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      fail(500, 'falha no upload');
    }
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const ip = req.socket.remoteAddress;
    if (blocked(ip)) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return socket.destroy(); }
    const url = new URL(req.url, 'http://x');
    const given = req.headers['x-pcr-token'] || url.searchParams.get('token') || '';
    if (!authed(ip, given)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.send(JSON.stringify(hello()));
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        handle(ws, msg);
      });
      ws.on('close', () => { clients.delete(ws); chats.get(ws)?.abort(); chats.delete(ws); });
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
