import * as THREE from 'three';

/* Pirâmides: Egito x Sudão — globo -> Gizé -> descida do Nilo -> Meroë (Sentinel-2 real + relevo SRTM).
   Unidade 1 = 1000 km. Tudo é função pura de t, para render offline determinístico. */
const W = 1080, H = 1920, R = 6.371, DEG = Math.PI / 180, LIFT = 0.0006; let E_SITE = 3;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const ll2v = (lat, lon, r = R) => { const la = lat * DEG, lo = lon * DEG; return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)); };

const [TL, maps, geo] = await Promise.all(['/out/timeline.json', '/assets/maps.json', '/assets/geo.json'].map(u => fetch(u).then(r => r.json())));
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const L = Object.fromEntries(TL.lines.map(l => [l.id, l]));
const S = (id, dt = 0) => L[id].start + dt, E = (id, dt = 0) => L[id].end + dt;
const Wd = (id, w, dt = 0) => { const k = L[id].words.find(x => norm(x.w) === norm(w)) || L[id].words.find(x => norm(x.w).startsWith(norm(w))); if (!k) throw new Error('palavra? ' + id + ' ' + w); return k.t0 + dt; };
const TOTAL = TL.total;

/* ------------------------------ cena ------------------------------ */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x02050d, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 100);
const loader = new THREE.TextureLoader();
const tex = async (u, srgb = false) => { const t = await loader.loadAsync(u); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t; };
const [tDay, tReg, tSite, tClouds] = await Promise.all([tex('/assets/earth_day.jpg'), tex('/assets/region_color.jpg'), tex('/assets/site_color.jpg'), tex('/assets/earth_clouds_1024.png', true)]);
tDay.wrapS = THREE.RepeatWrapping;
const hbin = async (u) => new Float32Array(await fetch(u).then(r => r.arrayBuffer()));

function patchGeometry(lon0, lon1, lat0, lat1, nx, ny, heights) {
  const n = (nx + 1) * (ny + 1), pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), uv = new Float32Array(n * 2), hh = new Float32Array(n); let k = 0;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
    const u = i / nx, v = 1 - j / ny, p = ll2v(lerp(lat0, lat1, v), lerp(lon0, lon1, u), 1);
    dir.set([p.x, p.y, p.z], k * 3); pos.set([p.x * R, p.y * R, p.z * R], k * 3); uv.set([u, v], k * 2); hh[k] = heights ? heights[j * (nx + 1) + i] : 0;
  }
  const idx = new Uint32Array(nx * ny * 6); let q = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.set([a, c, b, b, c, d], q); q += 6; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aH', new THREE.BufferAttribute(hh, 1)); g.setIndex(new THREE.BufferAttribute(idx, 1)); return g;
}

const globe = new THREE.Mesh(patchGeometry(-180, 180, -90, 90, 360, 180), new THREE.ShaderMaterial({
  uniforms: { uMap: { value: tDay }, uR: { value: R }, uMix: { value: 1 } },
  vertexShader: `attribute vec3 aDir; varying vec2 vUv; varying vec3 vN; uniform float uR; void main(){ vUv=uv; vN=aDir; gl_Position=projectionMatrix*viewMatrix*vec4(aDir*uR,1.); }`,
  fragmentShader: `uniform sampler2D uMap; uniform float uMix; varying vec2 vUv; varying vec3 vN; void main(){ vec3 c=texture2D(uMap,vUv).rgb; float l=mix(1.,0.62+0.5*clamp(dot(normalize(vN),normalize(vec3(-.45,.35,1.))),0.,1.),uMix); gl_FragColor=vec4(c*l,1.); }`,
})); scene.add(globe);
const cloudMat = new THREE.MeshBasicMaterial({ map: tClouds, transparent: true, opacity: 0.5, depthWrite: false });
const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 96, 64), cloudMat); clouds.renderOrder = 1; clouds.rotation.y = -Math.PI / 2; scene.add(clouds);
const atmoMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uA; varying vec3 vN; void main(){ float i=pow(clamp(0.72-dot(vN,vec3(0.,0.,1.)),0.,1.),3.2); gl_FragColor=vec4(.30,.58,1.,1.)*i*1.6*uA; }` });
const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 96, 64), atmoMat); atmo.renderOrder = 3; scene.add(atmo);
{ const n = 1400, p = new Float32Array(n * 3); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, a = rnd() * 6.2832, r = Math.sqrt(1 - u * u); p.set([r * Math.cos(a) * 55, u * 55, r * Math.sin(a) * 55], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: .8, depthWrite: false }))); }

const SUN = (() => { const la = 31.8 * DEG, lo = 35.2 * DEG, up = new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)), east = new THREE.Vector3(Math.cos(lo), 0, -Math.sin(lo)), north = new THREE.Vector3().crossVectors(up, east).normalize(); return up.multiplyScalar(0.55).addScaledVector(east, -0.55).addScaledVector(north, 0.6).normalize(); })();
const patchVS = `attribute vec3 aDir; attribute float aH; uniform float uR,uExag,uLift,uFeather; varying vec2 vUv; varying float vDist; varying vec3 vDir,vP;
  void main(){ vUv=uv; vDir=aDir; float e=smoothstep(0.,uFeather,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y))); vec3 p=aDir*(uR+uLift+aH*1e-6*uExag*e); vP=p; vDist=distance(p,cameraPosition); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`;
const patchFS = `uniform sampler2D uMap; uniform float uAlpha,uHaze,uMix,uExag,uFeatherA; uniform vec3 uSun; varying vec2 vUv; varying float vDist; varying vec3 vDir,vP;
  void main(){ vec3 c=texture2D(uMap,vUv).rgb;
    { vec3 n=normalize(cross(dFdx(vP),dFdy(vP))); if(dot(n,vDir)<0.) n=-n; float sh=1.+1.6*(dot(n,uSun)-dot(normalize(vDir),uSun)); c*=mix(1.,clamp(sh,.6,1.4),clamp(uExag/2.,0.,1.)); }
    c*=mix(1.,0.62+0.5*clamp(dot(normalize(vDir),normalize(vec3(-.45,.35,1.))),0.,1.),uMix);
    float hz=clamp(pow(vDist/1.7,1.5),0.,1.)*uHaze; c=mix(c,vec3(.22,.34,.50),hz*.38);
    float ea=smoothstep(0.,uFeatherA,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y))); gl_FragColor=vec4(c,uAlpha*ea); }`;
const patchMat = (map, o) => new THREE.ShaderMaterial({ transparent: true, depthWrite: true, vertexShader: patchVS, fragmentShader: patchFS,
  uniforms: { uMap: { value: map }, uR: { value: R }, uExag: { value: 0 }, uLift: { value: o.lift }, uFeather: { value: o.feather }, uFeatherA: { value: o.featherA }, uAlpha: { value: 0 }, uHaze: { value: 1 }, uMix: { value: 1 }, uSun: { value: SUN } } });
const RG = maps.region, regMat = patchMat(tReg, { lift: 0.0003, feather: 0.02, featherA: 0.03 });
const reg = new THREE.Mesh(patchGeometry(RG.lon0, RG.lon1, RG.lat0, RG.lat1, 320, 360), regMat); reg.renderOrder = 2; scene.add(reg);


/* Montanhas da Judeia em imagem real + relevo */
const SM = maps.site, SH = await hbin('/assets/site_height.bin'); let HMIN = 1e9; for (const v of SH) HMIN = Math.min(HMIN, v); for (let i = 0; i < SH.length; i++) SH[i] -= HMIN;
const siteMat = patchMat(tSite, { lift: LIFT, feather: 0.04, featherA: 0.18 });
const siteMesh = new THREE.Mesh(patchGeometry(SM.lon0, SM.lon1, SM.lat0, SM.lat1, SM.gw, SM.gh, SH), siteMat); siteMesh.renderOrder = 4; scene.add(siteMesh);
const siteC = ll2v((SM.lat0 + SM.lat1) / 2, (SM.lon0 + SM.lon1) / 2);
function hAt(lat, lon) { const GW = SM.gw + 1, GH = SM.gh + 1, x = clamp((lon - SM.lon0) / (SM.lon1 - SM.lon0)) * (GW - 1), y = clamp((SM.lat1 - lat) / (SM.lat1 - SM.lat0)) * (GH - 1), x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, GW - 1), y1 = Math.min(y0 + 1, GH - 1), fx = x - x0, fy = y - y0;
  return lerp(lerp(SH[y0 * GW + x0], SH[y0 * GW + x1], fx), lerp(SH[y1 * GW + x0], SH[y1 * GW + x1], fx), fy) + HMIN; }   // metros reais
/* ------------------------------ câmera ------------------------------ */
const K = [
  { t: 0, lat: 28, lon: 30, d: 26, tilt: 0, head: 0, shift: 230 },
  { t: 1.2, lat: 30, lon: 33, d: 20, tilt: 0, head: 0, shift: 200 },
  { t: E('h1', 0.2), lat: 31.8, lon: 35.0, d: 2.2, tilt: 10, head: 0, shift: 60 },
  { t: S('h2', 1.5), lat: 31.75, lon: 35.2, d: 0.30, tilt: 42, head: 0, shift: 0 },
  { t: E('h2', 0.0), lat: 31.78, lon: 35.22, d: 0.20, tilt: 50, head: 0, shift: 0 },
  { t: E('d1', 0.0), lat: 31.78, lon: 35.22, d: 0.19, tilt: 52, head: 6, shift: 0 },
  { t: E('f1', 0.0), lat: 31.80, lon: 35.20, d: 0.21, tilt: 55, head: -6, shift: 0 },
  { t: E('f2', 0.0), lat: 31.78, lon: 35.2, d: 0.33, tilt: 42, head: 0, shift: 0 },
  { t: S('f3', 0.6), lat: 31.78, lon: 35.30, d: 0.17, tilt: 64, head: 84, shift: 0, hop: 0.2 },
  { t: E('f3', 0.2), lat: 31.74, lon: 35.38, d: 0.14, tilt: 68, head: 90, shift: 0 },
  { t: S('c1', 1.4), lat: 31.8, lon: 35.2, d: 3.0, tilt: 12, head: 0, shift: 100 },
  { t: TOTAL, lat: 28, lon: 30, d: 26, tilt: 0, head: 0, shift: 230 },
];
function camState(t) { let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1], u = smooth((t - a.t) / Math.max(b.t - a.t, 1e-6));
  return { lat: lerp(a.lat, b.lat, u), lon: lerp(a.lon, b.lon, u), d: Math.exp(lerp(Math.log(a.d), Math.log(b.d), u) + (b.hop || 0) * Math.sin(Math.PI * u)), tilt: lerp(a.tilt, b.tilt, u), head: lerp(a.head, b.head, u), shift: lerp(a.shift, b.shift, u) }; }
function placeCamera(t, c) {
  const P = ll2v(c.lat, c.lon, R + (c.d < 0.2 ? LIFT : 0.0003)), up = P.clone().normalize(), east = new THREE.Vector3(Math.cos(c.lon * DEG), 0, -Math.sin(c.lon * DEG)), north = new THREE.Vector3().crossVectors(up, east).normalize();
  const head = (c.head + Math.sin(t * 0.8) * 0.5) * DEG, tilt = c.tilt * DEG, Ld = north.clone().multiplyScalar(Math.cos(head)).add(east.clone().multiplyScalar(Math.sin(head)));
  camera.position.copy(P).addScaledVector(up, c.d * Math.cos(tilt)).addScaledVector(Ld, -c.d * Math.sin(tilt)); camera.up.copy(Ld); camera.lookAt(P);
  camera.near = Math.max(0.0008, c.d * 0.03); camera.far = Math.max(c.d + 15, 62); camera.updateProjectionMatrix(); camera.setViewOffset(W, H, 0, -c.shift, W, H); }
const _v = new THREE.Vector3();
function proj(lat, lon, hM = 0) { const p = ll2v(lat, lon, R + (siteMat.uniforms.uAlpha.value > 0.3 ? LIFT + (hM - HMIN) * 1e-6 * E_SITE : 0.0004)); const front = _v.copy(camera.position).sub(p).dot(p) > 0; const q = p.clone().project(camera); return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H, ok: front && q.z < 1 && q.z > -1 }; }


/* ------------------------------ sobreposições ------------------------------ */
const svg = document.getElementById('ov'), labelsEl = document.getElementById('labels'), NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
const defs = mk('defs', {}); const glow = mk('filter', { id: 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs); mk('feGaussianBlur', { stdDeviation: 7, result: 'b' }, glow);
const fm = mk('feMerge', {}, glow); mk('feMergeNode', { in: 'b' }, fm); mk('feMergeNode', { in: 'SourceGraphic' }, fm);
const mkPath = (color, w) => mk('path', { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, filter: 'url(#glow)', opacity: 0 });
const pDiv = mkPath('#ffd36a', 11), pW = mkPath('#7fd6ff', 18), pE = mkPath('#ffb070', 18), pProf = mkPath('#ffffff', 6);
const dotA = mk('circle', { r: 13, fill: '#ffd36a', stroke: '#fff', 'stroke-width': 4, opacity: 0 }), dotB = mk('circle', { r: 13, fill: '#7fe3ff', stroke: '#fff', 'stroke-width': 4, opacity: 0 });
const curve = pts => { const out = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)]; for (let s = 0; s < 8; s++) { const u = s / 8, f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u); out.push({ lat: f(p0.lat, p1.lat, p2.lat, p3.lat), lon: f(p0.lon, p1.lon, p2.lon, p3.lon) }); } } out.push(pts[pts.length - 1]); return out; };
const toObj = a => a.map(([lat, lon]) => ({ lat, lon }));
const DIV = curve(toObj(geo.divide)), FW = curve(toObj(geo.west)), FE = curve(toObj(geo.east));
const JER = { lat: 31.7769, lon: 35.2358 }, DSN = { lat: 31.77, lon: 35.50 };
const hav = (a, b) => { const r = 6371, f1 = a.lat * DEG, f2 = b.lat * DEG, dl = (b.lon - a.lon) * DEG, dp = f2 - f1; const h = Math.sin(dp / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); };
const DIST_KM = Math.round(hav(JER, DSN));
function pathFrom(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(''); }
function drawPath(el, pts, prog, a = 1, dash) { if (prog <= 0 || pts.some(p => !p.ok)) { el.setAttribute('opacity', 0); return; } el.setAttribute('d', pathFrom(pts)); el.setAttribute('stroke-dasharray', dash || `${prog.toFixed(4)} 1.01`); el.setAttribute('opacity', a); }
const LABELS = [];
function addLabel(o) { const el = document.createElement('div'); el.className = 'lab ' + (o.cls || ''); el.textContent = o.text; labelsEl.appendChild(el); const dot = o.dot === false ? null : Object.assign(document.createElement('div'), { className: 'dot' }); if (dot) labelsEl.appendChild(dot); LABELS.push({ ...o, el, dotEl: dot }); }
addLabel({ text: 'JERUSALÉM', lat: JER.lat, lon: JER.lon, t0: Wd('h1', 'Jerusalém', 0.1), t1: E('d1', 0.6), dy: -24 });
addLabel({ text: 'DIVISOR DE ÁGUAS (APROX.)', cls: 'sm', lat: 31.93, lon: 35.215, t0: Wd('d1', 'divisor', 0.0), t1: E('f0', 0.3), dy: -18, dot: false });
addLabel({ text: 'MEDITERRÂNEO', cls: 'sm dk', dx: 150, lat: 31.86, lon: 34.72, t0: Wd('h2', 'Mediterrâneo', -0.1), t1: E('f1', 0.5), dy: -12, dot: false });
addLabel({ text: 'MAR MORTO', cls: 'sm dk', lat: 31.55, lon: 35.45, t0: Wd('h2', 'Morto', -0.2), t1: E('f3', 0.6), dy: -12, dot: false, h: -430 });
addLabel({ text: 'OESTE · ~550 mm', lat: 31.80, lon: 34.98, t0: Wd('f2', 'oeste', -0.1), t1: E('f2', 0.4), dy: -14, dot: false });
addLabel({ text: 'LESTE · <100 mm', lat: 31.72, lon: 35.45, t0: Wd('f2', 'leste', -0.1), t1: E('f2', 0.4), dy: -14, dot: false, h: -300 });
addLabel({ text: 'JERUSALÉM · ~750 m', cls: 'sm', lat: JER.lat, lon: JER.lon, t0: Wd('f3', '750', -0.3), t1: E('f3', 0.4), dy: -22, dot: false });
addLabel({ text: 'MAR MORTO · −430 m', cls: 'dk', lat: DSN.lat, lon: DSN.lon, t0: Wd('f3', '−430', -0.3), t1: E('f3', 0.4), dy: -22, dot: false, h: -430 });
const CARDS = [
  { t0: Wd('d1', 'divisor', -0.1), t1: E('d1', 0.5), html: `<div class="big s">DIVISOR</div><div class="big s">DE ÁGUAS</div>` },
  { t0: Wd('f1', 'Um', 0.0), t1: E('f1', 0.5), html: `<div style="display:flex;gap:34px;justify-content:center"><div><div class="sub" style="color:#7fd6ff">← OESTE</div><div class="big s" style="font-size:54px">MEDITERRÂNEO</div></div><div><div class="sub" style="color:#ffb070">LESTE →</div><div class="big s" style="font-size:54px">MAR MORTO</div></div></div>` },
  { t0: Wd('f2', 'Dois', 0.0), t1: E('f2', 0.5), count: true },
  { t0: Wd('f3', 'Três', 0.0), t1: E('f3', 0.5), html: `<div style="display:flex;gap:26px;justify-content:center;align-items:baseline"><div class="big s">750 m</div><div style="font-size:54px;color:#fff">→</div><div class="big s" style="color:#8fe3ff">−430 m</div></div><div class="sub">queda de ~1.180 m em ~${DIST_KM} km</div>` },
  { t0: Wd('c1', 'Segue', -0.1), t1: TOTAL + 1, html: `<div class="big">PARTE 2</div><div class="sub">segue pra continuar</div>` },
];
const BAR = [{ t: 0, chip: 'MISTÉRIO', ttl: 'Jerusalém' }, { t: S('f0', -0.1), chip: '3 FATOS', ttl: 'Jerusalém' }, { t: S('f1', -0.1), chip: '1 DE 3', ttl: 'Para onde vai a chuva' },
  { t: S('f2', -0.1), chip: '2 DE 3', ttl: 'Dois climas' }, { t: S('f3', -0.1), chip: '3 DE 3', ttl: 'Queda de altitude' }, { t: S('c1', -0.1), chip: 'PARTE 1', ttl: 'Jerusalém' }];
const CHUNKS = []; for (const l of TL.lines) { let cur = []; const flush = () => { if (cur.length) { CHUNKS.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; } };
  for (const w of l.words) { const txt = w.w.replace(/[,.:;]+$/, '').toUpperCase(); const len = cur.reduce((a, x) => a + x.txt.length + 1, 0) + txt.length; if (cur.length && (len > 24 || cur.length >= 4)) flush(); cur.push({ ...w, txt }); if (/[,.:?]$/.test(w.w)) flush(); } flush(); }
const capEl = document.getElementById('cap'), cardEl = document.getElementById('card'), barChip = document.getElementById('chip'), barTtl = document.getElementById('ttl'), footEl = document.getElementById('foot');
let capKey = '', cardKey = -1;

function update(t) {
  const c = camState(t), dN = c.d; placeCamera(t, c); camera.updateMatrixWorld();
  const bump = smooth((t - S('f3', 0.0)) / 1.0) * (1 - smooth((t - E('f3', 0.4)) / 1.0)); E_SITE = 3 + 3 * bump;
  regMat.uniforms.uAlpha.value = smooth((7.5 - dN) / 4); const lm = smooth((dN - 1.5) / 3);
  globe.material.uniforms.uMix.value = lm; regMat.uniforms.uMix.value = lm; regMat.uniforms.uHaze.value = smooth((1.8 - dN) / 1.2);
  const dist = camera.position.distanceTo(siteC); const sa = 1 - smooth((dist - 0.25) / 0.6);
  siteMat.uniforms.uAlpha.value = sa; siteMat.uniforms.uExag.value = E_SITE; siteMat.uniforms.uMix.value = 0; siteMat.uniforms.uHaze.value = 1;
  cloudMat.opacity = 0.5 * smooth((dN - 4) / 6); atmoMat.uniforms.uA.value = smooth((dN - 1.5) / 6) * 0.9 + 0.1 * smooth((dN - 0.3) / 1.5);
  renderer.render(scene, camera);
  const P = p => proj(p.lat, p.lon, hAt(p.lat, p.lon) + 40);
  drawPath(pDiv, DIV.map(P), smooth((t - Wd('d1', 'divisor', -0.2)) / 1.6), 1 - smooth((t - E('f0', 0.6)) / 0.8));
  const fl = smooth((t - Wd('f1', 'chuva', -0.1)) / 0.8) * (1 - smooth((t - E('f2', 0.6)) / 0.8)), off = -t * 0.35;
  drawPath(pW, FW.map(P), 1, fl, '0.018 0.034'); drawPath(pE, FE.map(P), 1, fl, '0.018 0.034'); pW.setAttribute('stroke-dashoffset', off); pE.setAttribute('stroke-dashoffset', off);
  const pa = smooth((t - Wd('f3', '750', -0.4)) / 0.7) * (1 - smooth((t - E('f3', 0.3)) / 0.7)); const a = proj(JER.lat, JER.lon, hAt(JER.lat, JER.lon)), b = proj(DSN.lat, DSN.lon, -430);
  if (pa > 0 && a.ok && b.ok) { pProf.setAttribute('d', `M${a.x} ${a.y}L${b.x} ${b.y}`); pProf.setAttribute('stroke-dasharray', `${pa.toFixed(3)} 1.01`); pProf.setAttribute('opacity', pa); dotA.setAttribute('cx', a.x); dotA.setAttribute('cy', a.y); dotB.setAttribute('cx', b.x); dotB.setAttribute('cy', b.y); dotA.setAttribute('opacity', pa); dotB.setAttribute('opacity', pa); } else { pProf.setAttribute('opacity', 0); dotA.setAttribute('opacity', 0); dotB.setAttribute('opacity', 0); }
  for (const lb of LABELS) { const al = smooth((t - lb.t0) / 0.28) * (1 - smooth((t - lb.t1) / 0.3)); const p = proj(lb.lat, lb.lon, lb.h ?? hAt(lb.lat, lb.lon));
    if (al <= 0.01 || !p.ok || p.y + (lb.dy ?? -20) < 330) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    lb.el.style.opacity = al; lb.el.style.left = (p.x + (lb.dx || 0)) + 'px'; lb.el.style.top = (p.y + (lb.dy ?? -20)) + 'px'; lb.el.style.transform = `translate(-50%,-100%) scale(${0.85 + 0.15 * al})`;
    if (lb.dotEl) { lb.dotEl.style.opacity = al; lb.dotEl.style.left = p.x + 'px'; lb.dotEl.style.top = p.y + 'px'; } }
  const ch = CHUNKS.find(x => t >= x.t0 - 0.05 && t <= x.t1 + 0.18);
  if (ch) { const cur = ch.words.findIndex(w => t >= w.t0 && t < w.t1); const idx = cur < 0 ? (t >= ch.words[ch.words.length - 1].t1 ? ch.words.length - 1 : 0) : cur; const key = CHUNKS.indexOf(ch) + ':' + idx;
    if (key !== capKey) { capEl.innerHTML = ch.words.map((w, i) => `<span class="w${i === idx ? ' on' : ''}">${w.txt}</span>`).join(' '); capKey = key; } } else if (capKey) { capEl.innerHTML = ''; capKey = ''; }
  const ci = CARDS.findIndex(x => t >= x.t0 && t < x.t1);
  if (ci >= 0) { const cd = CARDS[ci]; if (ci !== cardKey && !cd.count) { cardEl.innerHTML = cd.html; cardKey = ci; }
    if (cd.count) { const u = smooth((t - cd.t0) / 1.2), v = smooth((t - Wd('f2', 'leste', -0.2)) / 1.0); cardEl.innerHTML = `<div style="display:flex;gap:30px;justify-content:center"><div><div class="big s" style="color:#7fd6ff">~${Math.round(550 * u)}</div><div class="sub">mm/ano · oeste</div></div><div><div class="big s" style="color:#ffb070">&lt;${Math.round(100 * v)}</div><div class="sub">mm/ano · leste</div></div></div>`; cardKey = ci; }
    const al = smooth((t - cd.t0) / 0.3) * (1 - smooth((t - (cd.t1 - 0.25)) / 0.25)); cardEl.style.opacity = al; cardEl.style.transform = `translateY(${(1 - al) * 40}px)`; } else { cardEl.style.opacity = 0; cardKey = -1; }
  let bb = BAR[0]; for (const x of BAR) if (t >= x.t) bb = x; if (barChip.textContent !== bb.chip) { barChip.textContent = bb.chip; barTtl.textContent = bb.ttl; }
  footEl.textContent = `Relevo exagerado ${E_SITE.toFixed(0)}× · divisor de águas aproximado`; footEl.style.opacity = sa > 0.5 && t < S('c1', 1) ? 1 : 0;
}
window.__TOTAL = TOTAL; window.renderFrame = async t => { update(t); await new Promise(r => requestAnimationFrame(() => r())); return true; }; window.__ready = true; update(0);
