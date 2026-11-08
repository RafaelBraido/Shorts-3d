import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Mar da Galileia 3D — globo -> Levante -> relevo real (DEM) do vale
 * do Jordão. Unidade 1 = 1000 km. Tudo é função pura de t (segundos),
 * então o render offline (Playwright) é determinístico.
 * ------------------------------------------------------------------ */
const W = 1080, H = 1920, R = 6.371, DEG = Math.PI / 180;
const LIFT = 0.0045;             // base (4,5 km) do remendo local, p/ o relevo exagerado não afundar
const EXAG = 5;                  // exagero vertical base do relevo local (sobe p/ 16× no fato 1)
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;

const ll2v = (lat, lon, r = R) => { const la = lat * DEG, lo = lon * DEG; return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)); };

const [TL, geo, maps] = await Promise.all(['/out/timeline.json', '/assets/geo.json', '/assets/maps.json'].map(u => fetch(u).then(r => r.json())));
const hbuf = await fetch('/assets/local_height.bin').then(r => r.arrayBuffer());
const LOC = maps.local, REG = maps.region;
const HG = new Float32Array(hbuf), GW = LOC.gw + 1, GH = LOC.gh + 1;
{ const tmp = new Float32Array(HG.length);
  for (let pass = 0; pass < 2; pass++) { for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { let a = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < GW && yy < GH) { a += HG[yy * GW + xx]; n++; } } tmp[y * GW + x] = a / n; }
    for (let i = 0; i < HG.length; i++) { const w = HG[i] === -210 || HG[i] === -430; if (!w) HG[i] = tmp[i]; } } }
function hAt(lat, lon) { // altura (m) bilinear na grade local
  const x = clamp((lon - LOC.lon0) / (LOC.lon1 - LOC.lon0)) * (GW - 1), y = clamp((LOC.lat1 - lat) / (LOC.lat1 - LOC.lat0)) * (GH - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, GW - 1), y1 = Math.min(y0 + 1, GH - 1), fx = x - x0, fy = y - y0;
  return lerp(lerp(HG[y0 * GW + x0], HG[y0 * GW + x1], fx), lerp(HG[y1 * GW + x0], HG[y1 * GW + x1], fx), fy);
}

/* ---------------------------- linha do tempo ---------------------------- */
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const L = Object.fromEntries(TL.lines.map(l => [l.id, l]));
const S = (id, dt = 0) => L[id].start + dt, E = (id, dt = 0) => L[id].end + dt;
const Wd = (id, w, dt = 0) => { const k = L[id].words.find(x => norm(x.w) === norm(w)) || L[id].words.find(x => norm(x.w).startsWith(norm(w))); if (!k) throw new Error('palavra? ' + id + ' ' + w); return k.t0 + dt; };
const TOTAL = TL.total;

/* ------------------------------ cena three ------------------------------ */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x02050d, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.01, 100);

const loader = new THREE.TextureLoader();
const tex = async (u, srgb = false) => { const t = await loader.loadAsync(u); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
const [tDay, tReg, tLoc, tMask, tClouds, tDet, tDetMask] = await Promise.all([tex('/assets/earth_day.jpg'), tex('/assets/region_color.jpg'), tex('/assets/local_color.jpg'), tex('/assets/local_water.png', false), tex('/assets/earth_clouds_1024.png', true), tex('/assets/detail_color.jpg'), tex('/assets/detail_water.png', false)]);
const DETM = maps.detail, DRECT = new THREE.Vector4((DETM.lon0 - LOC.lon0) / (LOC.lon1 - LOC.lon0), (DETM.lat0 - LOC.lat0) / (LOC.lat1 - LOC.lat0), (DETM.lon1 - LOC.lon0) / (LOC.lon1 - LOC.lon0), (DETM.lat1 - LOC.lat0) / (LOC.lat1 - LOC.lat0));
tDay.wrapS = THREE.RepeatWrapping;
const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blackTex.needsUpdate = true;

function patchGeometry(lon0, lon1, lat0, lat1, nx, ny, heights) {
  const n = (nx + 1) * (ny + 1), pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), uv = new Float32Array(n * 2), hh = new Float32Array(n);
  let k = 0;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
    const u = i / nx, v = 1 - j / ny, lon = lerp(lon0, lon1, u), lat = lerp(lat0, lat1, v), p = ll2v(lat, lon, 1);
    dir.set([p.x, p.y, p.z], k * 3); pos.set([p.x * R, p.y * R, p.z * R], k * 3); uv.set([u, v], k * 2);
    hh[k] = heights ? heights[j * (nx + 1) + i] : 0;
  }
  const idx = new Uint32Array(nx * ny * 6); let q = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.set([a, c, b, b, c, d], q); q += 6; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aH', new THREE.BufferAttribute(hh, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); return g;
}

// globo (equiretangular, 4096)
const globeGeo = patchGeometry(-180, 180, -90, 90, 360, 180);
const globe = new THREE.Mesh(globeGeo, new THREE.ShaderMaterial({
  uniforms: { uMap: { value: tDay }, uR: { value: R }, uBright: { value: 1 }, uMix: { value: 1 } },
  vertexShader: `attribute vec3 aDir; attribute float aH; varying vec2 vUv; varying vec3 vN; uniform float uR;
    void main(){ vUv=uv; vN=aDir; gl_Position=projectionMatrix*viewMatrix*vec4(aDir*uR,1.); }`,
  fragmentShader: `uniform sampler2D uMap; uniform float uBright,uMix; varying vec2 vUv; varying vec3 vN;
    void main(){ vec3 c=texture2D(uMap,vUv).rgb; float l=mix(1.,0.62+0.5*clamp(dot(normalize(vN),normalize(vec3(-.45,.35,1.))),0.,1.),uMix);
      gl_FragColor=vec4(c*l*uBright,1.); }`,
}));
scene.add(globe);

// nuvens (só vistas de longe)
const cloudMat = new THREE.MeshBasicMaterial({ map: tClouds, transparent: true, opacity: 0.55, depthWrite: false });
const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 96, 64), cloudMat); clouds.renderOrder = 1; scene.add(clouds);
clouds.rotation.y = -Math.PI / 2; // alinha a convenção de longitude do SphereGeometry (u=0 em -180) com a nossa

// atmosfera (halo)
const atmoMat = new THREE.ShaderMaterial({
  uniforms: { uA: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uA; varying vec3 vN; void main(){ float i=pow(clamp(0.72-dot(vN,vec3(0.,0.,1.)),0.,1.),3.2); gl_FragColor=vec4(.30,.58,1.,1.)*i*1.6*uA; }`,
});
const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 96, 64), atmoMat); atmo.renderOrder = 3; scene.add(atmo);

// estrelas
{
  const n = 1400, p = new Float32Array(n * 3); let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u); p.set([r * Math.cos(a) * 55, u * 55, r * Math.sin(a) * 55], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, sizeAttenuation: true, transparent: true, opacity: .8, depthWrite: false })));
}

// remendos de terreno (regional sem relevo; local com relevo + água animada)
const patchVS = `attribute vec3 aDir; attribute float aH; uniform float uR,uExag,uLift,uFeather; varying vec2 vUv; varying float vEdge,vDist,vH; varying vec3 vDir;
  void main(){ vUv=uv; vDir=aDir; float e=smoothstep(0.,uFeather,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y))); vEdge=e; vH=aH;
    vec3 p=aDir*(uR+uLift+aH*1e-6*uExag*e); vDist=distance(p,cameraPosition); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`;
const patchFS = `uniform sampler2D uMap,uMask,uDet,uDetMask; uniform vec4 uDetRect; uniform float uDetOn; uniform float uAlpha,uTime,uStorm,uBright,uHaze,uWater,uMix,uFeatherA; varying vec2 vUv; varying float vEdge,vDist,vH; varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
  void main(){ vec3 c=texture2D(uMap,vUv).rgb; float m=texture2D(uMask,vUv).r;
    vec2 du=(vUv-uDetRect.xy)/(uDetRect.zw-uDetRect.xy); float da=smoothstep(0.,.08,min(min(du.x,1.-du.x),min(du.y,1.-du.y)))*uDetOn; vec2 dc=clamp(du,0.,1.);
    c=mix(c,texture2D(uDet,dc).rgb,da); m=mix(m,texture2D(uDetMask,dc).r,da);
    if(uWater>0.5 && m>0.02){
      vec2 p=vUv*vec2(150.,230.); float t=uTime;
      float a=vn(p*1.0+vec2(t*.35,t*.2)); float b=vn(p*2.3-vec2(t*.5,-t*.3)); float cc=vn(p*5.1+vec2(-t*.9,t*.6));
      float w=(a*.5+b*.3+cc*.2); float amp=.16+uStorm*.55;
      float crest=smoothstep(.62-uStorm*.12,.9,w);
      vec3 wc=c*(1.-amp*.6+(w-.5)*amp*1.6)+vec3(.85,.93,1.)*crest*(.12+.85*uStorm);
      c=mix(c,wc,m);
    }
    c*=uBright*mix(1.,0.62+0.5*clamp(dot(normalize(vDir),normalize(vec3(-.45,.35,1.))),0.,1.),uMix);
    float hz=clamp(pow(vDist/1.7,1.5),0.,1.)*uHaze; c=mix(c,vec3(.22,.34,.50),hz*.38);
    float ea=smoothstep(0.,uFeatherA,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y))); gl_FragColor=vec4(c,uAlpha*ea); }`;
function patchMat(map, mask, o) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: true, vertexShader: patchVS, fragmentShader: patchFS,
    uniforms: { uMap: { value: map }, uMask: { value: mask }, uR: { value: R }, uExag: { value: 0 }, uLift: { value: o.lift }, uFeather: { value: o.feather }, uFeatherA: { value: o.featherA }, uAlpha: { value: 0 }, uTime: { value: 0 }, uStorm: { value: 0 }, uBright: { value: 1 }, uHaze: { value: 1 }, uMix: { value: 1 }, uWater: { value: o.water ? 1 : 0 }, uDet: { value: o.det || blackTex }, uDetMask: { value: o.detMask || blackTex }, uDetRect: { value: DRECT }, uDetOn: { value: o.det ? 1 : 0 } } });
}
const regMat = patchMat(tReg, blackTex, { lift: 0.0003, feather: 0.02, featherA: 0.03 });
const reg = new THREE.Mesh(patchGeometry(REG.lon0, REG.lon1, REG.lat0, REG.lat1, 250, 190), regMat); reg.renderOrder = 2; scene.add(reg);
const locMat = patchMat(tLoc, tMask, { lift: LIFT, feather: 0.035, featherA: 0.16, water: true, det: tDet, detMask: tDetMask });
const loc = new THREE.Mesh(patchGeometry(LOC.lon0, LOC.lon1, LOC.lat0, LOC.lat1, LOC.gw, LOC.gh, HG), locMat); loc.renderOrder = 4; scene.add(loc);

// plano do nível do mar sobre o lago (fato 1)
const SEA = { lat0: 32.55, lat1: 33.12, lon0: 35.28, lon1: 35.92 };
const seaMat = new THREE.MeshBasicMaterial({ color: 0x66d4ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
const seaPlane = new THREE.Mesh(patchGeometry(SEA.lon0, SEA.lon1, SEA.lat0, SEA.lat1, 20, 20), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uA: { value: 0 }, uLift: { value: LIFT }, uR: { value: R } },
  vertexShader: `attribute vec3 aDir; uniform float uLift,uR; varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*viewMatrix*vec4(aDir*(uR+uLift),1.); }`,
  fragmentShader: `uniform float uA; varying vec2 vUv; void main(){ float e=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)); float edge=1.-smoothstep(0.,.02,e); gl_FragColor=vec4(mix(vec3(.35,.82,1.),vec3(1.),edge),(.20+.55*edge)*uA); }`,
})); seaPlane.renderOrder = 6; scene.add(seaPlane);

/* ------------------------------ câmera ------------------------------ */
// k = {t, lat, lon, d, tilt, head, shift}
const K = [
  { t: 0, lat: 31, lon: 22, d: 26, tilt: 0, head: 0, shift: 230 },
  { t: 1.5, lat: 31.5, lon: 27, d: 23, tilt: 0, head: 0, shift: 200 },
  { t: E('h2', 0.0), lat: 32.4, lon: 33.6, d: 3.4, tilt: 10, head: 0, shift: 60 },
  { t: S('d1', 2.6), lat: 32.6, lon: 35.2, d: 0.80, tilt: 30, head: -4, shift: 0 },
  { t: E('d1', 0.2), lat: 32.82, lon: 35.58, d: 0.17, tilt: 46, head: 8, shift: 0 },
  { t: E('n1', 0.0), lat: 32.86, lon: 35.50, d: 0.26, tilt: 42, head: -4, shift: 0 },
  { t: Wd('n3', 'Galileia', 0.3), lat: 32.95, lon: 35.30, d: 0.36, tilt: 40, head: -10, shift: 0 },
  { t: E('n4', 0.2), lat: 32.93, lon: 35.38, d: 0.32, tilt: 41, head: -12, shift: 0 },
  { t: Wd('n5', 'iam', 0.0), lat: 32.82, lon: 35.58, d: 0.14, tilt: 46, head: 10, shift: 0 },
  { t: E('n5', 0.2), lat: 32.82, lon: 35.585, d: 0.125, tilt: 48, head: 16, shift: 0 },
  { t: S('f1', 0.9), lat: 32.80, lon: 35.585, d: 0.17, tilt: 62, head: 0, shift: 0 },
  { t: E('f1'), lat: 32.82, lon: 35.585, d: 0.135, tilt: 68, head: -6, shift: 0 },
  { t: S('f2', 0.2), lat: 32.83, lon: 35.60, d: 0.10, tilt: 52, head: 20, shift: 0 },
  { t: E('f2'), lat: 32.82, lon: 35.60, d: 0.068, tilt: 60, head: 40, shift: 0 },
  { t: S('f3', 0.1), lat: 33.02, lon: 35.60, d: 0.38, tilt: 55, head: 0, shift: 0, hop: 0.5 },
  { t: Wd('f3', 'segue', 0.0), lat: 32.35, lon: 35.58, d: 0.50, tilt: 56, head: 0, shift: 0 },
  { t: E('f3', 0.1), lat: 31.78, lon: 35.52, d: 0.40, tilt: 58, head: 0, shift: 0 },
  { t: S('c1', 0.3), lat: 31.8, lon: 35.5, d: 0.5, tilt: 45, head: 0, shift: 0 },
  { t: S('c1', 1.6), lat: 32.5, lon: 34.5, d: 3.0, tilt: 12, head: 0, shift: 90 },
  { t: TOTAL, lat: 31, lon: 22, d: 26, tilt: 0, head: 0, shift: 230 },
];
function camState(t) {
  let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1], u = smooth((t - a.t) / Math.max(b.t - a.t, 1e-6));
  // 'hop' = arco de altitude como no flyTo do Cesium (sobe no meio do trajeto e pousa no destino)
  return { lat: lerp(a.lat, b.lat, u), lon: lerp(a.lon, b.lon, u), d: Math.exp(lerp(Math.log(a.d), Math.log(b.d), u) + (b.hop || 0) * Math.sin(Math.PI * u)), tilt: lerp(a.tilt, b.tilt, u), head: lerp(a.head, b.head, u), shift: lerp(a.shift, b.shift, u) };
}
const stormAt = t => smooth((t - S('f2', 0.2)) / 1.6) * (1 - smooth((t - E('f2', 0.2)) / 1.2));

function placeCamera(t, c, E_) {
  const tgtH = hAt(c.lat, c.lon) * 1e-6 * E_;
  const P = ll2v(c.lat, c.lon, R + (E_ > 0 ? LIFT + Math.max(tgtH, -0.002) : 0.0003));
  const up = P.clone().normalize(), east = new THREE.Vector3(Math.cos(c.lon * DEG), 0, -Math.sin(c.lon * DEG));
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  const sk = stormAt(t), wob = Math.sin(t * 0.8) * 0.5 + sk * Math.sin(t * 17.3) * 0.5;
  const head = (c.head + wob) * DEG, tilt = (c.tilt + sk * Math.sin(t * 13.1) * 0.6) * DEG;
  const Ldir = north.clone().multiplyScalar(Math.cos(head)).add(east.clone().multiplyScalar(Math.sin(head)));
  camera.position.copy(P).addScaledVector(up, c.d * Math.cos(tilt)).addScaledVector(Ldir, -c.d * Math.sin(tilt));
  camera.up.copy(Ldir); camera.lookAt(P);
  camera.near = Math.max(0.0015, c.d * 0.03); camera.far = Math.max(c.d + 15, 62); camera.updateProjectionMatrix();
  camera.setViewOffset(W, H, 0, -c.shift, W, H);
}

/* ------------------------------ projeção ------------------------------ */
const _v = new THREE.Vector3();
function proj(lat, lon, hM, E_) {
  const p = ll2v(lat, lon, R + (E_ > 0 ? LIFT + hM * 1e-6 * E_ : 0.0003));
  const toCam = _v.copy(camera.position).sub(p); const front = toCam.dot(p) > 0;
  const q = p.clone().project(camera);
  return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H, ok: front && q.z < 1 && q.z > -1 };
}
const hOn = (lat, lon) => hAt(lat, lon);

/* ------------------------------ elementos de tela ------------------------------ */
const svg = document.getElementById('ov'), labelsEl = document.getElementById('labels');
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
const defs = mk('defs', {}); const glow = mk('filter', { id: 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs); mk('feGaussianBlur', { stdDeviation: 7, result: 'b' }, glow);
const fm = mk('feMerge', {}, glow); mk('feMergeNode', { in: 'b' }, fm); mk('feMergeNode', { in: 'SourceGraphic' }, fm);
const mkPath = (color, w, dash) => mk('path', { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, filter: 'url(#glow)', ...(dash ? { 'stroke-dasharray': dash } : {}), opacity: 0 });
const pRing = mkPath('#ffd36a', 8), pLake = mkPath('#7fe3ff', 7), pDead = mkPath('#ff9d6b', 7), pRoute = mkPath('#ffcf4a', 10);
const pHarpLine = mk('line', { stroke: '#fff', 'stroke-width': 5, 'stroke-dasharray': '4 14', 'stroke-linecap': 'round', opacity: 0 });
const pSeaBox = mkPath('#fff', 4);
const dimG = mk('g', { opacity: 0 }); const dimLine = mk('line', { stroke: '#ffd36a', 'stroke-width': 9, 'stroke-linecap': 'round' }, dimG);
const dimA = mk('circle', { r: 11, fill: '#ffd36a' }, dimG), dimB = mk('circle', { r: 11, fill: '#7fe3ff', stroke: '#fff', 'stroke-width': 4 }, dimG);
const head = mk('circle', { r: 15, fill: '#fff', stroke: '#ffcf4a', 'stroke-width': 7, opacity: 0, filter: 'url(#glow)' });
const distG = mk('g', { opacity: 0 }); const distLine = mk('line', { stroke: '#fff', 'stroke-width': 5, 'stroke-dasharray': '2 14', 'stroke-linecap': 'round' }, distG);

function pathFrom(pts, close) { return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('') + (close ? 'Z' : ''); }
function drawPath(el, pts, progress, close, alphaMul = 1) {
  if (!pts.length || progress <= 0 || pts.some(p => !p.ok)) { el.setAttribute('opacity', 0); return; }
  el.setAttribute('d', pathFrom(pts, close)); el.setAttribute('stroke-dasharray', `${progress.toFixed(4)} 1.01`); el.setAttribute('opacity', alphaMul);
}

// rótulos
const LABELS = [];
function addLabel(o) { const el = document.createElement('div'); el.className = 'lab ' + (o.cls || ''); el.textContent = o.text; labelsEl.appendChild(el);
  const dot = o.dot === false ? null : Object.assign(document.createElement('div'), { className: 'dot' }); if (dot) labelsEl.appendChild(dot); LABELS.push({ ...o, el, dotEl: dot }); }
const REGION_C = { lat: 32.97, lon: 35.30 };
const lakeC = { lat: 32.82, lon: 35.59 };
const lakePts = geo.galilee.map(([lon, lat]) => ({ lat, lon })), deadPts = geo.deadsea.map(([lon, lat]) => ({ lat, lon }));
const jordan = geo.jordan.map(([lat, lon]) => ({ lat, lon }));
const lakeS = lakePts.reduce((a, p) => p.lat < a.lat ? p : a), deadN = deadPts.reduce((a, p) => p.lat > a.lat ? p : a);
const hav = (a, b) => { const r = 6371, f1 = a.lat * DEG, f2 = b.lat * DEG, dl = (b.lon - a.lon) * DEG, dp = f2 - f1; const h = Math.sin(dp / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); };
const DIST_KM = Math.round(hav(lakeS, deadN));

addLabel({ text: 'GALILEIA', lat: REGION_C.lat, lon: REGION_C.lon, t0: Wd('n3', 'Galileia', -0.1), t1: E('n4', 0.6), dy: -20 });
addLabel({ text: 'MAR DA GALILEIA', lat: 32.86, lon: 35.60, t0: Wd('d1', 'verdade', 0.0), t1: Wd('n3', 'Galileia', -0.3), dy: -26 });
addLabel({ text: 'NÍVEL DO MAR · 0 m', cls: 'sm', lat: 32.98, lon: 35.40, t0: Wd('f1', 'abaixo', -1.6), t1: E('f1', 0.3), dy: -6, dot: false, h: 0 });
addLabel({ text: 'LAGO · −210 m', cls: 'dk', lat: 32.72, lon: 35.62, t0: Wd('f1', '210', -0.6), t1: E('f1', 0.3), dy: 4, dot: false, h: -210 });
addLabel({ text: 'CAFARNAUM', cls: 'sm', lat: 32.881, lon: 35.575, t0: S('f2', 0.5), t1: E('f2', 0.3), dy: -12 });
addLabel({ text: 'TIBERÍADES', cls: 'sm', lat: 32.792, lon: 35.531, t0: S('f2', 0.9), t1: E('f2', 0.3), dy: -12 });
addLabel({ text: 'RIO JORDÃO', lat: 32.40, lon: 35.545, t0: Wd('f3', 'Jordão', 0.0), t1: E('f3', 0.3), dy: -14 });
addLabel({ text: 'LAGO DA GALILEIA', cls: 'sm', lat: 32.86, lon: 35.60, t0: Wd('f3', 'alimentado', 0.0), t1: E('f3', 0.3), dy: -18 });
addLabel({ text: 'MAR MORTO', lat: 31.52, lon: 35.47, t0: Wd('f3', 'Morto', -0.2), t1: E('f3', 0.6), dy: -12 });

// cartões
const harpSVG = `<svg width="150" height="150" viewBox="0 0 100 100" style="display:block;margin:0 auto 6px"><path d="M22 86 L22 30 Q22 10 44 10 Q64 10 66 28 Q68 46 50 58 L22 86 Z" fill="none" stroke="#ffd36a" stroke-width="5" stroke-linejoin="round"/><path d="M26 82 L70 82" stroke="#ffd36a" stroke-width="5" stroke-linecap="round"/>${[32, 40, 48, 56, 64].map((x, i) => `<line x1="${x - 8 + i * 0.5}" y1="${i < 2 ? 16 + i * 4 : 24 + i * 6}" x2="${x - 8 + i * 0.5}" y2="82" stroke="#fff" stroke-width="2.6"/>`).join('')}</svg>`;
const CARDS = [
  { t0: Wd('d1', 'grande', -0.1), t1: Wd('n1', 'Mas', 0.1), html: `<div class="big s">LAGO DE</div><div class="big s">ÁGUA DOCE</div>` },
  { t0: Wd('n4', 'galil', -0.2), t1: E('n4', 0.5), html: `<div class="heb">גליל</div><div class="big s">GALIL</div><div class="sub">= círculo · distrito</div>` },
  { t0: Wd('n5', 'iam', -0.2), t1: E('n5', 0.5), html: `<div class="heb">ים</div><div class="big s">IAM</div><div class="sub">= mar <b style="color:#ffd36a">ou</b> lago</div>` },
  { t0: Wd('f1', '210', -0.2), t1: E('f1', 0.5), html: `<div class="big">−210 m</div><div class="sub">abaixo do nível do mar</div><div class="sub" style="color:#8fe3ff;font-size:32px;margin-top:8px">lago de água doce mais baixo do mundo</div>` },
  { t0: Wd('f2', 'tempestades', -0.1), t1: Wd('f2', 'Segundo', -0.1), html: `<div class="big s">TEMPESTADES</div><div class="sub">violentas e repentinas</div>` },
  { t0: Wd('f2', 'evangelhos', -0.1), t1: E('f2', 0.6), html: `<div class="big s">EVANGELHOS</div><div class="sub">Jesus acalma a tempestade</div>` },
  { t0: Wd('f3', 'rio', -0.2), t1: Wd('f3', 'Morto', -0.4), html: `<div class="big s">RIO JORDÃO</div><div class="sub">alimenta o lago</div>` },
  { t0: Wd('f3', 'Morto', -0.3), t1: E('f3', 0.6), html: `<div class="big">−430 m</div><div class="sub">Mar Morto</div><div class="sub" style="color:#ffb98f;font-size:32px;margin-top:8px">ponto mais baixo da Terra em terra firme</div>` },
  { t0: Wd('c1', 'Segue', -0.1), t1: TOTAL + 1, html: `<div class="big">PARTE 2</div><div class="sub">segue pra continuar</div>` },
];
const BAR = [
  { t: 0, chip: 'POR QUÊ?', ttl: 'Mar da Galileia' }, { t: S('f0', -0.1), chip: '3 FATOS', ttl: 'Mar da Galileia' }, { t: S('f1', -0.1), chip: '1 DE 3', ttl: 'O mais baixo' },
  { t: S('f2', -0.1), chip: '2 DE 3', ttl: 'Tempestades' }, { t: S('f3', -0.1), chip: '3 DE 3', ttl: 'Rio Jordão' }, { t: S('c1', -0.1), chip: 'PARTE 1', ttl: 'Mar da Galileia' },
];

// legenda palavra a palavra
const CHUNKS = []; {
  for (const l of TL.lines) {
    let cur = [];
    const flush = () => { if (cur.length) { CHUNKS.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; } };
    for (const w of l.words) {
      const txt = w.w.replace(/[,.:;]/g, '').toUpperCase(); const len = cur.reduce((a, x) => a + x.txt.length + 1, 0) + txt.length;
      if (cur.length && (len > 24 || cur.length >= 4)) flush();
      cur.push({ ...w, txt });
      if (/[,.:?]$/.test(w.w)) flush();
    }
    flush();
  }
}
const capEl = document.getElementById('cap'), cardEl = document.getElementById('card'), barChip = document.getElementById('chip'), barTtl = document.getElementById('ttl');
const flashEl = document.getElementById('flash'), stormEl = document.getElementById('storm'), footEl = document.getElementById('foot');
let capKey = '', cardKey = -1;

/* ------------------------------ quadro ------------------------------ */
function update(t) {
  const c = camState(t);
  const dN = c.d, bump = smooth((t - S('f1', 0.0)) / 1.0) * (1 - smooth((t - E('f1', 0.0)) / 1.2)), Ef = (EXAG + 15 * bump) * smooth((1.4 - dN) / 0.7);
  const st = stormAt(t);
  regMat.uniforms.uAlpha.value = smooth((7.5 - dN) / 4); locMat.uniforms.uAlpha.value = smooth((1.7 - dN) / 0.9);
  loc.material.uniforms.uExag.value = Ef;
  for (const m of [regMat, locMat]) { m.uniforms.uTime.value = t; m.uniforms.uStorm.value = st; m.uniforms.uBright.value = 1 - 0.16 * st; }
  const lm = smooth((dN - 1.5) / 3); globe.material.uniforms.uMix.value = lm; regMat.uniforms.uMix.value = lm; locMat.uniforms.uMix.value = lm;
  for (const m of [regMat, locMat]) m.uniforms.uHaze.value = smooth((1.8 - dN) / 1.2);
  cloudMat.opacity = 0.55 * (1 - smooth((dN - 7) / -4)) * 1; cloudMat.opacity = 0.5 * smooth((dN - 4) / 6);
  atmoMat.uniforms.uA.value = smooth((dN - 1.5) / 6) * 0.9 + 0.1 * smooth((dN - 0.3) / 1.5);
  const seaA = smooth((t - S('f1', 0.4)) / 0.9) * (1 - smooth((t - E('f1', 0.0)) / 0.8)); seaPlane.material.uniforms.uA.value = seaA;
  placeCamera(t, c, Ef); camera.updateMatrixWorld();
  renderer.render(scene, camera);

  // ----- SVG
  const P = (p, h) => proj(p.lat, p.lon, h ?? hOn(p.lat, p.lon), Ef);
  // anel "galil"
  const ringT = smooth((t - Wd('n3', 'Galileia', -0.1)) / 1.6) * (1 - smooth((t - E('n4', 0.1)) / 0.7));
  const ring = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; const lat = REGION_C.lat + Math.sin(a) * 0.30, lon = REGION_C.lon + Math.cos(a) * 0.30 / Math.cos(REGION_C.lat * DEG) * 0.95; ring.push(P({ lat, lon })); }
  drawPath(pRing, ring, ringT, false, clamp(ringT * 3) * (dN < 1.0 ? 1 : 0));
  // contorno do lago
  const lakeT = smooth((t - Wd('d1', 'verdade', -0.1)) / 1.2) * (1 - smooth((t - Wd('n3', 'Galileia', -0.3)) / 0.8));
  drawPath(pLake, lakePts.map(p => P(p, -210)), lakeT, true, clamp(lakeT * 3));
  // plano do nível do mar: borda + linha de cota
  const seaB = [[SEA.lat1, SEA.lon0], [SEA.lat1, SEA.lon1], [SEA.lat0, SEA.lon1], [SEA.lat0, SEA.lon0]].map(([lat, lon]) => P({ lat, lon }, 0)); pSeaBox.setAttribute('opacity', 0);
  if (seaA > 0.01) { const a = P({ lat: 32.84, lon: 35.585 }, 0), b = P({ lat: 32.84, lon: 35.585 }, -210); dimLine.setAttribute('x1', a.x); dimLine.setAttribute('y1', a.y); dimLine.setAttribute('x2', b.x); dimLine.setAttribute('y2', b.y); dimA.setAttribute('cx', a.x); dimA.setAttribute('cy', a.y); dimB.setAttribute('cx', b.x); dimB.setAttribute('cy', b.y); dimG.setAttribute('opacity', smooth((t - Wd('f1', '210', -0.4)) / 0.5) * seaA); } else dimG.setAttribute('opacity', 0);
  // Jordão
  const rT = smooth((t - Wd('f3', 'rio', 0.0)) / Math.max(Wd('f3', 'Morto', 0.2) - Wd('f3', 'rio', 0.0), 1));
  const rOp = 1 - smooth((t - E('f3', 0.3)) / 0.7);
  const rpts = jordan.map(p => P(p)); drawPath(pRoute, rpts, rT, false, rOp);
  if (rT > 0 && rOp > 0 && rpts.every(p => p.ok)) { const f = rT * (rpts.length - 1), i = Math.min(Math.floor(f), rpts.length - 2), u = f - i; head.setAttribute('cx', lerp(rpts[i].x, rpts[i + 1].x, u)); head.setAttribute('cy', lerp(rpts[i].y, rpts[i + 1].y, u)); head.setAttribute('opacity', rOp); } else head.setAttribute('opacity', 0);
  const dT = smooth((t - Wd('f3', 'Morto', -0.1)) / 0.8) * rOp;
  drawPath(pDead, deadPts.map(p => P(p)), dT, true, clamp(dT * 3));
  // distância real em linha reta
  if (dT > 0) { const a = P(lakeS), b = P(deadN); distLine.setAttribute('x1', a.x); distLine.setAttribute('y1', a.y); distLine.setAttribute('x2', b.x); distLine.setAttribute('y2', b.y); distG.setAttribute('opacity', dT * 0.9); } else distG.setAttribute('opacity', 0);

  // ----- rótulos
  for (const lb of LABELS) {
    const a = smooth((t - lb.t0) / 0.28) * (1 - smooth((t - lb.t1) / 0.3));
    if (a <= 0.01) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    const p = proj(lb.lat, lb.lon, lb.h ?? hOn(lb.lat, lb.lon), Ef);
    if (!p.ok) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    lb.el.style.opacity = a; lb.el.style.left = p.x + 'px'; lb.el.style.top = (p.y + (lb.dy ?? -20)) + 'px'; lb.el.style.transform = `translate(-50%,-100%) scale(${0.85 + 0.15 * a})`;
    if (lb.dotEl) { lb.dotEl.style.opacity = a; lb.dotEl.style.left = p.x + 'px'; lb.dotEl.style.top = p.y + 'px'; }
  }
  // chips fixos de distância
  // (rótulo dinâmico "≈ N km")
  let dl = document.getElementById('distLab');
  if (!dl) { dl = document.createElement('div'); dl.id = 'distLab'; dl.className = 'lab sm dk'; dl.textContent = `≈ ${DIST_KM} km em linha reta`; labelsEl.appendChild(dl); }
  if (dT > 0.02) { const a = P(lakeS), b = P(deadN); dl.style.opacity = dT; dl.style.left = ((a.x + b.x) / 2 + 190) + 'px'; dl.style.top = ((a.y + b.y) / 2) + 'px'; dl.style.transform = 'translate(-50%,-50%)'; } else dl.style.opacity = 0;

  // ----- legenda
  const ch = CHUNKS.find(x => t >= x.t0 - 0.05 && t <= x.t1 + 0.18);
  if (ch) {
    const cur = ch.words.findIndex(w => t >= w.t0 && t < w.t1 + 0.0); const idx = cur < 0 ? (t >= ch.words[ch.words.length - 1].t1 ? ch.words.length - 1 : 0) : cur;
    const key = CHUNKS.indexOf(ch) + ':' + idx;
    if (key !== capKey) { capEl.innerHTML = ch.words.map((w, i) => `<span class="w${i === idx ? ' on' : ''}">${w.txt}</span>`).join(' '); capKey = key; }
  } else if (capKey) { capEl.innerHTML = ''; capKey = ''; }

  // ----- cartão
  const ci = CARDS.findIndex(x => t >= x.t0 && t < x.t1);
  if (ci >= 0) { if (ci !== cardKey) { cardEl.innerHTML = CARDS[ci].html; cardKey = ci; }
    const cd = CARDS[ci], a = smooth((t - cd.t0) / 0.3) * (1 - smooth((t - (cd.t1 - 0.25)) / 0.25));
    cardEl.style.opacity = a; cardEl.style.transform = `translateY(${(1 - a) * 40}px)`; } else { cardEl.style.opacity = 0; cardKey = -1; }

  // ----- barra superior, rodapé, tempestade
  let b = BAR[0]; for (const x of BAR) if (t >= x.t) b = x;
  if (barChip.textContent !== b.chip) { barChip.textContent = b.chip; barTtl.textContent = b.ttl; }
  const loc_ = locMat.uniforms.uAlpha.value > 0.5 && t < S('c1', 1.0);
  footEl.textContent = 'Relevo exagerado ' + Math.round(Ef) + '×'; footEl.style.opacity = loc_ ? 1 : 0;
  stormEl.style.opacity = 0.22 * st;
  const fl = [Wd('f2', 'violentas', 0.0), Wd('f2', 'violentas', 1.6)].map(x => Math.exp(-Math.pow((t - x) / 0.07, 2)) * 0.7 + Math.exp(-Math.pow((t - x - 0.22) / 0.10, 2)) * 0.35);
  flashEl.style.opacity = st > 0.3 ? Math.max(...fl) : 0;
}

window.__TOTAL = TOTAL; window.__DIST = DIST_KM;
window.renderFrame = async t => { update(t); await new Promise(r => requestAnimationFrame(() => r())); return true; };
window.__ready = true;
update(0);
