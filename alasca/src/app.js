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

const SUN = (() => { const la = 62 * DEG, lo = -150 * DEG, up = new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)), east = new THREE.Vector3(Math.cos(lo), 0, -Math.sin(lo)), north = new THREE.Vector3().crossVectors(up, east).normalize(); return up.multiplyScalar(0.55).addScaledVector(east, -0.55).addScaledVector(north, 0.6).normalize(); })();
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
  { t: 0, lat: 46, lon: -158, d: 20, tilt: 0, head: -22, shift: 120 },
  { t: 1.0, lat: 58, lon: -152, d: 10, tilt: 8, head: -6, shift: 40 },
  { t: E('h2', 0.0), lat: 63, lon: -152, d: 5.6, tilt: 10, head: 0, shift: 0 },
  { t: S('f1', 0.5), lat: 64, lon: -150, d: 4.2, tilt: 30, head: -14, shift: 0 },
  { t: E('f1', 0.0), lat: 61, lon: -146, d: 3.3, tilt: 38, head: 16, shift: 0 },
  { t: S('f2', 0.3), lat: 64, lon: -152, d: 6.5, tilt: 8, head: 0, shift: 0 },
  { t: Wd('f2', 'tamanho', 0.3), lat: 52, lon: -128, d: 12, tilt: 0, head: 0, shift: 0, hop: 0.3 },
  { t: E('f2', 0.0), lat: 44, lon: -110, d: 12, tilt: 0, head: 0, shift: -40 },
  { t: S('f3', 0.0), lat: 62, lon: -148, d: 7.5, tilt: 18, head: -10, shift: 0, hop: 0.3 },
  { t: E('f3', 0.0), lat: 58, lon: -150, d: 8.5, tilt: 26, head: 22, shift: 0 },
  { t: S('c1', 1.2), lat: 48, lon: -125, d: 20, tilt: 0, head: 0, shift: 150 },
  { t: TOTAL, lat: 46, lon: -158, d: 22, tilt: 0, head: 0, shift: 230 },
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
const pAK = mkPath('#ff6a4a', 8, 'rgba(255,90,60,0.22)'), pUS = mkPath('#8fc2ff', 7, 'rgba(70,130,255,0.14)');
const toObj = a => a.map(([lat, lon]) => ({ lat, lon })), AKP = toObj(geo.alasca), USP = toObj(geo.usa);
const AKC = { lat: 63.5, lon: -152.5 }, USC = { lat: 39.5, lon: -98.5 }, TGT = { lat: 41.5, lon: -104 };
function basis(lat, lon) { const up = ll2v(lat, lon, 1), east = new THREE.Vector3(Math.cos(lon * DEG), 0, -Math.sin(lon * DEG)), north = new THREE.Vector3().crossVectors(up, east).normalize(); return { up, east, north }; }
const bAK = basis(AKC.lat, AKC.lon);
const akLocal = AKP.map(p => { const v = ll2v(p.lat, p.lon, 1), ang = Math.acos(clamp(v.dot(bAK.up), -1, 1)), d = v.clone().sub(bAK.up.clone().multiplyScalar(v.dot(bAK.up))).normalize(); return { x: ang * 6371 * d.dot(bAK.east), y: ang * 6371 * d.dot(bAK.north) }; });
function akAt(u) {   // silhueta do Alasca (tamanho real) desliza do Alasca até os EUA continentais
  const va = ll2v(AKC.lat, AKC.lon, 1), vb = ll2v(TGT.lat, TGT.lon, 1), om = Math.acos(clamp(va.dot(vb), -1, 1)), c = va.clone().multiplyScalar(Math.sin((1 - u) * om)).addScaledVector(vb, Math.sin(u * om)).divideScalar(Math.sin(om));
  const b = basis(Math.asin(c.y) / DEG, Math.atan2(c.x, c.z) / DEG);
  return akLocal.map(p => { const h = Math.hypot(p.x, p.y) || 1, ang = h / 6371, dir = b.east.clone().multiplyScalar(p.x / h).addScaledVector(b.north, p.y / h), v = b.up.clone().multiplyScalar(Math.cos(ang)).addScaledVector(dir, Math.sin(ang)); return { lat: Math.asin(v.y) / DEG, lon: Math.atan2(v.x, v.z) / DEG }; });
}
const AK_AREA = 1518800, KM_AK = 1518800;
function pathFrom(pts, close) { return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('') + (close ? 'Z' : ''); }
function drawPath(el, pts, prog, a = 1, close = false) { if (prog <= 0 || pts.some(p => !p.ok)) { el.setAttribute('opacity', 0); return; } el.setAttribute('d', pathFrom(pts, close)); el.setAttribute('stroke-dasharray', `${prog.toFixed(4)} 1.01`); el.setAttribute('opacity', a); }
// faixa de data (estilo documentário) e etiqueta de preço
const stage = document.getElementById('stage');
const banner = Object.assign(document.createElement('div'), { id: 'banner' }); stage.appendChild(banner);
Object.assign(banner.style, { position: 'absolute', left: '33%', top: '360px', transform: 'translateX(-50%)', background: 'rgba(10,14,24,.92)', color: '#fff', font: '800 30px Inter, DejaVu Sans, sans-serif', letterSpacing: '2px', padding: '10px 24px', borderRadius: '6px', border: '2px solid rgba(255,255,255,.25)', opacity: 0, whiteSpace: 'nowrap', textTransform: 'uppercase' });
banner.innerHTML = '1867 · A RÚSSIA VENDE O ALASCA';
const price = Object.assign(document.createElement('div'), { id: 'price' }); stage.appendChild(price);
Object.assign(price.style, { position: 'absolute', transform: 'translate(-50%,-100%)', background: '#fff', color: '#111', font: '900 44px Inter, DejaVu Sans, sans-serif', letterSpacing: '1px', padding: '8px 20px', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.55)', opacity: 0, whiteSpace: 'nowrap' });
let PHOTO = false; try { PHOTO = (await fetch('/assets/neymar.png', { method: 'HEAD' })).ok; } catch (e) {}
const HEXCP = 'polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)';
const hexPhoto = (w) => { const h = Math.round(w * 1.19); const inner = PHOTO ? `<img src="/assets/neymar.png" style="width:100%;height:100%;object-fit:cover;display:block">` : `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="background:#16233f"><circle cx="50" cy="38" r="17" fill="#8fc2ff"/><path d="M14 96 Q14 64 50 64 Q86 64 86 96 Z" fill="#8fc2ff"/></svg>`;
  return `<div style="width:${w}px;height:${h}px;background:linear-gradient(135deg,#ffd36a,#ff8a4a 55%,#8fc2ff);clip-path:${HEXCP};display:flex;align-items:center;justify-content:center"><div style="width:${w - 16}px;height:${h - 18}px;clip-path:${HEXCP};overflow:hidden">${inner}</div></div>`; };
const dim = Object.assign(document.createElement('div'), { id: 'dim' }); stage.appendChild(dim);
Object.assign(dim.style, { position: 'absolute', inset: '0', background: 'radial-gradient(ellipse at 50% 55%, rgba(0,0,0,.15), rgba(0,0,0,.75))', opacity: 0, pointerEvents: 'none' });
stage.insertBefore(dim, document.getElementById('bar'));
const nm = Object.assign(document.createElement('div'), { id: 'nm' }); stage.appendChild(nm);
Object.assign(nm.style, { position: 'absolute', width: '640px', textAlign: 'center', color: '#fff', font: '800 40px Inter, DejaVu Sans, sans-serif', opacity: 0, transformOrigin: '50% 50%', filter: 'drop-shadow(0 24px 40px rgba(0,0,0,.7))' });
nm.innerHTML = `<div style="display:flex;justify-content:center">${hexPhoto(400)}</div><div style="margin-top:22px;letter-spacing:5px;font-size:52px">NEYMAR JR.</div><div style="color:#b9c8e6;font-size:30px;letter-spacing:4px;margin-top:4px">TRANSFERÊNCIA · 2017</div><div style="color:#ffd36a;font-size:78px;font-weight:900;margin-top:10px;white-space:nowrap;text-shadow:0 0 30px rgba(255,200,80,.45)">€ 222 MILHÕES</div>`;
const LABELS = [];
function addLabel(o) { const el = document.createElement('div'); el.className = 'lab ' + (o.cls || ''); el.textContent = o.text; labelsEl.appendChild(el); const dot = o.dot === false ? null : Object.assign(document.createElement('div'), { className: 'dot' }); if (dot) labelsEl.appendChild(dot); LABELS.push({ ...o, el, dotEl: dot }); }
addLabel({ text: 'ALASCA', lat: 64, lon: -152, t0: 0.4, t1: S('f2', 0.2), dy: -10, dot: false });
addLabel({ text: 'ESTADOS UNIDOS', cls: 'dk', lat: 36, lon: -98, t0: 0.4, t1: S('h2', 0.0), dy: -10, dot: false });
addLabel({ text: 'ALASCA · ESCALA REAL', cls: 'dk', dx: -110, lat: 49.5, lon: -104, t0: Wd('f2', 'tamanho', 1.2), t1: E('f2', 0.4), dy: -6, dot: false });
const fmtBar = (v, max, c) => `<div style="height:34px;width:${Math.max(3, (v / max) * 520)}px;background:${c};border-radius:8px;margin-top:4px"></div>`;
let CARD3 = null;
const CARDS = [
  { t0: Wd('h2', 'Três', -0.1), t1: E('h2', 0.5), html: `<div class="big">3 FATOS</div><div class="sub">o último é o mais absurdo</div>` },
  { t0: Wd('f1', '1867', -0.2), t1: E('f1', 0.4), html: `<div class="big">1867</div><div class="sub">Rússia → Estados Unidos</div>` },
  { t0: Wd('f2', '1,5', -0.2), t1: E('f2', 0.4), html: `<div class="big s">1,5 mi km²</div><div class="sub">≈ 1/5 dos EUA continentais</div>` },
  { t0: Wd('f3', '7,2', -0.1), t1: Wd('f3', 'Neymar', -0.2), html: `<div class="big">US$ 7,2 mi</div><div class="sub">o preço do Alasca</div>` },
  { t0: Wd('f3', 'Neymar', -0.2), t1: E('f3', 0.5), bars: true },
  { t0: Wd('c1', 'Segue', -0.1), t1: TOTAL + 1, html: `<div class="big">PARTE 2</div><div class="sub">segue pra continuar</div>` },
];
const BAR = [{ t: 0, chip: 'VOCÊ SABIA?', ttl: 'Alasca' }, { t: S('f1', -0.1), chip: '1 DE 3', ttl: 'O preço' }, { t: S('f2', -0.1), chip: '2 DE 3', ttl: 'O tamanho' }, { t: S('f3', -0.1), chip: '3 DE 3', ttl: 'O preço' }, { t: S('c1', -0.1), chip: 'PARTE 1', ttl: 'Alasca' }];
const BEATS = [S('h2', -0.05), S('f1', 0), S('f2', 0), Wd('f2', 'tamanho', 0), S('f3', 0), Wd('f3', 'Dá', 0)];
const CHUNKS = []; for (const l of TL.lines) { let cur = []; const flush = () => { if (cur.length) { CHUNKS.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; } };
  for (const w of l.words) { const txt = w.w.replace(/[,.:;]+$/, '').toUpperCase(); const len = cur.reduce((a, x) => a + x.txt.length + 1, 0) + txt.length; if (cur.length && (len > 24 || cur.length >= 4)) flush(); cur.push({ ...w, txt }); if (/[,.:?]$/.test(w.w)) flush(); } flush(); }
const capEl = document.getElementById('cap'), cardEl = document.getElementById('card'), barChip = document.getElementById('chip'), barTtl = document.getElementById('ttl'), footEl = document.getElementById('foot');
let capKey = '', cardKey = -1;
function update(t) {
  const c = camState(t); { let k = 1; for (const b of BEATS) if (t >= b && t - b < 1.2) k = Math.min(k, 1 - 0.09 * Math.exp(-(t - b) / 0.22)); c.d *= k; } const dN = c.d; placeCamera(t, c); camera.updateMatrixWorld();
  regMat.uniforms.uAlpha.value = smooth((26 - dN) / 6); const lm = smooth((dN - 1.5) / 3);
  globe.material.uniforms.uMix.value = lm; regMat.uniforms.uMix.value = lm; regMat.uniforms.uHaze.value = smooth((1.8 - dN) / 1.2);
  cloudMat.opacity = 0.35 * smooth((dN - 4) / 6); atmoMat.uniforms.uA.value = smooth((dN - 1.5) / 6) * 0.9 + 0.1 * smooth((dN - 0.3) / 1.5);
  renderer.render(scene, camera);
  const P = p => proj(p.lat, p.lon);
  drawPath(pAK, AKP.map(P), smooth(t / 0.8), 1, true);   // o contorno do Alasca fica; na cena de escala ele "descola" e desliza
  const slideT = smooth((t - Wd('f2', 'tamanho', 0.0)) / 1.8);
  if (t > Wd('f2', 'tamanho', 0.0) - 0.05) { drawPath(pAK, akAt(slideT).map(P), 1, 1, true); drawPath(pUS, USP.map(P), 1, smooth((t - Wd('f2', 'tamanho', -0.2)) / 0.5) * (1 - smooth((t - E('f2', 0.4)) / 0.6)), true); } else pUS.setAttribute('opacity', 0);
  if (t > E('f2', 0.4)) drawPath(pAK, AKP.map(P), 1, smooth((t - E('f2', 0.4)) / 0.4), true);
  for (const lb of LABELS) { const al = smooth((t - lb.t0) / 0.2) * (1 - smooth((t - lb.t1) / 0.25)); const p = proj(lb.lat, lb.lon);
    if (al <= 0.01 || !p.ok || p.y + (lb.dy ?? -20) < 330) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    lb.el.style.opacity = al; lb.el.style.left = (p.x + (lb.dx || 0)) + 'px'; lb.el.style.top = (p.y + (lb.dy ?? -20)) + 'px'; lb.el.style.transform = `translate(-50%,-100%) scale(${0.85 + 0.15 * al})`;
    if (lb.dotEl) { lb.dotEl.style.opacity = al; lb.dotEl.style.left = p.x + 'px'; lb.dotEl.style.top = p.y + 'px'; } }
  // faixa "1867" e etiqueta de preço (censurada até a revelação)
  banner.style.opacity = smooth((t - Wd('f1', '1867', -0.3)) / 0.3) * (1 - smooth((t - E('f1', 0.5)) / 0.3));
  const pp = proj(63, -150), pa = smooth((t - S('f3', 0.1)) / 0.3) * (1 - smooth((t - Wd('f3', 'Neymar', 0.2)) / 0.3));
  if (pp.ok && pa > 0.01) { const rev = t >= Wd('f3', '7,2', 0.0); price.innerHTML = rev ? 'CUSTOU US$ 7,2 MILHÕES' : 'CUSTOU US$ <span style="background:#d6281f;color:#fff;padding:0 10px;border-radius:5px;font-size:30px;letter-spacing:2px">CENSURADO</span>'; price.style.left = pp.x + 'px'; price.style.top = (pp.y - 70) + 'px'; price.style.opacity = pa; } else price.style.opacity = 0;
  { const tA = Wd('h1', 'Alasca', -0.15), u = smooth((t - tA) / 0.55), ob = 1 + 0.18 * Math.sin(Math.PI * clamp((t - tA) / 0.55)) * (1 - u);   // voa até o canto com um leve "overshoot"
    const fin = smooth(t / 0.2), fout = 1 - smooth((t - Wd('f3', 'Neymar', -0.5)) / 0.3), push = 1 + 0.12 * clamp(t / 1.7);
    const ry = (1 - u) * 12 * Math.sin(t * 2.4), rx = (1 - u) * 5 * Math.cos(t * 1.9), rz = (1 - u) * 3 * Math.sin(t * 1.3) - 9 * Math.sin(Math.PI * clamp((t - tA) / 0.55));
    nm.style.opacity = fin * fout; nm.style.left = '540px'; nm.style.top = lerp(990, 530, u) + 'px';
    nm.style.transform = `translate(-50%,-50%) translateX(${lerp(0, 262, u)}px) perspective(1000px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${lerp(push, 0.40, u) * ob})`;
    dim.style.opacity = fin * (1 - smooth((t - tA) / 0.5)); }
  const ch = CHUNKS.find(x => t >= x.t0 - 0.05 && t <= x.t1 + 0.12);
  if (ch) { const cur = ch.words.findIndex(w => t >= w.t0 && t < w.t1); const idx = cur < 0 ? (t >= ch.words[ch.words.length - 1].t1 ? ch.words.length - 1 : 0) : cur; const key = CHUNKS.indexOf(ch) + ':' + idx;
    if (key !== capKey) { capEl.innerHTML = ch.words.map((w, i) => `<span class="w${i === idx ? ' on' : ''}">${w.txt}</span>`).join(' '); capKey = key; } } else if (capKey) { capEl.innerHTML = ''; capKey = ''; }
  const ci = CARDS.findIndex(x => t >= x.t0 && t < x.t1);
  if (ci >= 0) { const cd = CARDS[ci];
    if (cd.bars) { const u = smooth((t - cd.t0) / 1.2), n = Math.round(36 * smooth((t - Wd('f3', 'Dá', 0)) / 1.4)); cardEl.innerHTML = `<div style="display:flex;gap:26px;align-items:center"><div style="flex:none">${hexPhoto(96)}</div><div style="text-align:left;font-weight:800;color:#fff;font-size:34px;letter-spacing:2px;flex:1"><div>NEYMAR · 2017 <span style="color:#8fc2ff">€222 mi</span>${fmtBar(262 * u, 262, '#8fc2ff')}</div><div style="margin-top:14px">ALASCA · 1867 <span style="color:#ff8a6a">US$ 7,2 mi</span>${fmtBar(7.2 * u, 262, '#ff6a4a')}</div></div></div><div class="big s" style="margin-top:12px;color:#ffd36a">≈ ${n} ALASCAS</div>`; cardKey = ci; }
    else if (ci !== cardKey) { cardEl.innerHTML = cd.html; cardKey = ci; }
    const al = smooth((t - cd.t0) / 0.25) * (1 - smooth((t - (cd.t1 - 0.2)) / 0.2)); cardEl.style.opacity = al; cardEl.style.transform = `translateY(${(1 - al) * 40}px)`; } else { cardEl.style.opacity = 0; cardKey = -1; }
  let bb = BAR[0]; for (const x of BAR) if (t >= x.t) bb = x; if (barChip.textContent !== bb.chip) { barChip.textContent = bb.chip; barTtl.textContent = bb.ttl; }
  footEl.textContent = t > S('f3', 0) ? 'Valores nominais da época; com inflação, o Alasca ainda sairia mais barato' : 'Contornos aproximados · área da compra: 1,52 milhão de km²'; footEl.style.opacity = t < S('c1', 1) ? 1 : 0;
}
window.__TOTAL = TOTAL; window.renderFrame = async t => { update(t); await new Promise(r => requestAnimationFrame(() => r())); return true; }; window.__ready = true; update(0);
