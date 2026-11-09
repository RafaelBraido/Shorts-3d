import * as THREE from 'three';

/* Pirâmides: Egito x Sudão — globo -> Gizé -> descida do Nilo -> Meroë (Sentinel-2 real + relevo SRTM).
   Unidade 1 = 1000 km. Tudo é função pura de t, para render offline determinístico. */
const W = 1080, H = 1920, R = 6.371, DEG = Math.PI / 180, LIFT = 0.0006;
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
const [tDay, tReg, tClouds] = await Promise.all([tex('/assets/earth_day.jpg'), tex('/assets/region_color.jpg'), tex('/assets/earth_clouds_1024.png', true)]);
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

const SUN = (() => { const la = -12 * DEG, lo = -53 * DEG, up = new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)), east = new THREE.Vector3(Math.cos(lo), 0, -Math.sin(lo)), north = new THREE.Vector3().crossVectors(up, east).normalize(); return up.multiplyScalar(0.55).addScaledVector(east, -0.55).addScaledVector(north, 0.6).normalize(); })();
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
const RG = maps.region, regMat = patchMat(tReg, { lift: 0.0003, feather: 0.02, featherA: 0.18 });
const reg = new THREE.Mesh(patchGeometry(RG.lon0, RG.lon1, RG.lat0, RG.lat1, 360, 360), regMat); reg.renderOrder = 2; scene.add(reg);

/* ------------------------------ câmera ------------------------------ */
const K = [
  { t: 0, lat: -10, lon: -45, d: 26, tilt: 0, head: 0, shift: 230 },
  { t: 1.2, lat: -10, lon: -50, d: 21, tilt: 0, head: 0, shift: 200 },
  { t: E('h2', 0.0), lat: -13, lon: -53, d: 14.5, tilt: 0, head: 0, shift: 60 },
  { t: S('d1', 0.2), lat: 2, lon: -60, d: 4.5, tilt: 22, head: 0, shift: 0 },
  { t: Wd('d1', 'Chuí', -1.6), lat: -12, lon: -57, d: 9, tilt: 14, head: 0, shift: 0 },
  { t: Wd('d1', 'Chuí', 0.5), lat: -30, lon: -54, d: 5.5, tilt: 22, head: 0, shift: 0 },
  { t: S('d2', 0.5), lat: -14, lon: -56, d: 14.5, tilt: 0, head: 0, shift: 40 },
  { t: E('d2', 0.0), lat: -14, lon: -56, d: 14, tilt: 0, head: 0, shift: 40 },
  { t: S('f1', 0.3), lat: -9, lon: -54, d: 15.5, tilt: 0, head: 0, shift: 0 },
  { t: E('f1', 0.0), lat: -9, lon: -54, d: 15, tilt: 0, head: 0, shift: 0 },
  { t: S('f2', 0.2), lat: -9, lon: -52, d: 10, tilt: 8, head: 0, shift: 0 },
  { t: E('f2', 0.0), lat: -9, lon: -52, d: 9.5, tilt: 8, head: 0, shift: 0 },
  { t: S('f3', 0.2), lat: -13, lon: -53, d: 15, tilt: 0, head: 0, shift: 40 },
  { t: E('f3', 0.2), lat: -13, lon: -53, d: 15, tilt: 0, head: 0, shift: 40 },
  { t: S('c1', 1.4), lat: -12, lon: -48, d: 22, tilt: 0, head: 0, shift: 150 },
  { t: TOTAL, lat: -10, lon: -45, d: 26, tilt: 0, head: 0, shift: 230 },
];
function camState(t) { let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1], u = smooth((t - a.t) / Math.max(b.t - a.t, 1e-6));
  return { lat: lerp(a.lat, b.lat, u), lon: lerp(a.lon, b.lon, u), d: Math.exp(lerp(Math.log(a.d), Math.log(b.d), u) + (b.hop || 0) * Math.sin(Math.PI * u)), tilt: lerp(a.tilt, b.tilt, u), head: lerp(a.head, b.head, u), shift: lerp(a.shift, b.shift, u) }; }
function placeCamera(t, c) {
  const P = ll2v(c.lat, c.lon, R + (0.0003)), up = P.clone().normalize(), east = new THREE.Vector3(Math.cos(c.lon * DEG), 0, -Math.sin(c.lon * DEG)), north = new THREE.Vector3().crossVectors(up, east).normalize();
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
const mkPath = (color, w, fill = 'none') => mk('path', { fill, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, filter: 'url(#glow)', opacity: 0 });
const pBR = mkPath('#ffd36a', 7), pUS = mkPath('#8fc2ff', 7, 'rgba(70,130,255,0.30)'), pNS = mkPath('#ffffff', 9), pEW = mkPath('#ffcf4a', 9);
const toObj = a => a.map(([lat, lon]) => ({ lat, lon }));
const BR = toObj(geo.brasil), US = toObj(geo.usa);
const CAB = { lat: 5.2717, lon: -60.2167 }, CHU = { lat: -33.7414, lon: -53.3697 }, SEI = { lat: -7.1497, lon: -34.7942 }, CON = { lat: -7.54, lon: -73.9908 };
const hav = (a, b) => { const r = 6371, f1 = a.lat * DEG, f2 = b.lat * DEG, dl = (b.lon - a.lon) * DEG, dp = f2 - f1; const h = Math.sin(dp / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); };
const NS_KM = Math.round(hav(CAB, CHU) / 100) * 100, EW_KM = Math.round(hav(SEI, CON) / 100) * 100;
const fmt = n => n.toLocaleString('pt-BR');
// linhas "retas" sobre a esfera (grande círculo) amostradas
const gc = (a, b, n = 60) => { const va = ll2v(a.lat, a.lon, 1), vb = ll2v(b.lat, b.lon, 1), om = Math.acos(clamp(va.dot(vb), -1, 1)), out = []; for (let i = 0; i <= n; i++) { const u = i / n, v = va.clone().multiplyScalar(Math.sin((1 - u) * om)).addScaledVector(vb, Math.sin(u * om)).divideScalar(Math.sin(om)); out.push({ lat: Math.asin(v.y) / DEG, lon: Math.atan2(v.x, v.z) / DEG }); } return out; };
const NSL = gc(CAB, CHU), EWL = gc(SEI, CON);
// silhueta dos EUA em ESCALA REAL: projeção azimutal equidistante ao redor do centro dos EUA, girada p/ que "leste->oeste" dos EUA acompanhe a linha norte->sul do Brasil
const USC = { lat: 39.5, lon: -98.5 };
function basis(lat, lon) { const up = ll2v(lat, lon, 1), east = new THREE.Vector3(Math.cos(lon * DEG), 0, -Math.sin(lon * DEG)), north = new THREE.Vector3().crossVectors(up, east).normalize(); return { up, east, north }; }
const bUS = basis(USC.lat, USC.lon), MID_ = gc(CAB, CHU, 2)[1], bBR = basis(MID_.lat, MID_.lon);
const bearing = (() => { const b = basis(CAB.lat, CAB.lon), v = ll2v(CHU.lat, CHU.lon, 1).sub(b.up.clone().multiplyScalar(ll2v(CHU.lat, CHU.lon, 1).dot(b.up))); return Math.atan2(v.dot(b.east), v.dot(b.north)); })();  // rumo de Caburaí ao Chuí (rad, horário a partir do norte)
const usLocal = US.map(p => { const v = ll2v(p.lat, p.lon, 1), ang = Math.acos(clamp(v.dot(bUS.up), -1, 1)), d = v.clone().sub(bUS.up.clone().multiplyScalar(v.dot(bUS.up))).normalize(); return { x: ang * 6371 * d.dot(bUS.east), y: ang * 6371 * d.dot(bUS.north) }; });
const sB = Math.sin(bearing), cB = Math.cos(bearing);
const USBR = usLocal.map(p => { const X = p.x * sB - p.y * cB, Y = p.x * cB + p.y * sB, ang = Math.hypot(X, Y) / 6371, dir = bBR.east.clone().multiplyScalar(X / (Math.hypot(X, Y) || 1)).addScaledVector(bBR.north, Y / (Math.hypot(X, Y) || 1)), v = bBR.up.clone().multiplyScalar(Math.cos(ang)).addScaledVector(dir, Math.sin(ang)); return { lat: Math.asin(v.y) / DEG, lon: Math.atan2(v.x, v.z) / DEG }; });
const US_EXT = Math.round(Math.max(...usLocal.map(p => p.x)) - Math.min(...usLocal.map(p => p.x)));
function pathFrom(pts, close) { return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('') + (close ? 'Z' : ''); }
function drawPath(el, pts, prog, a = 1, close = false) { if (prog <= 0 || pts.some(p => !p.ok)) { el.setAttribute('opacity', 0); return; } el.setAttribute('d', pathFrom(pts, close)); el.setAttribute('stroke-dasharray', `${prog.toFixed(4)} 1.01`); el.setAttribute('opacity', a); }
const LABELS = [];
function addLabel(o) { const el = document.createElement('div'); el.className = 'lab ' + (o.cls || ''); el.textContent = o.text; labelsEl.appendChild(el); const dot = o.dot === false ? null : Object.assign(document.createElement('div'), { className: 'dot' }); if (dot) labelsEl.appendChild(dot); LABELS.push({ ...o, el, dotEl: dot }); }
addLabel({ text: 'MONTE CABURAÍ · RR', cls: 'sm', ...CAB, t0: Wd('d1', 'Roraima', -0.5), t1: E('d1', 0.3), dy: -18 });
addLabel({ text: 'CHUÍ · RS', cls: 'sm', ...CHU, t0: Wd('d1', 'Chuí', -0.2), t1: E('d1', 0.3), dy: -18 });
addLabel({ text: 'EUA · ESCALA REAL', cls: 'dk', lat: MID_.lat, lon: MID_.lon, t0: Wd('d2', 'Estados', -0.2), t1: E('d2', 0.5), dy: 0, dot: false });
addLabel({ text: 'PONTA DO SEIXAS · PB', cls: 'sm', dx: -120, ...SEI, t0: Wd('f1', 'leste', 0.0), t1: E('f1', 0.4), dy: 68 });
addLabel({ text: 'SERRA DA CONTAMANA · AC', cls: 'sm', dx: 170, ...CON, t0: Wd('f1', 'oeste', 0.0), t1: E('f1', 0.4), dy: -18 });
addLabel({ text: 'ACRE · UTC−5', cls: 'sm', lat: -9.0, lon: -70.5, t0: Wd('f2', 'fusos', -0.2), t1: E('f2', 0.4), dy: -14 });
addLabel({ text: 'MANAUS · UTC−4', cls: 'sm', lat: -3.1, lon: -60.0, t0: Wd('f2', 'fusos', 0.0), t1: E('f2', 0.4), dy: -14 });
addLabel({ text: 'BRASÍLIA · UTC−3', cls: 'sm', lat: -15.8, lon: -47.9, t0: Wd('f2', 'fusos', 0.2), t1: E('f2', 0.4), dy: -14 });
addLabel({ text: 'NORONHA · UTC−2', cls: 'sm', lat: -3.85, lon: -32.42, t0: Wd('f2', 'fusos', 0.4), t1: E('f2', 0.4), dy: -14 });
addLabel({ text: 'BRASIL', lat: -12, lon: -53, t0: Wd('h1', 'Brasil', 0.0), t1: S('d1', 0.0), dy: -10, dot: false });
const bars = (a, b) => `<div style="text-align:left;font-weight:800;color:#fff;font-size:34px;letter-spacing:2px"><div style="margin:8px 0">BRASIL <span style="color:#ffd36a">${a}</span><div style="height:26px;width:${(a / 8.5) * 380}px;background:#ffd36a;border-radius:8px;margin-top:4px"></div></div><div style="margin:12px 0 0">EUA (CONT.) <span style="color:#8fc2ff">${b}</span><div style="height:26px;width:${(b / 8.5) * 380}px;background:#8fc2ff;border-radius:8px;margin-top:4px"></div></div></div>`;
const CARDS = [
  { t0: Wd('d1', '4.400', -0.1), t1: E('d1', 0.6), html: `<div class="big">~${fmt(NS_KM)} km</div><div class="sub">de norte a sul</div>` },
  { t0: Wd('d2', 'Quase', -0.1), t1: E('d2', 0.6), html: `<div class="big s">EUA ≈ ${fmt(Math.round(US_EXT / 100) * 100)} km</div><div class="sub">de costa a costa</div>` },
  { t0: Wd('f1', 'Um', 0.0), t1: E('f1', 0.5), html: `<div class="big">~${fmt(EW_KM)} km</div><div class="sub">de leste a oeste</div>` },
  { t0: Wd('f2', 'Dois', 0.0), t1: E('f2', 0.5), html: `<div class="big">4 FUSOS</div><div class="sub">horários no Brasil</div>` },
  { t0: Wd('f3', 'Três', 0.0), t1: E('f3', 0.5), html: bars(8.5, 8.1) + `<div class="sub" style="font-size:28px;margin-top:10px">milhões de km²</div>` },
  { t0: Wd('c1', 'Segue', -0.1), t1: TOTAL + 1, html: `<div class="big">PARTE 2</div><div class="sub">segue pra continuar</div>` },
];
const BAR = [{ t: 0, chip: 'CURIOSIDADE', ttl: 'Brasil' }, { t: S('f0', -0.1), chip: '3 FATOS', ttl: 'Brasil' }, { t: S('f1', -0.1), chip: '1 DE 3', ttl: 'Leste a oeste' },
  { t: S('f2', -0.1), chip: '2 DE 3', ttl: 'Fusos horários' }, { t: S('f3', -0.1), chip: '3 DE 3', ttl: 'Maior que os EUA' }, { t: S('c1', -0.1), chip: 'PARTE 1', ttl: 'Brasil' }];
const CHUNKS = []; for (const l of TL.lines) { let cur = []; const flush = () => { if (cur.length) { CHUNKS.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; } };
  for (const w of l.words) { const txt = w.w.replace(/[,.:;]+$/, '').toUpperCase(); const len = cur.reduce((a, x) => a + x.txt.length + 1, 0) + txt.length; if (cur.length && (len > 24 || cur.length >= 4)) flush(); cur.push({ ...w, txt }); if (/[,.:?]$/.test(w.w)) flush(); } flush(); }
const capEl = document.getElementById('cap'), cardEl = document.getElementById('card'), barChip = document.getElementById('chip'), barTtl = document.getElementById('ttl'), footEl = document.getElementById('foot');
let capKey = '', cardKey = -1;
function update(t) {
  const c = camState(t), dN = c.d; placeCamera(t, c); camera.updateMatrixWorld();
  regMat.uniforms.uAlpha.value = smooth((20 - dN) / 6); const lm = smooth((dN - 1.5) / 3);
  globe.material.uniforms.uMix.value = lm; regMat.uniforms.uMix.value = lm; regMat.uniforms.uHaze.value = smooth((1.8 - dN) / 1.2);
  cloudMat.opacity = 0.5 * smooth((dN - 4) / 6); atmoMat.uniforms.uA.value = smooth((dN - 1.5) / 6) * 0.9 + 0.1 * smooth((dN - 0.3) / 1.5);
  renderer.render(scene, camera);
  const P = p => proj(p.lat, p.lon);
  drawPath(pBR, BR.map(P), smooth((t - Wd('h1', 'Brasil', 0.0)) / 2.2) , (1 - smooth((t - S('d1', 0.2)) / 0.8)) * 0.9, true);
  const nsT = smooth((t - S('d1', 0.3)) / (Wd('d1', 'Chuí', 0.2) - S('d1', 0.3))); drawPath(pNS, NSL.map(P), nsT, 1 - smooth((t - E('f0', 0.6)) / 0.8));
  drawPath(pUS, USBR.map(P), smooth((t - Wd('d2', 'Estados', -0.4)) / 1.2), (1 - smooth((t - S('f1', 0.0)) / 0.6)), true);
  drawPath(pEW, EWL.map(P), smooth((t - Wd('f1', 'leste', -0.2)) / 1.6), 1 - smooth((t - E('f2', 0.5)) / 0.8));
  for (const lb of LABELS) { const al = smooth((t - lb.t0) / 0.28) * (1 - smooth((t - lb.t1) / 0.3)); const p = proj(lb.lat, lb.lon);
    if (al <= 0.01 || !p.ok || p.y + (lb.dy ?? -20) < 330) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    lb.el.style.opacity = al; lb.el.style.left = (p.x + (lb.dx || 0)) + 'px'; lb.el.style.top = (p.y + (lb.dy ?? -20)) + 'px'; lb.el.style.transform = `translate(-50%,-100%) scale(${0.85 + 0.15 * al})`;
    if (lb.dotEl) { lb.dotEl.style.opacity = al; lb.dotEl.style.left = p.x + 'px'; lb.dotEl.style.top = p.y + 'px'; } }
  const ch = CHUNKS.find(x => t >= x.t0 - 0.05 && t <= x.t1 + 0.18);
  if (ch) { const cur = ch.words.findIndex(w => t >= w.t0 && t < w.t1); const idx = cur < 0 ? (t >= ch.words[ch.words.length - 1].t1 ? ch.words.length - 1 : 0) : cur; const key = CHUNKS.indexOf(ch) + ':' + idx;
    if (key !== capKey) { capEl.innerHTML = ch.words.map((w, i) => `<span class="w${i === idx ? ' on' : ''}">${w.txt}</span>`).join(' '); capKey = key; } } else if (capKey) { capEl.innerHTML = ''; capKey = ''; }
  const ci = CARDS.findIndex(x => t >= x.t0 && t < x.t1);
  if (ci >= 0) { const cd = CARDS[ci]; if (ci !== cardKey) { cardEl.innerHTML = cd.html; cardKey = ci; } const al = smooth((t - cd.t0) / 0.3) * (1 - smooth((t - (cd.t1 - 0.25)) / 0.25)); cardEl.style.opacity = al; cardEl.style.transform = `translateY(${(1 - al) * 40}px)`; } else { cardEl.style.opacity = 0; cardKey = -1; }
  let bb = BAR[0]; for (const x of BAR) if (t >= x.t) bb = x; if (barChip.textContent !== bb.chip) { barChip.textContent = bb.chip; barTtl.textContent = bb.ttl; }
  footEl.textContent = 'Contorno do Brasil e dos EUA aproximados'; footEl.style.opacity = dN < 16 && t < S('c1', 1) ? 1 : 0;
}
window.__TOTAL = TOTAL; window.__KM = [NS_KM, EW_KM, US_EXT]; window.renderFrame = async t => { update(t); await new Promise(r => requestAnimationFrame(() => r())); return true; }; window.__ready = true; update(0);
