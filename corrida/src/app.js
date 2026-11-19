import * as THREE from 'three';

/* Corrida em Ponta Grossa — ponto de vista do corredor (hyperlapse). Cenário 3D ilustrativo;
 * o traçado segue o mapa de divulgação do evento. Tudo é função pura de t => render determinístico. */
const W = 1080, H = 1920, DEG = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
let seed = 4242; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const TL = await fetch('/out/timeline.json').then(r => r.json());
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const L = Object.fromEntries(TL.lines.map(l => [l.id, l]));
const S = (id, dt = 0) => L[id].start + dt, E = (id, dt = 0) => L[id].end + dt;
const Wd = (id, w, dt = 0) => { const k = L[id].words.find(x => norm(x.w) === norm(w)) || L[id].words.find(x => norm(x.w).startsWith(norm(w))); if (!k) throw new Error('palavra? ' + id + ' ' + w); return k.t0 + dt; };
const TOTAL = TL.total;

/* ------------------------------ percurso (do mapa do cartaz) ------------------------------ */
const PX = [[452, 1120], [458, 1040], [450, 970], [462, 900], [490, 850], [540, 800], [600, 750], [670, 700], [730, 648], [760, 615], [772, 598], [768, 622], [738, 662], [684, 722], [626, 802], [574, 902], [532, 1002], [494, 1086], [462, 1118]];
const TIP = 10, ROUTE_M = 3000;
let pts = PX.map(([x, y]) => new THREE.Vector3(x - 452, 0, y - 1120));
const k0 = ROUTE_M / new THREE.CatmullRomCurve3(pts, false, 'centripetal').getLength();
pts = pts.map(p => p.multiplyScalar(k0));
const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
const NS_ = 1500, SAMP = []; for (let i = 0; i <= NS_; i++) SAMP.push(curve.getPointAt(i / NS_));
const sTurn = (() => { let best = 0, bd = -1; SAMP.forEach((p, i) => { const d = p.length(); if (d > bd) { bd = d; best = i; } }); return best / NS_ * ROUTE_M; })();
const tipV = SAMP[Math.round(sTurn / ROUTE_M * NS_)], hDir = tipV.clone().setY(0).normalize(), hLen = tipV.length();
const hF = (x, z) => 16 * smooth((x * hDir.x + z * hDir.z) / hLen) + 3 * Math.sin(x / 170 + 1) * Math.cos(z / 210);
const ENDT = SAMP[NS_].clone().sub(SAMP[NS_ - 3]).setY(0).normalize();
function at(s) { if (s > ROUTE_M) return SAMP[NS_].clone().addScaledVector(ENDT, s - ROUTE_M); const f = clamp(s / ROUTE_M) * NS_, i = Math.min(Math.floor(f), NS_ - 1), u = f - i, a = SAMP[i], b = SAMP[i + 1]; return new THREE.Vector3(lerp(a.x, b.x, u), 0, lerp(a.z, b.z, u)); }
function frame(s) { const p = at(s), q = at(s + 4), r = at(Math.max(s - 4, 0)); const tg = q.clone().sub(r).setY(0).normalize(); const nr = new THREE.Vector3(-tg.z, 0, tg.x); return { p, tg, nr }; }
const onGround = (p, up = 0) => new THREE.Vector3(p.x, hF(p.x, p.z) + up, p.z);
const distToRoute = (x, z) => { let m = 1e9; for (let i = 0; i < SAMP.length; i += 2) { const dx = SAMP[i].x - x, dz = SAMP[i].z - z; const d = dx * dx + dz * dz; if (d < m) m = d; } return Math.sqrt(m); };

/* ------------------------------ cena ------------------------------ */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.5;
const scene = new THREE.Scene(); const FOG = 0xf2b27c; scene.fog = new THREE.Fog(FOG, 90, 1000); scene.background = new THREE.Color(FOG);
const camera = new THREE.PerspectiveCamera(62, W / H, 0.1, 3000);
const SUNDIR = new THREE.Vector3(0.45, 0.16, -0.88).normalize();
scene.add(new THREE.HemisphereLight(0xffe6c8, 0x8a8f9c, 1.9));
const sun = new THREE.DirectionalLight(0xffc888, 2.6); sun.position.copy(SUNDIR).multiplyScalar(500); scene.add(sun);

// céu
const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: SUNDIR } },
  vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 vD; uniform vec3 uSun; void main(){ float h=clamp(vD.y,0.,1.);
    vec3 c=mix(vec3(.96,.70,.45),vec3(.98,.46,.30),smoothstep(0.,.12,h)); c=mix(c,vec3(.42,.30,.55),smoothstep(.1,.38,h)); c=mix(c,vec3(.10,.17,.40),smoothstep(.3,.8,h));
    float s=max(dot(vD,normalize(uSun)),0.); c+=vec3(1.,.74,.40)*pow(s,24.)*.9+vec3(1.,.9,.7)*pow(s,900.)*3.; if(vD.y<0.) c=vec3(.95,.70,.48); gl_FragColor=vec4(c,1.); }` }));
scene.add(sky);

// terreno
{ const g = new THREE.PlaneGeometry(2600, 2600, 130, 130); g.rotateX(-Math.PI / 2); const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + 300, z = pos.getZ(i) - 600; pos.setXYZ(i, x, hF(x, z) - 0.15, z); const n = (Math.sin(x / 45) + Math.cos(z / 38)) * 0.04; col.set([0.55 + n, 0.60 + n, 0.38 + n], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }))); }

// pistas
function ribbon(s0, s1, hw, up, mat, off = 0) {
  const n = Math.max(2, Math.round((s1 - s0) / 3)), pos = [], idx = [];
  for (let i = 0; i <= n; i++) { const f = frame(lerp(s0, s1, i / n)), c = f.p.clone().addScaledVector(f.nr, off); for (const sg of [-1, 1]) { const q = c.clone().addScaledVector(f.nr, sg * hw); pos.push(q.x, hF(q.x, q.z) + up, q.z); } }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); scene.add(m); return m;
}
ribbon(0, ROUTE_M + 90, 10.5, 0.02, new THREE.MeshLambertMaterial({ color: 0xbdb5a6, side: THREE.DoubleSide }));
ribbon(0, ROUTE_M + 90, 6.2, 0.06, new THREE.MeshLambertMaterial({ color: 0x5d6068, side: THREE.DoubleSide }));
for (const sg of [-1, 1]) ribbon(0, ROUTE_M + 90, 0.12, 0.09, new THREE.MeshBasicMaterial({ color: 0xf4f0e0, fog: true }), sg * 5.6);
ribbon(0, sTurn + 4, 0.6, 0.1, new THREE.MeshBasicMaterial({ color: 0xffd23c }), 0);
ribbon(sTurn - 4, ROUTE_M + 90, 0.6, 0.1, new THREE.MeshBasicMaterial({ color: 0x35b6ff }), 0);
// faixa tracejada central
{ const n = Math.floor(ROUTE_M / 6), pos = [], idx = []; let q = 0; for (let i = 0; i < n; i++) { const s = i * 6 + 1, f = frame(s), g2 = frame(s + 2.6); for (const [a, b] of [[f, -1], [f, 1]]) { } const p1 = f.p, p2 = g2.p; const w = 0.09; for (const pp of [[p1, f.nr, -1], [p1, f.nr, 1], [p2, g2.nr, -1], [p2, g2.nr, 1]]) { const v = pp[0].clone().addScaledVector(pp[1], pp[2] * w); pos.push(v.x, hF(v.x, v.z) + 0.11, v.z); } idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); q += 4; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); scene.add(m); }

// prédios (geometria única, com janelas)
const winTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#d8d2c6'; x.fillRect(0, 0, 128, 128);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.fillStyle = (i * 7 + j * 3) % 5 === 0 ? '#ffd78a' : '#4b5d78'; x.fillRect(i * 32 + 7, j * 32 + 8, 18, 16); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; })();
{ const pos = [], uv = [], col = [], idx = []; let vq = 0;
  const pal = [[1, .93, .82], [.95, .78, .62], [.82, .86, .92], [.96, .85, .70], [.78, .70, .64], [.9, .9, .88], [.85, .62, .50]];
  const addBox = (cx, cz, w, d, h, rot, c) => { const y0 = Math.min(hF(cx - w / 2, cz - d / 2), hF(cx + w / 2, cz + d / 2)) - 0.5, ca = Math.cos(rot), sa = Math.sin(rot);
    const cs = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * ca - z * sa, cz + x * sa + z * ca]);
    for (let f = 0; f < 4; f++) { const a = cs[f], b = cs[(f + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y0 + h, b[1], a[0], y0 + h, a[1]); const ur = len / 4.2, vr = h / 3.6; uv.push(0, 0, ur, 0, ur, vr, 0, vr); const sh = 0.82 + 0.18 * (f % 2); for (let q = 0; q < 4; q++) col.push(c[0] * sh, c[1] * sh, c[2] * sh); idx.push(vq, vq + 1, vq + 2, vq, vq + 2, vq + 3); vq += 4; }
    pos.push(...[0, 1, 2, 3].flatMap(i => [cs[i][0], y0 + h, cs[i][1]])); uv.push(0, 0, 0.01, 0, 0.01, 0.01, 0, 0.01); for (let q = 0; q < 4; q++) col.push(0.45, 0.43, 0.42); idx.push(vq, vq + 1, vq + 2, vq, vq + 2, vq + 3); vq += 4; };
  for (let gx = -900; gx < 1000; gx += 34) for (let gz = -2000; gz < 300; gz += 34) { const x = gx + rnd() * 14, z = gz + rnd() * 14, d = distToRoute(x, z); if (d < 19 || d > 330) continue; if (rnd() < 0.28) continue;
    const near = d < 90, h = (near ? 7 : 8) + rnd() * (near ? 17 : 34) + (rnd() < 0.08 ? 25 : 0); addBox(x, z, 12 + rnd() * 14, 12 + rnd() * 14, h, (rnd() - 0.5) * 0.25 + Math.atan2(hDir.x, -hDir.z) * 0, pal[Math.floor(rnd() * pal.length)]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: winTex, vertexColors: true }))); }

// árvores, postes, espectadores (instanciados)
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), COL = new THREE.Color();
function inst(geo, mat, n) { const m = new THREE.InstancedMesh(geo, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; }
{ const trees = [], lamps = [];
  for (let s = 8; s < ROUTE_M; s += 22) for (const sg of [-1, 1]) if (rnd() < 0.8) { const f = frame(s), p = f.p.clone().addScaledVector(f.nr, sg * (8.3 + rnd() * 1.2)); trees.push(p); }
  for (let s = 20; s < ROUTE_M; s += 42) for (const sg of [-1, 1]) { const f = frame(s), p = f.p.clone().addScaledVector(f.nr, sg * 7.4); lamps.push(p); }
  const tr = inst(new THREE.ConeGeometry(2.2, 6.5, 7), new THREE.MeshLambertMaterial({ color: 0x4f7a3a }), trees.length), tk = inst(new THREE.CylinderGeometry(0.2, 0.28, 2, 6), new THREE.MeshLambertMaterial({ color: 0x5a4030 }), trees.length);
  trees.forEach((p, i) => { const sc = 0.8 + rnd() * 0.7; M4.compose(V.set(p.x, hF(p.x, p.z) + 1.9 + 3.2 * sc, p.z), Q.identity(), SC.set(sc, sc, sc)); tr.setMatrixAt(i, M4); M4.compose(V.set(p.x, hF(p.x, p.z) + 1, p.z), Q.identity(), SC.set(1, 1, 1)); tk.setMatrixAt(i, M4); }); tr.instanceMatrix.needsUpdate = tk.instanceMatrix.needsUpdate = true;
  const lp = inst(new THREE.CylinderGeometry(0.1, 0.13, 7.5, 6), new THREE.MeshLambertMaterial({ color: 0x55565c }), lamps.length), lb = inst(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: true }), lamps.length);
  lamps.forEach((p, i) => { const y = hF(p.x, p.z); M4.compose(V.set(p.x, y + 3.75, p.z), Q.identity(), SC.set(1, 1, 1)); lp.setMatrixAt(i, M4); M4.compose(V.set(p.x, y + 7.6, p.z), Q.identity(), SC.set(1, 1, 1)); lb.setMatrixAt(i, M4); }); lp.instanceMatrix.needsUpdate = lb.instanceMatrix.needsUpdate = true; }
const SHIRTS = [0xffd23c, 0x35b6ff, 0xffffff, 0xe8452c, 0x2f55f0, 0x2ecb71, 0xff8fb0];
function crowd(n, body = true) { const geo = new THREE.CapsuleGeometry(0.24, 0.95, 4, 8), m = inst(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), n), h = inst(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8a07a }), n); for (let i = 0; i < n; i++) m.setColorAt(i, COL.setHex(SHIRTS[Math.floor(rnd() * SHIRTS.length)])); return { m, h, n }; }
// espectadores fixos
const spect = []; for (let i = 0; i < 260; i++) { const s = (i < 90 ? rnd() * 140 : i < 170 ? ROUTE_M - rnd() * 140 : rnd() * ROUTE_M), sg = rnd() < 0.5 ? -1 : 1, f = frame(s); spect.push({ p: f.p.clone().addScaledVector(f.nr, sg * (7.2 + rnd() * 2.2)), ph: rnd() * 6.28, sp: 0.5 + rnd() }); }
const SP = crowd(spect.length);
// pelotão de corredores
const PACK = []; for (let i = 0; i < 70; i++) PACK.push({ off: 7 + Math.pow(rnd(), 0.8) * 65, lat: (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 3.6), ph: rnd() * 6.28, sp: 0.9 + rnd() * 0.3 });
const RP = crowd(PACK.length);

// arcos de largada e chegada
function signTex(txt, sub, c1) { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d'); x.fillStyle = c1; x.fillRect(0, 0, 1024, 256); x.fillStyle = '#ffd23c'; x.fillRect(0, 0, 1024, 14); x.fillRect(0, 242, 1024, 14);
  x.fillStyle = '#fff'; x.font = '900 120px DejaVu Sans, sans-serif'; x.textAlign = 'center'; x.fillText(txt, 512, 150); x.fillStyle = '#ffd23c'; x.font = '800 48px DejaVu Sans, sans-serif'; x.fillText(sub, 512, 215); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function arch(s, txt, sub, c1) { const f = frame(s), y = hF(f.p.x, f.p.z), g = new THREE.Group(), steel = new THREE.MeshLambertMaterial({ color: 0xdadada });
  for (const sg of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6.4, 0.7), steel); p.position.set(sg * 8.4, 3.2, 0); g.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(17.6, 2.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x1b2a6b })); beam.position.set(0, 6.3, 0); g.add(beam);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(17, 2.3), new THREE.MeshBasicMaterial({ map: signTex(txt, sub, c1), fog: true })); face.position.set(0, 6.3, -0.33); face.rotation.y = Math.PI; g.add(face);
  g.position.set(f.p.x, y, f.p.z); g.rotation.y = Math.atan2(f.tg.x, f.tg.z); scene.add(g); }
// o plano da face aponta para -z local; o corredor vem de -tg, logo a face fica virada para ele
const S_START = 34, S_END = ROUTE_M - 14;
arch(S_START, 'LARGADA', '11ª RESGATANDO VIDAS NA CORRIDA', '#2f55f0'); arch(S_END, 'CHEGADA', '3 KM · 20 NOV', '#0f6a3a');

/* ------------------------------ câmera / velocidade ------------------------------ */
const SK = [
  { t: 0, s: 0 }, { t: E('h1'), s: 8 }, { t: E('h2'), s: 62 }, { t: E('d1'), s: 230 }, { t: S('d2', 0.5), s: 330 }, { t: E('d2'), s: sTurn * 0.55 }, { t: S('d3', 1.3), s: sTurn * 0.84 },
  { t: E('d3', -0.2), s: sTurn + 6 }, { t: E('d3', 0.9), s: sTurn + 120 }, { t: E('d4', -1.2), s: ROUTE_M - 90 }, { t: E('f1', -0.2), s: S_END - 4 }, { t: TOTAL - 0.6, s: S_END + 1.5 }, { t: TOTAL, s: S_END + 2 },
];
function monoTan(ts, vs) { const n = ts.length, h = [], d = [], m = new Array(n).fill(0); for (let i = 0; i < n - 1; i++) { h[i] = Math.max(ts[i + 1] - ts[i], 1e-6); d[i] = (vs[i + 1] - vs[i]) / h[i]; } m[0] = d[0] * 0; m[n - 1] = 0;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]); return m; }
const SKT = SK.map(k => k.t), SKS = SK.map(k => k.s), SKM = monoTan(SKT, SKS);
const herm = (v0, v1, m0, m1, h, u) => (2 * u ** 3 - 3 * u ** 2 + 1) * v0 + (u ** 3 - 2 * u ** 2 + u) * h * m0 + (-2 * u ** 3 + 3 * u ** 2) * v1 + (u ** 3 - u ** 2) * h * m1;
function sAt(t) { let i = 0; while (i < SK.length - 2 && t > SK[i + 1].t) i++; const h = Math.max(SKT[i + 1] - SKT[i], 1e-6), u = clamp((t - SKT[i]) / h); return clamp(herm(SKS[i], SKS[i + 1], SKM[i], SKM[i + 1], h, u), 0, ROUTE_M); }

/* ------------------------------ interface ------------------------------ */
const labelsEl = document.getElementById('labels'), capEl = document.getElementById('cap'), cardEl = document.getElementById('card'), barChip = document.getElementById('chip'), barTtl = document.getElementById('ttl');
const footEl = document.getElementById('foot'), speedEl = document.getElementById('speed'), pulseEl = document.getElementById('pulse'), hudEl = document.getElementById('hud'), hfl = document.getElementById('hfl'), htx = document.getElementById('htx');
const LABELS = [];
function addLabel(o) { const el = document.createElement('div'); el.className = 'lab ' + (o.cls || ''); el.textContent = o.text; labelsEl.appendChild(el); LABELS.push({ ...o, el, pos: onGround(at(o.s), o.up ?? 11) }); }
addLabel({ text: 'ESQUADRÃO DA VIDA', s: 20, up: 12, t0: S('d1', 0.1), t1: E('d1', -0.2), dy: 0 });
addLabel({ text: 'RUA JACOB HOLZMANN', s: sTurn * 0.42, up: 12, t0: Wd('d2', 'Jacob', -0.2), t1: E('d2', 0.2) });
addLabel({ text: 'RETORNO · RUA 14 DE JULHO', s: sTurn, up: 12, t0: Wd('d3', 'alça', -0.2), t1: E('d3', 0.4) });
addLabel({ text: 'AV. SILVA JARDIM', s: sTurn + (ROUTE_M - sTurn) * 0.55, up: 12, t0: Wd('d4', 'Silva', -0.3), t1: E('d4', 0.1) });

const FOOT = 'Cenário 3D ilustrativo · traçado conforme o mapa de divulgação';
const CARDS = [
  { t0: S('h1', 0.1), t1: E('h1', 0.2), html: `<div class="big">20 NOV</div><div class="sub">Ponta Grossa</div>` },
  { t0: Wd('d1', 'largada', -0.1), t1: E('d1', 0.3), html: `<div class="big s">LARGADA</div><div class="sub">Esquadrão da Vida · Av. dos Vereadores, 850</div>` },
  { t0: Wd('d2', 'ida', -0.1), t1: E('d2', 0.3), html: `<div class="big s">IDA</div><div class="sub" style="color:#ffd23c">Subindo a Rua Jacob Holzmann</div>` },
  { t0: Wd('d3', 'retorno', -0.6), t1: E('d3', 0.3), html: `<div class="big s">RETORNO</div><div class="sub">Alça da Rua 14 de Julho</div>` },
  { t0: Wd('d4', 'volta', -0.1), t1: E('d4', 0.3), html: `<div class="big s" style="color:#6fc8ff">VOLTA</div><div class="sub">Avenida Silva Jardim</div>` },
  { t0: S('f1', -0.1), t1: E('f1', 0.3), html: `<div class="big">3 km</div><div class="sub">Prova individual · Corrida de rua</div>` },
  { t0: S('c1', 0.0), t1: TOTAL + 1, html: `<div class="big s" style="font-size:60px">11ª RESGATANDO VIDAS</div><div class="big s" style="font-size:60px">NA CORRIDA</div><div class="sub" style="margin-top:14px">20 NOV · Ponta Grossa</div>` },
];
const BAR = [{ t: 0, chip: '20 NOV', ttl: 'Resgatando Vidas na Corrida' }, { t: S('d1', -0.1), chip: 'LARGADA', ttl: 'Esquadrão da Vida' }, { t: S('d2', -0.1), chip: 'IDA', ttl: 'R. Jacob Holzmann' }, { t: S('d3', 0.3), chip: 'RETORNO', ttl: 'Rua 14 de Julho' },
  { t: S('d4', -0.1), chip: 'VOLTA', ttl: 'Av. Silva Jardim' }, { t: S('f1', -0.1), chip: 'CHEGADA', ttl: '3 km' }, { t: S('c1', -0.1), chip: '20 NOV', ttl: 'Ponta Grossa' }];
const CHUNKS = []; { for (const l of TL.lines) { let cur = []; const flush = () => { if (cur.length) { CHUNKS.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; } };
  for (const w of l.words) { const txt = w.w.replace(/[,.:;]/g, '').toUpperCase(); const len = cur.reduce((a, x) => a + x.txt.length + 1, 0) + txt.length; if (cur.length && (len > 22 || cur.length >= 4)) flush(); cur.push({ ...w, txt }); if (/[,.:?]$/.test(w.w)) flush(); } flush(); } }
let capKey = '', cardKey = -1;
const _p = new THREE.Vector3();
const fmt = v => v.toFixed(1).replace('.', ',');

/* ------------------------------ quadro ------------------------------ */
function update(t) {
  const s = sAt(t), s2 = sAt(t + 0.05), spd = Math.max(0, (s2 - s) / 0.05), sp01 = smooth(spd / 150);
  // câmera em primeira pessoa
  const f = frame(s), g = frame(s + 22), stepF = 2.9, ph = t * stepF * Math.PI * 2;
  const bobY = 0.065 * Math.abs(Math.sin(ph / 2)) * (0.4 + 0.6 * (1 - sp01 * 0.5)), sway = Math.sin(ph / 2) * 0.12;
  const cp = f.p.clone().addScaledVector(f.nr, sway + 1.2 * Math.sin(t * 0.37)); cp.y = hF(cp.x, cp.z) + 1.72 + bobY;
  const lookAt = at(s + 22); lookAt.y = hF(lookAt.x, lookAt.z) + 1.35 + 0.1 * Math.sin(ph / 2 + 1);
  camera.position.copy(cp); camera.up.set(0, 1, 0); camera.lookAt(lookAt); camera.rotateZ(Math.sin(ph / 2) * 0.012 + (frame(s + 12).tg.x * f.tg.z - frame(s + 12).tg.z * f.tg.x) * 0.9);
  camera.fov = 62 + 18 * sp01; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  // pelotão
  PACK.forEach((r, i) => { const ss = clamp(s + r.off, 0, ROUTE_M), fr = frame(ss), p = fr.p.clone().addScaledVector(fr.nr, r.lat), y = hF(p.x, p.z), b = 0.07 * Math.abs(Math.sin(t * 5.6 * r.sp + r.ph));
    M4.compose(V.set(p.x, y + 0.95 + b, p.z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fr.tg.x, fr.tg.z)), SC.set(1, 1, 1)); RP.m.setMatrixAt(i, M4); M4.compose(V.set(p.x, y + 1.82 + b, p.z), Q.identity(), SC.set(1, 1, 1)); RP.h.setMatrixAt(i, M4); });
  RP.m.instanceMatrix.needsUpdate = RP.h.instanceMatrix.needsUpdate = true; if (RP.m.instanceColor) RP.m.instanceColor.needsUpdate = true;
  // espectadores (pulam de leve)
  spect.forEach((r, i) => { const y = hF(r.p.x, r.p.z), b = 0.1 * Math.abs(Math.sin(t * 4 * r.sp + r.ph)); M4.compose(V.set(r.p.x, y + 0.95 + b, r.p.z), Q.identity(), SC.set(1, 1, 1)); SP.m.setMatrixAt(i, M4); M4.compose(V.set(r.p.x, y + 1.82 + b, r.p.z), Q.identity(), SC.set(1, 1, 1)); SP.h.setMatrixAt(i, M4); });
  SP.m.instanceMatrix.needsUpdate = SP.h.instanceMatrix.needsUpdate = true; if (SP.m.instanceColor) SP.m.instanceColor.needsUpdate = true;
  renderer.render(scene, camera);

  // rótulos
  for (const lb of LABELS) { const a = smooth((t - lb.t0) / 0.28) * (1 - smooth((t - lb.t1) / 0.3)); const q = _p.copy(lb.pos).project(camera);
    if (a <= 0.01 || q.z > 1 || q.z < -1) { lb.el.style.opacity = 0; continue; }
    lb.el.style.opacity = a; lb.el.style.left = clamp((q.x + 1) / 2 * W, 400, 680) + 'px'; lb.el.style.top = ((1 - q.y) / 2 * H + (lb.dy ?? 0)) + 'px'; lb.el.style.transform = `translate(-50%,-100%) scale(${0.85 + 0.15 * a})`; }
  // legenda
  const ch = CHUNKS.find(x => t >= x.t0 - 0.05 && t <= x.t1 + 0.18);
  if (ch) { const cur = ch.words.findIndex(w => t >= w.t0 && t < w.t1); const idx = cur < 0 ? (t >= ch.words[ch.words.length - 1].t1 ? ch.words.length - 1 : 0) : cur; const key = CHUNKS.indexOf(ch) + ':' + idx;
    if (key !== capKey) { capEl.innerHTML = ch.words.map((w, i) => `<span class="w${i === idx ? ' on' : ''}">${w.txt}</span>`).join(' '); capKey = key; } } else if (capKey) { capEl.innerHTML = ''; capKey = ''; }
  const ci = CARDS.findIndex(x => t >= x.t0 && t < x.t1);
  if (ci >= 0) { if (ci !== cardKey) { cardEl.innerHTML = CARDS[ci].html; cardKey = ci; } const cd = CARDS[ci], a = smooth((t - cd.t0) / 0.3) * (1 - smooth((t - (cd.t1 - 0.25)) / 0.25)); cardEl.style.opacity = a; cardEl.style.transform = `translateY(${(1 - a) * 40}px)`; } else { cardEl.style.opacity = 0; cardKey = -1; }
  let b = BAR[0]; for (const x of BAR) if (t >= x.t) b = x; if (barChip.textContent !== b.chip) { barChip.textContent = b.chip; barTtl.textContent = b.ttl; }
  footEl.textContent = FOOT; footEl.style.opacity = 1;
  speedEl.style.opacity = 0.55 * sp01; speedEl.style.transform = `rotate(${(t * 40) % 360}deg) scale(1.6)`;
  pulseEl.style.opacity = 0.35 + 0.3 * Math.pow(Math.sin(t * Math.PI * 2 * 1.45) * 0.5 + 0.5, 3);
  const hv = smooth((t - S('d1', 0.0)) / 0.5) * (1 - smooth((t - S('c1', -0.2)) / 0.4)); hudEl.style.opacity = hv; hfl.style.width = (s / ROUTE_M * 100) + '%'; htx.textContent = `${fmt(s / 1000)} km de 3 km`;
}
window.__TOTAL = TOTAL; window.__S = sAt;
window.renderFrame = async t => { update(t); await new Promise(r => requestAnimationFrame(() => r())); return true; };
window.__ready = true; update(0);
