import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Mar da Galileia 3D — globo -> Levante -> relevo real (DEM) do vale
 * do Jordão. Unidade 1 = 1000 km. Tudo é função pura de t (segundos),
 * então o render offline (Playwright) é determinístico.
 * ------------------------------------------------------------------ */
const W = 1080, H = 1920, R = 6.371, DEG = Math.PI / 180;
const LIFT = 0.0045;             // base (4,5 km) do remendo local, p/ o relevo exagerado não afundar
const EXAG = 4;                  // exagero vertical base do relevo local (sobe p/ 16× no fato 1)
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
const patchVS = `attribute vec3 aDir; attribute float aH; uniform float uR,uExag,uLift,uFeather; varying vec2 vUv; varying float vEdge,vDist,vH; varying vec3 vDir,vP;
  void main(){ vUv=uv; vDir=aDir; float e=smoothstep(0.,uFeather,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y))); vEdge=e; vH=aH;
    vec3 p=aDir*(uR+uLift+aH*1e-6*uExag*e); vP=p; vDist=distance(p,cameraPosition); gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`;
const patchFS = `uniform sampler2D uMap,uMask,uDet,uDetMask; uniform vec4 uDetRect; uniform float uDetOn; uniform float uCamD,uAlpha,uTime,uStorm,uBright,uHaze,uWater,uMix,uFeatherA,uExag; uniform vec3 uSun; varying vec3 vP; varying vec2 vUv; varying float vEdge,vDist,vH; varying vec3 vDir;
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
    { vec3 n=normalize(cross(dFdx(vP),dFdy(vP))); if(dot(n,vDir)<0.) n=-n; float sh=1.+1.5*(dot(n,uSun)-dot(normalize(vDir),uSun)); c*=mix(1.,clamp(sh,.55,1.45),clamp(uExag/3.,0.,1.)); }
    c*=uBright*mix(1.,0.62+0.5*clamp(dot(normalize(vDir),normalize(vec3(-.45,.35,1.))),0.,1.),uMix);
    float hz=smoothstep(0.95*uCamD,1.75*uCamD,vDist)*uHaze; c=mix(c,vec3(.015,.03,.06),hz*.96);
    float ea=smoothstep(0.,uFeatherA,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y))); gl_FragColor=vec4(c,uAlpha*ea); }`;
function patchMat(map, mask, o) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: true, vertexShader: patchVS, fragmentShader: patchFS,
    uniforms: { uMap: { value: map }, uMask: { value: mask }, uR: { value: R }, uExag: { value: 0 }, uLift: { value: o.lift }, uFeather: { value: o.feather }, uFeatherA: { value: o.featherA }, uAlpha: { value: 0 }, uTime: { value: 0 }, uStorm: { value: 0 }, uBright: { value: 1 }, uHaze: { value: 1 }, uCamD: { value: 1 }, uMix: { value: 1 }, uWater: { value: o.water ? 1 : 0 }, uDet: { value: o.det || blackTex }, uDetMask: { value: o.detMask || blackTex }, uDetRect: { value: DRECT }, uDetOn: { value: o.det ? 1 : 0 }, uSun: { value: SUN } } });
}
const SUN = (() => { const la = 32.5 * DEG, lo = 35.5 * DEG, up = new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)), east = new THREE.Vector3(Math.cos(lo), 0, -Math.sin(lo)), north = new THREE.Vector3().crossVectors(up, east).normalize(); return up.multiplyScalar(0.55).addScaledVector(east, -0.55).addScaledVector(north, 0.6).normalize(); })();
const regMat = patchMat(tReg, blackTex, { lift: 0.0003, feather: 0.02, featherA: 0.03 });
const reg = new THREE.Mesh(patchGeometry(REG.lon0, REG.lon1, REG.lat0, REG.lat1, 250, 190), regMat); reg.renderOrder = 2; scene.add(reg);
const locMat = patchMat(tLoc, tMask, { lift: LIFT, feather: 0.035, featherA: 0.05, water: true, det: tDet, detMask: tDetMask });
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
const WW = (id, k) => L[id].words[k].t0;
const K = [
  { t: 0, lat: 32.2, lon: 35.2, d: 1.6, tilt: 20, head: 0, shift: 60 },
  { t: Wd('h1', 'peixes', 0.1), lat: 32.80, lon: 35.56, d: 0.24, tilt: 42, head: -6, shift: 0 },
  { t: Wd('h1', 'corre', 0.0), lat: 32.40, lon: 35.56, d: 0.24, tilt: 42, head: 0, shift: 0 },
  { t: Wd('h1', 'vive', -0.3), lat: 31.62, lon: 35.50, d: 0.22, tilt: 44, head: 6, shift: 0 },
  { t: S('d1', 0.1), lat: 32.82, lon: 35.60, d: 0.17, tilt: 46, head: 8, shift: 0, hop: 0.2 },
  { t: E('d1'), lat: 32.80, lon: 35.585, d: 0.125, tilt: 50, head: 14, shift: 0 },
  { t: Wd('d2', 'Jordão', 0.0), lat: 32.65, lon: 35.57, d: 0.16, tilt: 52, head: 6, shift: 0 },
  { t: Wd('d2', 'Morto', -0.5), lat: 32.15, lon: 35.56, d: 0.22, tilt: 44, head: 0, shift: 0 },
  { t: E('d2', 0.1), lat: 31.60, lon: 35.50, d: 0.20, tilt: 44, head: 0, shift: 0 },
  { t: E('s1'), lat: 31.50, lon: 35.48, d: 0.18, tilt: 44, head: 8, shift: 0 },
  { t: E('s2'), lat: 31.50, lon: 35.49, d: 0.17, tilt: 42, head: 0, shift: 0 },
  { t: E('s3'), lat: 31.50, lon: 35.48, d: 0.21, tilt: 40, head: -6, shift: 0 },
  { t: TOTAL - 0.8, lat: 32.0, lon: 35.2, d: 1.8, tilt: 14, head: 0, shift: 60 },
  { t: TOTAL, lat: 31.5, lon: 33, d: 4, tilt: 6, head: 0, shift: 120 },
];
const KF = ['lat', 'lon', 'tilt', 'head', 'shift'], KTS = K.map(k => k.t), KLD = K.map(k => Math.log(k.d));
function monoTan(ts, vs) { const n = ts.length, h = [], s = [], m = new Array(n).fill(0); for (let i = 0; i < n - 1; i++) { h[i] = Math.max(ts[i + 1] - ts[i], 1e-6); s[i] = (vs[i + 1] - vs[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / s[i - 1] + (h[i] + 2 * h[i - 1]) / s[i]); return m; }
const KTAN = Object.fromEntries([...KF.map(f => [f, monoTan(KTS, K.map(k => k[f]))]), ['ld', monoTan(KTS, KLD)]]);
const herm = (v0, v1, m0, m1, h, u) => (2 * u ** 3 - 3 * u ** 2 + 1) * v0 + (u ** 3 - 2 * u ** 2 + u) * h * m0 + (-2 * u ** 3 + 3 * u ** 2) * v1 + (u ** 3 - u ** 2) * h * m1;
function camState(t) { let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1], h = Math.max(b.t - a.t, 1e-6), u = clamp((t - a.t) / h), o = {};
  for (const f of KF) o[f] = herm(a[f], b[f], KTAN[f][i], KTAN[f][i + 1], h, u);
  o.d = Math.exp(herm(KLD[i], KLD[i + 1], KTAN.ld[i], KTAN.ld[i + 1], h, u) + (b.hop || 0) * Math.sin(Math.PI * u)); return o; }
function placeCamera(t, c, E_) {
  const tgtH = hAt(c.lat, c.lon) * 1e-6 * E_;
  const P = ll2v(c.lat, c.lon, R + (E_ > 0 ? LIFT + Math.max(tgtH, -0.002) : 0.0003));
  const up = P.clone().normalize(), east = new THREE.Vector3(Math.cos(c.lon * DEG), 0, -Math.sin(c.lon * DEG));
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  const head = (c.head + Math.sin(t * 0.8) * 0.5) * DEG, tilt = c.tilt * DEG;
  const Ldir = north.clone().multiplyScalar(Math.cos(head)).add(east.clone().multiplyScalar(Math.sin(head)));
  camera.position.copy(P).addScaledVector(up, c.d * Math.cos(tilt)).addScaledVector(Ldir, -c.d * Math.sin(tilt));
  camera.up.copy(Ldir); camera.lookAt(P);
  camera.near = Math.max(0.0015, c.d * 0.03); camera.far = Math.max(c.d + 15, 62); camera.updateProjectionMatrix();
  camera.setViewOffset(W, H, 0, -c.shift, W, H);
}
const _v = new THREE.Vector3();
function proj(lat, lon, hM, E_) {
  const p = ll2v(lat, lon, R + (E_ > 0 ? LIFT + hM * 1e-6 * E_ : 0.0003));
  const front = _v.copy(camera.position).sub(p).dot(p) > 0; const q = p.clone().project(camera);
  return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H, ok: front && q.z < 1 && q.z > -1 };
}
const hOn = (lat, lon) => hAt(lat, lon);

/* ------------------------------ sobreposições ------------------------------ */
const svg = document.getElementById('ov'), labelsEl = document.getElementById('labels'), NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
const defs = mk('defs', {}); const glow = mk('filter', { id: 'glow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs); mk('feGaussianBlur', { stdDeviation: 7, result: 'b' }, glow);
const fm = mk('feMerge', {}, glow); mk('feMergeNode', { in: 'b' }, fm); mk('feMergeNode', { in: 'SourceGraphic' }, fm);
const mkPath = (color, w, fill = 'none') => mk('path', { fill, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, filter: 'url(#glow)', opacity: 0 });
const pLake = mkPath('#7fe3ff', 7, 'rgba(90,200,255,0.18)'), pDead = mkPath('#ff9d6b', 7, 'rgba(255,255,255,0.0)'), pRoute = mkPath('#ffcf4a', 10);
const head = mk('circle', { r: 15, fill: '#fff', stroke: '#ffcf4a', 'stroke-width': 7, opacity: 0, filter: 'url(#glow)' });
function pathFrom(pts, close) { return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('') + (close ? 'Z' : ''); }
function drawPath(el, pts, progress, close, alphaMul = 1) {
  if (!pts.length || progress <= 0 || pts.some(p => !p.ok)) { el.setAttribute('opacity', 0); return; }
  el.setAttribute('d', pathFrom(pts, close)); el.setAttribute('stroke-dasharray', `${progress.toFixed(4)} 1.01`); el.setAttribute('opacity', alphaMul);
}
const lakePts = geo.galilee.map(([lon, lat]) => ({ lat, lon })), deadPts = geo.deadsea.map(([lon, lat]) => ({ lat, lon }));
const lakeS = lakePts.reduce((a, p) => p.lat < a.lat ? p : a);
const jordan = [lakeS, ...geo.jordan.map(([lat, lon]) => ({ lat, lon })).filter(p => p.lat < lakeS.lat - 0.01)];
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon) c = !c; } return c; };
let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const bbox = pts => ({ la0: Math.min(...pts.map(p => p.lat)), la1: Math.max(...pts.map(p => p.lat)), lo0: Math.min(...pts.map(p => p.lon)), lo1: Math.max(...pts.map(p => p.lon)) });
function samplePoly(poly, n) { const b = bbox(poly), out = []; let g = 0; while (out.length < n && g++ < 20000) { const p = { lat: lerp(b.la0, b.la1, rnd()), lon: lerp(b.lo0, b.lo1, rnd()) }; if (inPoly(p, poly)) out.push({ ...p, ph: rnd(), sp: 0.5 + rnd() }); } return out; }

// peixes no lago (nadam em círculos pequenos), todos desenhados em SVG
const FISH_D = 'M-22 0 C-12 -13 8 -13 18 0 C8 13 -12 13 -22 0 Z M16 0 L30 -11 L30 11 Z';
const fishPts = samplePoly(lakePts, 9).map((p, i) => ({ ...p, g: mk('g', { opacity: 0 }) }));
for (const f of fishPts) { mk('path', { d: FISH_D, fill: '#ffd36a', stroke: '#fff', 'stroke-width': 2.5 }, f.g); mk('circle', { cx: -12, cy: -3, r: 2.6, fill: '#0d1424' }, f.g); }
const saltPts = samplePoly(deadPts, 70);
const saltG = mk('g', {}); for (const p of saltPts) p.el = mk('circle', { r: 5, fill: '#fff', opacity: 0 }, saltG);
const wispPts = samplePoly(deadPts, 26); const wispG = mk('g', {}); for (const p of wispPts) p.el = mk('circle', { r: 9, fill: 'rgba(235,245,255,.9)', opacity: 0, filter: 'url(#glow)' }, wispG);
// fluxo: pontinhos que correm pelo rio quando já desenhado
const flowDots = Array.from({ length: 6 }, () => mk('circle', { r: 8, fill: '#fff', opacity: 0 }));
// peixe com X sobre o Mar Morto
const xG = mk('g', { opacity: 0 }); const xf = mk('g', { transform: 'scale(2.6)' }, xG);
mk('path', { d: FISH_D, fill: '#ffd36a', stroke: '#fff', 'stroke-width': 2.5 }, xf); mk('circle', { cx: -12, cy: -3, r: 2.6, fill: '#0d1424' }, xf);
mk('path', { d: 'M-70 -70 L70 70 M70 -70 L-70 70', stroke: '#ff4b4b', 'stroke-width': 18, 'stroke-linecap': 'round' }, xG);

const LABELS = [];
function addLabel(o) { const el = document.createElement('div'); el.className = 'lab ' + (o.cls || ''); el.textContent = o.text; labelsEl.appendChild(el);
  const dot = o.dot === false ? null : Object.assign(document.createElement('div'), { className: 'dot' }); if (dot) labelsEl.appendChild(dot); LABELS.push({ ...o, el, dotEl: dot }); }
addLabel({ text: 'MAR DA GALILEIA', lat: 32.86, lon: 35.60, t0: Wd('h1', 'peixes', 0.0), t1: Wd('d1', 'doce', 1.4), dy: -40 });
addLabel({ text: 'MAR MORTO', cls: 'dk', lat: 31.52, lon: 35.47, t0: Wd('h1', 'mar', 0.9), t1: S('d1', 0.0), dy: -30 });
addLabel({ text: 'RIO JORDÃO', lat: 32.35, lon: 35.56, t0: Wd('d2', 'Jordão', 0.0), t1: Wd('d2', 'Morto', 0.3), dy: -14 });
addLabel({ text: 'MAR MORTO', cls: 'dk', lat: 31.52, lon: 35.47, t0: Wd('d2', 'Morto', 0.0), t1: E('s1', 0.4), dy: -110 });
addLabel({ text: 'EVAPORA', cls: 'sm', lat: 31.60, lon: 35.50, t0: Wd('s2', 'evapora', -0.1), t1: Wd('s2', 'sal', -0.2), dy: -70, dot: false });
addLabel({ text: 'SAL', cls: 'dk', lat: 31.40, lon: 35.46, t0: Wd('s2', 'sal', -0.1), t1: E('s2', 0.6), dy: -30 });

const FISH_SVG = `<svg width="190" height="110" viewBox="-40 -25 80 50" style="display:block;margin:0 auto 6px"><path d="${FISH_D}" fill="#ffd36a" stroke="#fff" stroke-width="1.6"/><circle cx="-12" cy="-3" r="2.6" fill="#0d1424"/></svg>`;
const DEADFISH = `<svg width="190" height="130" viewBox="-60 -40 120 80" style="display:block;margin:0 auto 6px"><g transform="scale(1.4)"><path d="${FISH_D}" fill="#ffd36a" stroke="#fff" stroke-width="1.6"/><circle cx="-12" cy="-3" r="2.6" fill="#0d1424"/></g><path d="M-45 -32 L45 32 M45 -32 L-45 32" stroke="#ff4b4b" stroke-width="9" stroke-linecap="round"/></svg>`;
const CARDS = [
  { t0: Wd('d1', 'doce', -0.2), t1: E('d1', 0.3), html: FISH_SVG + `<div class="big s">ÁGUA DOCE</div><div class="sub">cheia de peixes</div>` },
  { t0: Wd('d2', 'Jordão', -0.2), t1: E('d2', 0.2), html: `<div class="big s">RIO JORDÃO</div><div class="sub">do lago ao Mar Morto</div>` },
  { t0: Wd('s1', 'saída', -0.3), t1: E('s1', 0.4), html: `<div class="big s">SEM SAÍDA</div><div class="sub">a água entra e não sai</div>` },
  { t0: Wd('s2', 'evapora', -0.1), t1: E('s2', 0.5), html: `<div class="big s">SÓ EVAPORA</div><div class="sub">o sal fica para trás</div>` },
  { t0: Wd('s3', 'nenhum', -0.5), t1: E('s3', 0.4), html: DEADFISH + `<div class="big s">SEM PEIXES</div>` },
  { t0: Wd('c1', 'nome', -0.1), t1: TOTAL + 1, html: `<div class="big s">MAR MORTO</div><div class="sub">sal demais para qualquer peixe</div>` },
];
const BAR = [
  { t: 0, chip: 'PEIXE?', ttl: 'Galileia × Mar Morto' }, { t: S('d1', -0.1), chip: 'O LAGO', ttl: 'Água doce' }, { t: S('d2', -0.1), chip: 'O RIO', ttl: 'Jordão' },
  { t: S('s1', -0.1), chip: 'O SAL', ttl: 'Mar Morto' }, { t: S('s3', -0.1), chip: 'O RESULTADO', ttl: 'Sem peixes' }, { t: S('c1', -0.1), chip: 'POR ISSO', ttl: 'Mar Morto' },
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
const footEl = document.getElementById('foot');
let capKey = '', cardKey = -1;
const BEATS = [S('d1', 0.1), Wd('d2', 'Jordão', 0), Wd('s1', 'saída', 0), Wd('s2', 'evapora', 0), Wd('s3', 'nenhum', 0)];

/* ------------------------------ quadro ------------------------------ */
function update(t) {
  const c = camState(t); { let k = 1; for (const b of BEATS) if (t >= b && t - b < 1.2) k = Math.min(k, 1 - 0.07 * Math.exp(-(t - b) / 0.22)); c.d *= k; }
  const dN = c.d, bump = 0, Ef = (EXAG + 5 * bump) * smooth((1.4 - dN) / 0.7);
  regMat.uniforms.uAlpha.value = smooth((7.5 - dN) / 4); locMat.uniforms.uAlpha.value = smooth((1.7 - dN) / 0.9);
  locMat.uniforms.uExag.value = Ef;
  for (const m of [regMat, locMat]) { m.uniforms.uTime.value = t; m.uniforms.uStorm.value = 0; m.uniforms.uBright.value = 1; }
  const lm = smooth((dN - 1.5) / 3); globe.material.uniforms.uMix.value = lm; regMat.uniforms.uMix.value = lm; locMat.uniforms.uMix.value = lm;
  for (const m of [regMat, locMat]) { m.uniforms.uHaze.value = smooth((1.2 - dN) / 0.5); m.uniforms.uCamD.value = dN; }
  cloudMat.opacity = 0.5 * smooth((dN - 4) / 6);
  atmoMat.uniforms.uA.value = smooth((dN - 1.5) / 6) * 0.9 + 0.1 * smooth((dN - 0.3) / 1.5);
  seaPlane.material.uniforms.uA.value = 0;
  placeCamera(t, c, Ef); camera.updateMatrixWorld();
  renderer.render(scene, camera);
  const P = (p, h) => proj(p.lat, p.lon, h ?? hOn(p.lat, p.lon), Ef);

  // contorno do lago (aparece com "peixes") e do Mar Morto (com "mar sem peixe")
  const lakeT = smooth((t - Wd('h1', 'peixes', -0.2)) / 1.0) * (1 - smooth((t - E('d2', 0.3)) / 0.8));
  drawPath(pLake, lakePts.map(p => P(p, -210)), lakeT, true, clamp(lakeT * 3));
  const dT = smooth((t - Wd('h1', 'mar', 0.6)) / 0.9);
  const milk = smooth((t - Wd('s2', 'sal', -0.2)) / 1.2);
  pDead.setAttribute('fill', `rgba(255,255,255,${(0.34 * milk).toFixed(3)})`);
  drawPath(pDead, deadPts.map(p => P(p, -430)), dT, true, clamp(dT * 3));
  // peixes no lago
  const fishA = smooth((t - Wd('h1', 'peixes', 0.0)) / 0.5) * (1 - smooth((t - E('d1', 0.6)) / 0.5)) ;
  for (const f of fishPts) { const a = f.ph * 6.28 + t * f.sp * 0.9, la = f.lat + Math.sin(a) * 0.012, lo = f.lon + Math.cos(a) * 0.014;
    const p = P({ lat: la, lon: lo }, -210), q = P({ lat: f.lat + Math.sin(a + 0.1) * 0.012, lon: f.lon + Math.cos(a + 0.1) * 0.014 }, -210);
    const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 180, sc = clamp(0.9 * (0.35 / Math.max(dN, 0.12)) ** 0.5, 0.5, 1.5);
    f.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${sc.toFixed(2)})`); f.g.setAttribute('opacity', p.ok ? clamp(fishA) : 0); }
  // Jordão
  const rT = smooth((t - Wd('d2', 'Jordão', -0.3)) / Math.max(Wd('d2', 'Morto', -0.2) - Wd('d2', 'Jordão', -0.3), 1));
  const rOp = 1 - smooth((t - E('s1', 0.3)) / 0.7);
  const rpts = jordan.map(p => P(p)); drawPath(pRoute, rpts, rT, false, rOp);
  if (rT > 0 && rOp > 0 && rpts.every(p => p.ok)) { const f = rT * (rpts.length - 1), i = Math.min(Math.floor(f), rpts.length - 2), u = f - i; head.setAttribute('cx', lerp(rpts[i].x, rpts[i + 1].x, u)); head.setAttribute('cy', lerp(rpts[i].y, rpts[i + 1].y, u)); head.setAttribute('opacity', rOp * (rT < 0.999 ? 1 : 0)); } else head.setAttribute('opacity', 0);
  // água entra (s1): pontos correm pelo rio até o Mar Morto
  const inA = smooth((t - Wd('s1', 'entra', -0.2)) / 0.4) * (1 - smooth((t - E('s1', 0.3)) / 0.5));
  flowDots.forEach((d, i) => { const u = ((t * 0.55 + i / flowDots.length) % 1), f = u * (rpts.length - 1), k = Math.min(Math.floor(f), rpts.length - 2), w = f - k;
    if (inA > 0.01 && rpts.every(p => p.ok)) { d.setAttribute('cx', lerp(rpts[k].x, rpts[k + 1].x, w)); d.setAttribute('cy', lerp(rpts[k].y, rpts[k + 1].y, w)); d.setAttribute('opacity', inA); } else d.setAttribute('opacity', 0); });
  // evaporação + sal
  const evA = smooth((t - Wd('s2', 'evapora', -0.3)) / 0.5) * (1 - smooth((t - E('s2', 0.5)) / 0.6));
  wispPts.forEach(p => { const q = P(p, -430), ph = (t * 0.45 * p.sp + p.ph) % 1; p.el.setAttribute('cx', q.x); p.el.setAttribute('cy', q.y - ph * 150); p.el.setAttribute('r', 8 + ph * 10); p.el.setAttribute('opacity', q.ok ? evA * Math.sin(Math.PI * ph) * 0.8 : 0); });
  const saltA = smooth((t - Wd('s2', 'sal', -0.3)) / 0.6) * (1 - smooth((t - E('s3', 0.2)) / 0.6));
  saltPts.forEach((p, i) => { const q = P(p, -430), tw = 0.55 + 0.45 * Math.sin(t * 5 * p.sp + p.ph * 20), on = clamp((t - Wd('s2', 'sal', -0.2) - i * 0.03) / 0.3); p.el.setAttribute('cx', q.x); p.el.setAttribute('cy', q.y); p.el.setAttribute('opacity', q.ok ? saltA * tw * on : 0); });
  // peixe riscado sobre o Mar Morto
  const xA = smooth((t - Wd('h1', 'vive', -0.15)) / 0.3) * (1 - smooth((t - S('d1', 0.0)) / 0.3)) + smooth((t - Wd('s3', 'nenhum', 0.2)) / 0.3) * (1 - smooth((t - E('s3', 0.2)) / 0.4));
  { const q = P({ lat: 31.52, lon: 35.47 }, -430); xG.setAttribute('transform', `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)}) scale(${(0.9 + 0.1 * Math.sin(t * 6)).toFixed(3)})`); xG.setAttribute('opacity', q.ok ? clamp(xA) : 0); }

  // rótulos
  for (const lb of LABELS) {
    const a = smooth((t - lb.t0) / 0.28) * (1 - smooth((t - lb.t1) / 0.3));
    if (a <= 0.01) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    const p = proj(lb.lat, lb.lon, lb.h ?? hOn(lb.lat, lb.lon), Ef);
    if (!p.ok) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    lb.el.style.opacity = a; lb.el.style.left = p.x + 'px'; lb.el.style.top = (p.y + (lb.dy ?? -20)) + 'px'; lb.el.style.transform = `translate(-50%,-100%) scale(${0.85 + 0.15 * a})`;
    if (lb.dotEl) { lb.dotEl.style.opacity = a; lb.dotEl.style.left = p.x + 'px'; lb.dotEl.style.top = p.y + 'px'; }
  }
  // legenda
  const ch = CHUNKS.find(x => t >= x.t0 - 0.05 && t <= x.t1 + 0.18);
  if (ch) {
    const cur = ch.words.findIndex(w => t >= w.t0 && t < w.t1); const idx = cur < 0 ? (t >= ch.words[ch.words.length - 1].t1 ? ch.words.length - 1 : 0) : cur;
    const key = CHUNKS.indexOf(ch) + ':' + idx;
    if (key !== capKey) { capEl.innerHTML = ch.words.map((w, i) => `<span class="w${i === idx ? ' on' : ''}">${w.txt}</span>`).join(' '); capKey = key; }
  } else if (capKey) { capEl.innerHTML = ''; capKey = ''; }
  // cartão
  const ci = CARDS.findIndex(x => t >= x.t0 && t < x.t1);
  if (ci >= 0) { if (ci !== cardKey) { cardEl.innerHTML = CARDS[ci].html; cardKey = ci; }
    const cd = CARDS[ci], a = smooth((t - cd.t0) / 0.3) * (1 - smooth((t - (cd.t1 - 0.25)) / 0.25));
    cardEl.style.opacity = a; cardEl.style.transform = `translateY(${(1 - a) * 40}px)`; } else { cardEl.style.opacity = 0; cardKey = -1; }
  // barra e rodapé
  let b = BAR[0]; for (const x of BAR) if (t >= x.t) b = x;
  if (barChip.textContent !== b.chip) { barChip.textContent = b.chip; barTtl.textContent = b.ttl; }
  const onLoc = locMat.uniforms.uAlpha.value > 0.5 && t < S('c1', 0.5);
  footEl.textContent = 'Relevo exagerado ' + Math.round(Ef) + '× · SRTM e Sentinel-2'; footEl.style.opacity = onLoc ? 1 : 0;
}
window.__TOTAL = TOTAL;
window.renderFrame = async t => { update(t); await new Promise(r => requestAnimationFrame(() => r())); return true; };
window.__ready = true;
update(0);
