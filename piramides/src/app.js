import * as THREE from 'three';

/* Pirâmides: Egito x Sudão — globo -> Gizé -> descida do Nilo -> Meroë (Sentinel-2 real + relevo SRTM).
   Unidade 1 = 1000 km. Tudo é função pura de t, para render offline determinístico. */
const W = 1080, H = 1920, R = 6.371, DEG = Math.PI / 180, PS = 6, E_SITE = 3, LIFT = 0.0006;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const ll2v = (lat, lon, r = R) => { const la = lat * DEG, lo = lon * DEG; return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)); };

const [TL, maps, route0] = await Promise.all(['/out/timeline.json', '/assets/maps.json', '/assets/route.json'].map(u => fetch(u).then(r => r.json())));
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
const [tDay, tReg, tGiza, tMeroe, tClouds] = await Promise.all([tex('/assets/earth_day.jpg'), tex('/assets/region_color.jpg'), tex('/assets/giza_color.jpg'), tex('/assets/meroe_color.jpg'), tex('/assets/earth_clouds_1024.png', true)]);
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

const SUN = (() => { const la = 30 * DEG, lo = 32 * DEG, up = new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)), east = new THREE.Vector3(Math.cos(lo), 0, -Math.sin(lo)), north = new THREE.Vector3().crossVectors(up, east).normalize(); return up.multiplyScalar(0.55).addScaledVector(east, -0.55).addScaledVector(north, 0.6).normalize(); })();
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

/* sítios em imagem real com malha de altura */
const SITES = {};
for (const [k, tx] of [['giza', tGiza], ['meroe', tMeroe]]) {
  const m = maps[k], h = await hbin(`/assets/${k}_height.bin`); let mn = 1e9; for (const v of h) mn = Math.min(mn, v); for (let i = 0; i < h.length; i++) h[i] -= mn;
  const mat = patchMat(tx, { lift: LIFT, feather: 0.04, featherA: 0.12 });
  const mesh = new THREE.Mesh(patchGeometry(m.lon0, m.lon1, m.lat0, m.lat1, m.gw, m.gh, h), mat); mesh.renderOrder = 4; scene.add(mesh);
  SITES[k] = { m, h, mat, mesh, c: ll2v((m.lat0 + m.lat1) / 2, (m.lon0 + m.lon1) / 2) };
}
function hAt(k, lat, lon) { const { m, h } = SITES[k], GW = m.gw + 1, GH = m.gh + 1;
  const x = clamp((lon - m.lon0) / (m.lon1 - m.lon0)) * (GW - 1), y = clamp((m.lat1 - lat) / (m.lat1 - m.lat0)) * (GH - 1), x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, GW - 1), y1 = Math.min(y0 + 1, GH - 1), fx = x - x0, fy = y - y0;
  return lerp(lerp(h[y0 * GW + x0], h[y0 * GW + x1], fx), lerp(h[y1 * GW + x0], h[y1 * GW + x1], fx), fy); }
const surf = (k, lat, lon) => ll2v(lat, lon, R + LIFT + hAt(k, lat, lon) * 1e-6 * E_SITE);

/* pirâmides 3D (escala ampliada PS×; Meroë é ilustrativo) */
const pyrMat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: SUN }, uA: { value: 1 } }, transparent: true,
  vertexShader: `varying vec3 vN; void main(){ vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform vec3 uSun; uniform float uA; varying vec3 vN; void main(){ float l=.45+.75*clamp(dot(normalize(vN),uSun),0.,1.); gl_FragColor=vec4(vec3(.96,.74,.36)*l,uA); }` });
const pyrGeo = new THREE.ConeGeometry(1, 1, 4, 1); pyrGeo.rotateY(Math.PI / 4); pyrGeo.translate(0, 0.5, 0);
const pyrs = [];
function addPyramid(site, lat, lon, baseM, hM, t0) { const m = new THREE.Mesh(pyrGeo, pyrMat); const p = surf(site, lat, lon); m.position.copy(p);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize()); const r = baseM / Math.SQRT2 * 1e-6 * PS, h = hM * 1e-6 * PS;
  m.userData = { r, h, t0, site }; m.renderOrder = 5; m.scale.set(r, 0.0001, r); scene.add(m); pyrs.push(m); }
addPyramid('giza', 29.9792, 31.1342, 230, 146, Wd('d1', 'Gizé', 0.2)); addPyramid('giza', 29.9753, 31.1308, 215, 136, Wd('d1', 'Gizé', 0.35)); addPyramid('giza', 29.9725, 31.1283, 103, 65, Wd('d1', 'Gizé', 0.5));
{ let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const clusters = [[16.9420, 33.7470, 16.9380, 33.7535, 30], [16.9255, 33.7405, 16.9235, 33.7440, 22], [16.9330, 33.7290, 16.9300, 33.7330, 14]];
  let i = 0; for (const [a, b, c, d, n] of clusters) for (let k = 0; k < n; k++, i++) { const u = (k + rnd() * 0.6) / n; addPyramid('meroe', lerp(a, c, u) + (rnd() - .5) * 0.0012, lerp(b, d, u) + (rnd() - .5) * 0.0012, 6 + rnd() * 14, 8 + rnd() * 22, Wd('d3', 'Sudão', 0.3) + i * 0.035); } }

/* ------------------------------ câmera ------------------------------ */
const K = [
  { t: 0, lat: 22, lon: 28, d: 26, tilt: 0, head: 0, shift: 230 },
  { t: 2.0, lat: 26, lon: 30, d: 22, tilt: 0, head: 0, shift: 210 },
  { t: E('h2', 0.0), lat: 28.8, lon: 31.2, d: 3.2, tilt: 8, head: 0, shift: 60 },
  { t: S('d1', 1.6), lat: 29.9, lon: 31.1, d: 0.35, tilt: 38, head: 10, shift: 0 },
  { t: E('d1', 0.3), lat: 29.985, lon: 31.14, d: 0.055, tilt: 55, head: 18, shift: 0 },
  { t: S('d2', 0.2), lat: 29.70, lon: 31.2, d: 0.40, tilt: 40, head: 0, shift: 0 },
  { t: Wd('d2', 'sul', 0.2), lat: 26.5, lon: 32.0, d: 1.8, tilt: 28, head: 0, shift: 0 },
  { t: E('d2', 0.1), lat: 19.5, lon: 32.5, d: 1.5, tilt: 30, head: 0, shift: 0 },
  { t: S('d3', 1.6), lat: 17.4, lon: 33.6, d: 0.35, tilt: 42, head: 10, shift: 0 },
  { t: Wd('d3', 'qualquer', 0.0), lat: 16.945, lon: 33.752, d: 0.045, tilt: 54, head: 30, shift: 0 },
  { t: E('f0', 0.0), lat: 16.943, lon: 33.750, d: 0.040, tilt: 56, head: 60, shift: 0 },
  { t: S('f1', 0.4), lat: 24.0, lon: 32.2, d: 2.4, tilt: 20, head: 0, shift: 0, hop: 0.2 },
  { t: E('f1', 0.0), lat: 23.6, lon: 32.2, d: 2.2, tilt: 22, head: 0, shift: 0 },
  { t: S('f2', 0.3), lat: 16.945, lon: 33.752, d: 0.05, tilt: 58, head: 20, shift: 0, hop: 0.4 },
  { t: Wd('f2', 'contra', -0.4), lat: 16.943, lon: 33.750, d: 0.045, tilt: 62, head: -10, shift: 0 },
  { t: Wd('f2', 'Grande', 0.3), lat: 29.978, lon: 31.133, d: 0.055, tilt: 62, head: 35, shift: 0, hop: 0.7 },
  { t: E('f2', 0.2), lat: 29.978, lon: 31.133, d: 0.045, tilt: 66, head: 55, shift: 0 },
  { t: S('f3', 0.4), lat: 23.2, lon: 32.0, d: 2.0, tilt: 24, head: 0, shift: 0, hop: 0.2 },
  { t: E('f3', 0.2), lat: 23.0, lon: 32.0, d: 1.9, tilt: 26, head: 0, shift: 0 },
  { t: S('c1', 1.8), lat: 25, lon: 30, d: 7.5, tilt: 8, head: 0, shift: 120 },
  { t: TOTAL, lat: 22, lon: 28, d: 26, tilt: 0, head: 0, shift: 230 },
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
function proj(lat, lon, up = 0) { const p = ll2v(lat, lon, R + 0.0004 + up); const front = _v.copy(camera.position).sub(p).dot(p) > 0; const q = p.clone().project(camera); return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H, ok: front && q.z < 1 && q.z > -1 }; }

/* ------------------------------ sobreposições ------------------------------ */
const svg = document.getElementById('ov'), labelsEl = document.getElementById('labels'), NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
const defs = mk('defs', {}); const glow = mk('filter', { id: 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs); mk('feGaussianBlur', { stdDeviation: 7, result: 'b' }, glow);
const fm = mk('feMerge', {}, glow); mk('feMergeNode', { in: 'b' }, fm); mk('feMergeNode', { in: 'SourceGraphic' }, fm);
const mkPath = (color, w) => mk('path', { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, filter: 'url(#glow)', opacity: 0 });
const pRoute = mkPath('#ffcf4a', 10), pKings = mkPath('#ff8a4a', 10);
const head = mk('circle', { r: 15, fill: '#fff', stroke: '#ffcf4a', 'stroke-width': 7, opacity: 0, filter: 'url(#glow)' });
const head2 = mk('circle', { r: 15, fill: '#fff', stroke: '#ff8a4a', 'stroke-width': 7, opacity: 0, filter: 'url(#glow)' });
// curva suave (Catmull-Rom) pelas coordenadas do Nilo
const nile = []; { const p = route0.map(([lat, lon]) => ({ lat, lon })); for (let i = 0; i < p.length - 1; i++) { const p0 = p[Math.max(i - 1, 0)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(i + 2, p.length - 1)];
  for (let s = 0; s < 8; s++) { const u = s / 8, f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u); nile.push({ lat: f(p0.lat, p1.lat, p2.lat, p3.lat), lon: f(p0.lon, p1.lon, p2.lon, p3.lon) }); } } nile.push(p[p.length - 1]); }
const iNapata = route0.findIndex(([la, lo]) => Math.abs(la - 18.55) < 0.02 && Math.abs(lo - 31.85) < 0.05) * 8;
function pathFrom(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(''); }
function drawPath(el, pts, prog, a = 1) { if (prog <= 0 || pts.some(p => !p.ok)) { el.setAttribute('opacity', 0); return; } el.setAttribute('d', pathFrom(pts)); el.setAttribute('stroke-dasharray', `${prog.toFixed(4)} 1.01`); el.setAttribute('opacity', a); }
function headAt(el, pts, prog, a) { if (prog > 0 && a > 0 && pts.every(p => p.ok)) { const f = prog * (pts.length - 1), i = Math.min(Math.floor(f), pts.length - 2), u = f - i; el.setAttribute('cx', lerp(pts[i].x, pts[i + 1].x, u)); el.setAttribute('cy', lerp(pts[i].y, pts[i + 1].y, u)); el.setAttribute('opacity', a); } else el.setAttribute('opacity', 0); }

const LABELS = [];
function addLabel(o) { const el = document.createElement('div'); el.className = 'lab ' + (o.cls || ''); el.textContent = o.text; labelsEl.appendChild(el); const dot = o.dot === false ? null : Object.assign(document.createElement('div'), { className: 'dot' }); if (dot) labelsEl.appendChild(dot); LABELS.push({ ...o, el, dotEl: dot }); }
addLabel({ text: 'GIZÉ · EGITO', lat: 29.9792, lon: 31.1342, t0: Wd('d1', 'Gizé', 0.0), t1: S('d2', 1.2), dy: -40 });
addLabel({ text: 'RIO NILO', cls: 'sm', lat: 25.7, lon: 32.64, t0: Wd('d2', 'Nilo', 0.0), t1: E('d2', 0.2), dy: -16 });
addLabel({ text: 'SUDÃO', lat: 17.2, lon: 30.2, t0: Wd('d3', 'Sudão', -0.1), t1: E('d3', 0.2), dy: -10, dot: false });
addLabel({ text: 'MEROË', lat: 16.9395, lon: 33.7495, t0: Wd('d3', 'qualquer', -0.5), t1: E('f0', 0.4), dy: -60 });
addLabel({ text: 'EGITO · ~120', lat: 29.6, lon: 31.1, t0: Wd('f1', 'Um', 0.0), t1: E('f1', 0.4), dy: -14 });
addLabel({ text: 'SUDÃO · 200+', lat: 17.2, lon: 33.3, t0: Wd('f1', 'Sudão', -0.2), t1: E('f1', 0.4), dy: -14 });
addLabel({ text: '6 A 30 m', cls: 'sm', lat: 16.9395, lon: 33.7495, t0: Wd('f2', '6', -0.2), t1: Wd('f2', 'contra', 0.4), dy: -90, dot: false });
addLabel({ text: 'GRANDE PIRÂMIDE · 146 m', cls: 'sm', lat: 29.9792, lon: 31.1342, t0: Wd('f2', 'Grande', 0.0), t1: E('f2', 0.4), dy: -120, dot: false });
addLabel({ text: 'NAPATA', cls: 'sm', lat: 18.55, lon: 31.85, t0: Wd('f3', 'Núbia', -0.2), t1: E('f3', 0.4), dy: -14 });
addLabel({ text: 'MÊNFIS · EGITO', cls: 'sm', lat: 29.85, lon: 31.25, t0: Wd('f3', 'Egito', -0.2), t1: E('f3', 0.4), dy: -14 });

const pyrBars = `<svg width="520" height="190" viewBox="0 0 520 190"><g fill="#f6b73c"><path d="M20 180 L260 20 L500 180 Z" transform="translate(0,0) scale(0.55,1)" opacity=".95"/>
  <path d="M330 180 L352 150 L374 180 Z"/><path d="M390 180 L396 174 L402 180 Z"/></g><g font-family="Inter,DejaVu Sans" font-weight="800" fill="#fff" font-size="30"><text x="150" y="108" text-anchor="middle" fill="#201400">146 m</text><text x="352" y="140" text-anchor="middle">30 m</text><text x="402" y="166" font-size="22">6 m</text></g></svg>`;
const CARDS = [
  { t0: Wd('d3', 'Sudão', 0.0), t1: E('f0', 0.4), html: `<div class="big s">+200</div><div class="sub">pirâmides no Sudão</div>` },
  { t0: Wd('f1', 'Um', 0.0), t1: E('f1', 0.5), count: true },
  { t0: Wd('f2', 'Dois', 0.0), t1: E('f2', 0.5), html: pyrBars + `<div class="sub">Sudão: 6–30 m · Grande Pirâmide: 146 m</div>` },
  { t0: Wd('f3', 'Três', 0.0), t1: E('f3', 0.5), html: `<div class="big">~740 a.C.</div><div class="sub">reis da Núbia governam o Egito</div><div class="sub" style="color:#ffb98f;font-size:32px;margin-top:8px">25ª dinastia · reino de Kush</div>` },
  { t0: Wd('c1', 'Segue', -0.1), t1: TOTAL + 1, html: `<div class="big">PARTE 2</div><div class="sub">segue pra continuar</div>` },
];
const BAR = [{ t: 0, chip: 'MISTÉRIO', ttl: 'Pirâmides' }, { t: S('f0', -0.1), chip: '3 FATOS', ttl: 'Pirâmides' }, { t: S('f1', -0.1), chip: '1 DE 3', ttl: 'Mais pirâmides' },
  { t: S('f2', -0.1), chip: '2 DE 3', ttl: 'Menores e inclinadas' }, { t: S('f3', -0.1), chip: '3 DE 3', ttl: 'Reis de Kush' }, { t: S('c1', -0.1), chip: 'PARTE 1', ttl: 'Pirâmides' }];
const CHUNKS = []; for (const l of TL.lines) { let cur = []; const flush = () => { if (cur.length) { CHUNKS.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; } };
  for (const w of l.words) { const txt = w.w.replace(/[,.:;]/g, '').toUpperCase(); const len = cur.reduce((a, x) => a + x.txt.length + 1, 0) + txt.length; if (cur.length && (len > 24 || cur.length >= 4)) flush(); cur.push({ ...w, txt }); if (/[,.:?]$/.test(w.w)) flush(); } flush(); }
const capEl = document.getElementById('cap'), cardEl = document.getElementById('card'), barChip = document.getElementById('chip'), barTtl = document.getElementById('ttl'), footEl = document.getElementById('foot');
let capKey = '', cardKey = -1;

/* ------------------------------ quadro ------------------------------ */
function update(t) {
  const c = camState(t), dN = c.d;
  regMat.uniforms.uAlpha.value = smooth((7.5 - dN) / 4); const lm = smooth((dN - 1.5) / 3);
  globe.material.uniforms.uMix.value = lm; regMat.uniforms.uMix.value = lm; regMat.uniforms.uHaze.value = smooth((1.8 - dN) / 1.2);
  let near = 0;
  for (const k in SITES) { const S_ = SITES[k], dist = camera.position.distanceTo(S_.c); const a = 1 - smooth((dist - 0.22) / 0.5); S_.mat.uniforms.uAlpha.value = a; S_.mat.uniforms.uExag.value = E_SITE; S_.mat.uniforms.uMix.value = 0; S_.mat.uniforms.uHaze.value = 1; near = Math.max(near, a); }
  cloudMat.opacity = 0.5 * smooth((dN - 4) / 6); atmoMat.uniforms.uA.value = smooth((dN - 1.5) / 6) * 0.9 + 0.1 * smooth((dN - 0.3) / 1.5);
  for (const m of pyrs) { const u = smooth((t - m.userData.t0) / 0.5); m.scale.set(m.userData.r * Math.max(u, 0.0001), Math.max(m.userData.h * u, 1e-6), m.userData.r * Math.max(u, 0.0001)); m.visible = u > 0.001 && SITES[m.userData.site].mat.uniforms.uAlpha.value > 0.05; }
  placeCamera(t, c); camera.updateMatrixWorld(); renderer.render(scene, camera);

  const P = p => proj(p.lat, p.lon);
  // rota Gizé -> Meroë (d2) e conquista Napata -> Gizé (f3)
  const rT = smooth((t - S('d2', 0.2)) / (E('d2', 0.0) - S('d2', 0.2))), rOp = 1 - smooth((t - S('d3', 3.0)) / 0.8);
  const pts = nile.map(P); drawPath(pRoute, pts, rT, rOp); headAt(head, pts, rT, rOp);
  const kt = smooth((t - Wd('f3', 'reis', -0.2)) / (E('f3', -0.4) - Wd('f3', 'reis', -0.2))), kOp = 1 - smooth((t - E('f3', 0.2)) / 0.7);
  const kp = nile.slice(iNapata).reverse().map(P); drawPath(pKings, kp, kt, kOp); headAt(head2, kp, kt, kOp);
  // rótulos
  for (const lb of LABELS) { const a = smooth((t - lb.t0) / 0.28) * (1 - smooth((t - lb.t1) / 0.3)); const p = proj(lb.lat, lb.lon);
    if (a <= 0.01 || !p.ok) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    lb.el.style.opacity = a; lb.el.style.left = p.x + 'px'; lb.el.style.top = (p.y + (lb.dy ?? -20)) + 'px'; lb.el.style.transform = `translate(-50%,-100%) scale(${0.85 + 0.15 * a})`;
    if (lb.dotEl) { lb.dotEl.style.opacity = a; lb.dotEl.style.left = p.x + 'px'; lb.dotEl.style.top = p.y + 'px'; } }
  // legenda
  const ch = CHUNKS.find(x => t >= x.t0 - 0.05 && t <= x.t1 + 0.18);
  if (ch) { const cur = ch.words.findIndex(w => t >= w.t0 && t < w.t1); const idx = cur < 0 ? (t >= ch.words[ch.words.length - 1].t1 ? ch.words.length - 1 : 0) : cur; const key = CHUNKS.indexOf(ch) + ':' + idx;
    if (key !== capKey) { capEl.innerHTML = ch.words.map((w, i) => `<span class="w${i === idx ? ' on' : ''}">${w.txt}</span>`).join(' '); capKey = key; } } else if (capKey) { capEl.innerHTML = ''; capKey = ''; }
  // cartão
  const ci = CARDS.findIndex(x => t >= x.t0 && t < x.t1);
  if (ci >= 0) { const cd = CARDS[ci]; if (ci !== cardKey && !cd.count) { cardEl.innerHTML = cd.html; cardKey = ci; }
    if (cd.count) { const u = smooth((t - cd.t0) / 1.4), v = smooth((t - Wd('f1', 'Sudão', -0.3)) / 1.4); cardEl.innerHTML = `<div style="display:flex;gap:30px;justify-content:center"><div><div class="big s">~${Math.round(120 * u)}</div><div class="sub">Egito</div></div><div style="font-size:60px;color:#fff;align-self:center">×</div><div><div class="big s" style="color:#ffd36a">${Math.round(200 * v)}+</div><div class="sub">Sudão</div></div></div>`; cardKey = ci; }
    const a = smooth((t - cd.t0) / 0.3) * (1 - smooth((t - (cd.t1 - 0.25)) / 0.25)); cardEl.style.opacity = a; cardEl.style.transform = `translateY(${(1 - a) * 40}px)`; } else { cardEl.style.opacity = 0; cardKey = -1; }
  let b = BAR[0]; for (const x of BAR) if (t >= x.t) b = x; if (barChip.textContent !== b.chip) { barChip.textContent = b.chip; barTtl.textContent = b.ttl; }
  footEl.textContent = `Pirâmides em escala ampliada ${PS}× · Meroë ilustrativo`; footEl.style.opacity = near > 0.5 && t < S('c1', 1) ? 1 : 0;
}
window.__TOTAL = TOTAL; window.renderFrame = async t => { update(t); await new Promise(r => requestAnimationFrame(() => r())); return true; }; window.__ready = true; update(0);
