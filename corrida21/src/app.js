import * as THREE from 'three';

/* Percurso da 11ª Resgatando Vidas na Corrida — mapa 3D visto de cima (zoom dinâmico).
 * Ruas, prédios, parques e pontos de referência reais (Overture Maps / OpenStreetMap). Tudo é função pura de t. */
const W = 1080, H = 1920, DEG = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const fract = x => x - Math.floor(x);

const [TL, RT, DET, CITY, DEMJ] = await Promise.all(['/out/timeline.json', '/data/route21.json', '/data/detail21.json', '/data/city.json', '/data/dem.json'].map(u => fetch(u).then(r => r.json())));
const DEMF = new Float32Array(await fetch('/data/dem.bin').then(r => r.arrayBuffer())); for (let i = 0; i < DEMF.length; i++) DEMF[i] = Math.min(DEMF[i], 1150);
const EXAG = 3, H0 = 900, DN = DEMJ.n, DHALF = DEMJ.half, DSTEP = DEMJ.step;
function demRaw(x, z) { const gx = clamp((x + DHALF) / DSTEP, 0, DN - 1.001), gy = clamp((-z + DHALF) / DSTEP, 0, DN - 1.001), i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j;
  return lerp(lerp(DEMF[j * DN + i], DEMF[j * DN + i + 1], u), lerp(DEMF[(j + 1) * DN + i], DEMF[(j + 1) * DN + i + 1], u), v); }
const demH = (x, z) => (demRaw(x, z) - H0) * EXAG;
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const L = Object.fromEntries(TL.lines.map(l => [l.id, l]));
const S = (id, dt = 0) => L[id].start + dt, E = (id, dt = 0) => L[id].end + dt;
const Wd = (id, w, dt = 0) => { const k = L[id].words.find(x => norm(x.w) === norm(w)) || L[id].words.find(x => norm(x.w).startsWith(norm(w))); if (!k) throw new Error('palavra? ' + id + ' ' + w); return k.t0 + dt; };
const TOTAL = TL.total;

/* ------------------------------ geometria base ------------------------------ */
const O = RT.origin, KX = 111320 * Math.cos(25.108 * DEG), KY = 110574;
const ll = c => [(c[0] - O[0]) * KX, (c[1] - O[1]) * KY];            // lon/lat -> metros (x leste, y norte)
const route = RT.route.map(ll);
const rs = [0]; for (let i = 1; i < route.length; i++) rs.push(rs[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
const LTOT = rs[rs.length - 1], L1 = RT.L[0], L3 = 0;
function atS(s) { s = clamp(s, 0, LTOT); let lo = 0, hi = rs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rs[m] <= s) lo = m; else hi = m; } const u = (s - rs[lo]) / Math.max(rs[hi] - rs[lo], 1e-6); return [lerp(route[lo][0], route[hi][0], u), lerp(route[lo][1], route[hi][1], u)]; }
function headAt(s) { const a = atS(s - 12), b = atS(s + 45); return Math.atan2(b[0] - a[0], b[1] - a[1]) / DEG; } // 0 = norte, 90 = leste
const nearest = p => { let best = 0, bd = 1e12; for (let i = 0; i < route.length; i++) { const d = (route[i][0] - p[0]) ** 2 + (route[i][1] - p[1]) ** 2; if (d < bd) { bd = d; best = rs[i]; } } return { s: best, d: Math.sqrt(bd) }; };

/* ------------------------------ cena ------------------------------ */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1.5); renderer.setSize(W, H, false); renderer.setClearColor(0xe6ecf2, 1);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xe9eef3, 1e9, 2e9);
const camera = new THREE.PerspectiveCamera(42, W / H, 1, 1e6);
const HAZE = new THREE.Color(0xe9eef3);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d0c2, 2.5));
const sunL = new THREE.DirectionalLight(0xfff0d8, 1.7); sunL.position.set(-0.7, 0.85, 0.55); scene.add(sunL);

const demTex = new THREE.DataTexture(DEMF, DN, DN, THREE.RedFormat, THREE.FloatType); demTex.minFilter = demTex.magFilter = THREE.NearestFilter; demTex.needsUpdate = true;
const UNI = { uDem: { value: demTex }, uDemN: { value: DN }, uHalf: { value: DHALF }, uStep: { value: DSTEP }, uH0: { value: H0 }, uExag: { value: EXAG }, uS: { value: 1 }, uFogC: { value: HAZE }, uFogN: { value: 1e9 }, uFogF: { value: 2e9 }, uTime: { value: 0 }, uSwitch: { value: L1 + L3 * 0.5 } };
const DEMGLSL = `uniform sampler2D uDem; uniform float uDemN,uHalf,uStep,uH0,uExag;
  float demH(vec2 xz){ vec2 g=clamp((vec2(xz.x,-xz.y)+uHalf)/uStep,vec2(0.),vec2(uDemN-1.001)); ivec2 i=ivec2(floor(g)); vec2 f=fract(g);
    float a=texelFetch(uDem,i,0).r,b=texelFetch(uDem,i+ivec2(1,0),0).r,c=texelFetch(uDem,i+ivec2(0,1),0).r,d=texelFetch(uDem,i+ivec2(1,1),0).r; return (mix(mix(a,b,f.x),mix(c,d,f.x),f.y)-uH0)*uExag; }
  float shadeAt(vec2 xz){ float h0=demH(xz),hx=demH(xz+vec2(40.,0.)),hz=demH(xz+vec2(0.,40.)); vec3 n=normalize(vec3(-(hx-h0)/40.,1.,-(hz-h0)/40.)); return .56+.62*max(dot(n,normalize(vec3(-.6,.72,-.45))),0.); }`;
const FOGGLSL = `varying float vD; uniform vec3 uFogC; uniform float uFogN,uFogF;
  vec3 fogMix(vec3 c){ return mix(c,uFogC,smoothstep(uFogN,uFogF,vD)); }`;
const flatMat = (hex, shade = 1) => new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, side: THREE.DoubleSide, uniforms: { ...UNI, uColor: { value: new THREE.Color(hex) }, uShade: { value: shade } },
  vertexShader: DEMGLSL + 'varying float vD; varying vec2 vXZ; void main(){ vec4 w=modelMatrix*vec4(position,1.); w.y+=demH(w.xz); vXZ=w.xz; vD=distance(w.xyz,cameraPosition); gl_Position=projectionMatrix*viewMatrix*w; }',
  fragmentShader: DEMGLSL + FOGGLSL + 'varying vec2 vXZ; uniform vec3 uColor; uniform float uShade; void main(){ vec3 c=uColor*mix(1.,shadeAt(vXZ),uShade); gl_FragColor=linearToOutputTexel(vec4(fogMix(c),1.)); }' });
const addMesh = (g, m, order) => { const x = new THREE.Mesh(g, m); x.renderOrder = order; x.frustumCulled = false; scene.add(x); return x; };

// céu e chão
{ const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*mat4(mat3(modelViewMatrix))*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h=clamp(vP.y,0.,1.); vec3 c=mix(vec3(.91,.93,.95),vec3(.55,.74,.93),smoothstep(0.,.5,h)); gl_FragColor=linearToOutputTexel(vec4(c,1.)); }' }));
  sky.renderOrder = -30; sky.frustumCulled = false; scene.add(sky);
  const g = new THREE.PlaneGeometry(4e5, 4e5); g.rotateX(-Math.PI / 2); addMesh(g, flatMat(0xece8df), -22);
  const g1 = new THREE.PlaneGeometry(2 * DHALF, 2 * DHALF, 320, 320); g1.rotateX(-Math.PI / 2); addMesh(g1, flatMat(0xece8df), -21);
  const bx = route.map(p => p[0]), by = route.map(p => p[1]), bx0 = Math.min(...bx) - 900, bx1 = Math.max(...bx) + 900, by0 = Math.min(...by) - 900, by1 = Math.max(...by) + 900;
  const g2 = new THREE.PlaneGeometry(bx1 - bx0, by1 - by0, Math.round((bx1 - bx0) / 28), Math.round((by1 - by0) / 28)); g2.rotateX(-Math.PI / 2); g2.translate((bx0 + bx1) / 2, 0, -(by0 + by1) / 2); addMesh(g2, flatMat(0xece8df), -20); }

// polígonos planos (parques, água, uso do solo)
function flatPolys(polys, color, order) {
  const pos = []; for (const poly of polys) { const ext = poly[0].slice(0, -1); if (ext.length < 3) continue;
    const holes = poly.slice(1).map(h => h.slice(0, -1)), c = ext.map(p => new THREE.Vector2(p[0], p[1])), hs = holes.map(h => h.map(p => new THREE.Vector2(p[0], p[1])));
    const all = c.concat(...hs); let tris; try { tris = THREE.ShapeUtils.triangulateShape(c, hs); } catch (e) { continue; } for (const t of tris) for (const i of t) pos.push(all[i].x, 0, -all[i].y); }
  if (!pos.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); addMesh(g, flatMat(color), order); }
flatPolys(CITY.LU.filter(r => r.s === 'agriculture' || r.s === 'horticulture').flatMap(r => r.p), 0xe4e6d0, -18);
flatPolys(CITY.LU.filter(r => r.s === 'park' || r.s === 'recreation' || r.s === 'protected' || ['park', 'forest', 'grass'].includes(r.c)).flatMap(r => r.p), 0xcfe6bb, -17);
flatPolys(CITY.W.flatMap(r => r.p || []), 0xa9d3f2, -16);
flatPolys(DET.Bs.land_use.filter(r => r.p && (r.s === 'park' || r.c === 'park' || r.s === 'recreation')).flatMap(r => r.p), 0xbfe0aa, -15);
flatPolys(DET.Bs.land_use.filter(r => r.p && r.c === 'pitch').flatMap(r => r.p), 0xb2d99b, -14);
flatPolys((DET.Bs.water || []).filter(r => r.p).flatMap(r => r.p), 0xa9d3f2, -14);

// vias (faixas com largura em metros; a escala cresce com a altura para as vias nunca sumirem)
const WID = { motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, residential: 3.8, unclassified: 3.6, service: 2.6, living_street: 3, unknown: 3 };
const EXP = { motorway: 1, trunk: 1, primary: 1, secondary: 0.95, tertiary: 0.8, residential: 0.55, unclassified: 0.55, living_street: 0.5, service: 0.4, unknown: 0.4 };
function ribbonGeo(lines, widthOf, expOf, off = 0, y = 0) {
  const pos = [], nr = [], wk = [], sS = [], idx = []; let q = 0;
  for (const ln of lines) { if (ln.length < 2) continue; let s = 0; const base = q;
    for (let i = 0; i < ln.length; i++) { const a = ln[Math.max(i - 1, 0)], b = ln[Math.min(i + 1, ln.length - 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl; const nx = dy, nz = dx; // normal no plano (x,z) do mundo
      if (i) s += Math.hypot(ln[i][0] - ln[i - 1][0], ln[i][1] - ln[i - 1][1]);
      for (const sg of [-1, 1]) { pos.push(ln[i][0], y, -ln[i][1]); nr.push(nx, nz, sg); wk.push(widthOf, expOf, off); sS.push(s); q++; } }
    for (let i = 0; i < ln.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aN', new THREE.Float32BufferAttribute(nr, 3));
  g.setAttribute('aWK', new THREE.Float32BufferAttribute(wk, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(sS, 1)); g.setIndex(idx); return g; }
const ROAD_VS = DEMGLSL + `attribute vec3 aN; attribute vec3 aWK; attribute float aS; uniform float uS,uWm,uAdd; varying float vD; varying float vS;
  void main(){ float w=(aWK.x*pow(uS,aWK.y)*uWm+uAdd*uS)*0.5; vec3 p=position+vec3(aN.x,0.,aN.y)*(aN.z*w+aWK.z*sqrt(uS)); vS=aS; vec4 wp=modelMatrix*vec4(p,1.); wp.y+=demH(wp.xz)+uS*0.0; vD=distance(wp.xyz,cameraPosition); gl_Position=projectionMatrix*viewMatrix*wp; }`;
const roadMat = hex => new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, side: THREE.DoubleSide, uniforms: { ...UNI, uColor: { value: new THREE.Color(hex) }, uWm: { value: 1 }, uAdd: { value: 0 } },
  vertexShader: ROAD_VS, fragmentShader: FOGGLSL + 'varying float vS; uniform vec3 uColor; void main(){ gl_FragColor=linearToOutputTexel(vec4(fogMix(uColor),1.)); }' });
const ROADSTYLE = { motorway: [0xf0b35c, 0xffe0a0], trunk: [0xf0b35c, 0xffe0a0], primary: [0xe8a84a, 0xffe39a], secondary: [0xdcbd68, 0xfff1c2], tertiary: [0xd5cfc2, 0xffffff], residential: [0xd9d3c7, 0xffffff], unclassified: [0xd9d3c7, 0xffffff], living_street: [0xdcd6ca, 0xfbf9f4], service: [0xe3ded3, 0xf8f6f1], unknown: [0xe3ded3, 0xf8f6f1] };
function addRoads(list, order0) {
  const by = {}; for (const r of list) { if (r.t && r.t !== 'road') continue; const c = r.c; if (['footway', 'path', 'pedestrian', 'steps', 'cycleway'].includes(c)) (by.foot ??= []).push(r.l); else (by[c] ??= []).push(r.l); }
  const order = ['service', 'unknown', 'living_street', 'unclassified', 'residential', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway']; let o = order0;
  for (const c of order) { const ls = by[c]; if (!ls || !ROADSTYLE[c]) continue; const wd = WID[c] ?? 3, ex = EXP[c] ?? 0.5;
    addMesh(ribbonGeo(ls, wd + 2.2, ex), roadMat(ROADSTYLE[c][0]), o); addMesh(ribbonGeo(ls, wd, ex), roadMat(ROADSTYLE[c][1]), o + 1); o += 2; }
  if (by.foot) addMesh(ribbonGeo(by.foot, 0.9, 0.2), roadMat(0xe0c3ad), o); }
const RGRID = new Map(); { const half = route.slice(0, (route.length >> 1) + 1); for (let q = 0; q < half.length; q++) { const k = Math.round(half[q][0] / 250) + ',' + Math.round(half[q][1] / 250); (RGRID.get(k) ?? RGRID.set(k, []).get(k)).push(half[q]); } }
const nearRoute = p => { const cx = Math.round(p[0] / 250), cy = Math.round(p[1] / 250); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const r of RGRID.get((cx + i) + ',' + (cy + j)) ?? []) if (Math.hypot(r[0] - p[0], r[1] - p[1]) < 560) return true; return false; };
const inDet = l => l.some(nearRoute);
addRoads(CITY.R.filter(r => !inDet(r.l)), -12);
addRoads(DET.R, -6);
{ const rails = DET.R.filter(r => r.t === 'rail').map(r => r.l); if (rails.length) addMesh(ribbonGeo(rails, 2.4, 0.5), roadMat(0x9aa0a8), 6); }

// prédios extrudados (altura real quando existe; senão estimada pela área da planta)
const CEN_ = ll([-50.1617, -25.0955]);
const hash = (x, y) => fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
const areaOf = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
const LANDMARKS = [];
const STAR = ll(RT.star);
let bldCount = 0;
{ const pos = [], nor = [], col = [], lmIdx = new Map(); const cenOf = r => { let x = 0, y = 0; for (let i = 0; i < r.length - 1; i++) { x += r[i][0]; y += r[i][1]; } return [x / (r.length - 1), y / (r.length - 1)]; };
  const cens = DET.B.map(b => cenOf(b.p[0])); for (const lm of LANDMARKS) { let bi = -1, bd = 1e9; cens.forEach((c, i) => { const d = Math.hypot(c[0] - lm.xy[0], c[1] - lm.xy[1]); if (d < bd) { bd = d; bi = i; } }); if (bd < 45) lmIdx.set(bi, lm); }
  const E1 = new THREE.Vector3(), E2 = new THREE.Vector3(), N = new THREE.Vector3();
  const tri = (a, b, c, nrm, c1, c2, c3) => { E1.subVectors(b, a); E2.subVectors(c, a); N.crossVectors(E1, E2); if (N.dot(nrm) < 0) { [b, c] = [c, b]; [c2, c3] = [c3, c2]; }
    for (const [v, cc] of [[a, c1], [b, c2], [c, c3]]) { pos.push(v.x, v.y, v.z); nor.push(nrm.x, nrm.y, nrm.z); col.push(cc.r, cc.g, cc.b); } };
  DET.B.forEach((b, bi) => { const ring = b.p[0]; if (ring.length < 4) return; const [cx, cy] = cens[bi], ar = Math.abs(areaOf(ring)), r = hash(cx, cy);
    let h = b.h || (b.f ? b.f * 3.2 : ar < 90 ? 3 + r * 1.6 : ar < 250 ? 3.6 + r * 3.2 : ar < 700 ? 5 + r * 11 : 9 + r * 22); if (!b.h && !b.f) { const dc = Math.hypot(cx - CEN_[0], cy - CEN_[1]); h = Math.min(60, h * (1 + 1.3 * Math.exp(-dc / 1100) * (ar > 180 ? 1 : 0.35))); }
    const lm = lmIdx.get(bi); if (lm) h = Math.max(h, 18);
    const wall = new THREE.Color().setHSL(0.09 + (r - 0.5) * 0.04, 0.1 + r * 0.1, 0.80 + (hash(cy, cx) - 0.5) * 0.06), roof = new THREE.Color().setHSL(0.08, 0.06, 0.88 - r * 0.05);
    if (lm) { wall.set(lm.col).multiplyScalar(0.92); roof.set(lm.col); }
    const base = wall.clone().multiplyScalar(0.78), pts = ring.slice(0, -1).map(p => [p[0], -p[1]]); const y0 = Math.min(...pts.map(p => demH(p[0], p[1]))) - 0.3;
    let sum = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; sum += p[0] * q[1] - q[0] * p[1]; } const sgn = sum > 0 ? 1 : -1;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const dx = q[0] - p[0], dz = q[1] - p[1], dl = Math.hypot(dx, dz); if (dl < 0.05) continue;
      const n = new THREE.Vector3(sgn * dz / dl, 0, -sgn * dx / dl), shade = 0.86 + 0.14 * Math.abs(n.x * -0.6 + n.z * 0.5), wc = wall.clone().multiplyScalar(shade), bc = base.clone().multiplyScalar(shade);
      const A = new THREE.Vector3(p[0], y0 - 2.5, p[1]), B = new THREE.Vector3(q[0], y0 - 2.5, q[1]), C = new THREE.Vector3(q[0], y0 + h, q[1]), D2 = new THREE.Vector3(p[0], y0 + h, p[1]); tri(A, B, C, n, bc, bc, wc); tri(A, C, D2, n, bc, wc, wc); }
    let tr; try { tr = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []); } catch (e) { tr = []; } const up = new THREE.Vector3(0, 1, 0);
    for (const t of tr) tri(new THREE.Vector3(pts[t[0]][0], y0 + h, pts[t[0]][1]), new THREE.Vector3(pts[t[1]][0], y0 + h, pts[t[1]][1]), new THREE.Vector3(pts[t[2]][0], y0 + h, pts[t[2]][1]), up, roof, roof, roof);
    bldCount++; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.renderOrder = 20; m.frustumCulled = false; scene.add(m); }

// rota: fantasma + brilho + contorno + preenchimento (amarelo na ida, azul na volta, setas correndo)
const routeMat = (wmul, kind) => new THREE.ShaderMaterial({ transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { ...UNI, uWm: { value: wmul }, uAdd: { value: 0 }, uDraw: { value: 0 }, uKind: { value: kind }, uAlpha: { value: 1 } },
  vertexShader: ROAD_VS, fragmentShader: FOGGLSL + `varying float vS; uniform float uSwitch,uDraw,uTime,uKind,uAlpha; void main(){ if(vS>uDraw) discard;
    vec3 y=vec3(1.,.76,.10), b=vec3(.12,.60,1.); vec3 c=vS<uSwitch?y:b; float a=1.;
    if(uKind<0.5){ float st=.5+.5*sin((vS-uTime*70.)/7.); c=mix(c*0.84,c+vec3(.20),st); } else if(uKind<1.5){ c=vec3(.10,.13,.22); } else if(uKind<2.5){ a=.30; } else { c=vec3(1.); a=.6; }
    gl_FragColor=linearToOutputTexel(vec4(fogMix(c),a*uAlpha)); }` });
const rgeo = ribbonGeo([route], 1, 1, 3.4, 0.25);
const rGhost = routeMat(7, 3), rGlow = routeMat(20, 2), rCase = routeMat(10, 1), rFill = routeMat(6.8, 0);
[rGhost, rGlow, rCase, rFill].forEach((m, i) => addMesh(rgeo, m, 22 + i));

// arco e linha quadriculada de largada/chegada
function signTex(txt, sub, c1) { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d'); x.fillStyle = c1; x.fillRect(0, 0, 1024, 256); x.fillStyle = '#ffd23c'; x.fillRect(0, 0, 1024, 14); x.fillRect(0, 242, 1024, 14);
  x.fillStyle = '#fff'; x.font = '900 104px DejaVu Sans, sans-serif'; x.textAlign = 'center'; x.fillText(txt, 512, 150); x.fillStyle = '#ffd23c'; x.font = '800 44px DejaVu Sans, sans-serif'; x.fillText(sub, 512, 215); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
{ const p0 = atS(6), hd = headAt(6) * DEG, th = Math.PI - hd, g = new THREE.Group(), steel = new THREE.MeshLambertMaterial({ color: 0xe8e8ee });
  for (const sg of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6.4, 0.8), steel); p.position.set(sg * 6.2, 3.2, 0); g.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(13.4, 2.4, 0.7), new THREE.MeshLambertMaterial({ color: 0x1b2a6b })); beam.position.set(0, 6.4, 0); g.add(beam);
  const mat = new THREE.MeshBasicMaterial({ map: signTex('LARGADA E CHEGADA', '11ª RESGATANDO VIDAS NA CORRIDA', '#2f55f0') });
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.1), mat); f1.position.set(0, 6.4, 0.4); g.add(f1); const f2 = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.1), mat); f2.position.set(0, 6.4, -0.4); f2.rotation.y = Math.PI; g.add(f2);
  g.position.set(p0[0], demH(p0[0], -p0[1]), -p0[1]); g.rotation.y = th; g.renderOrder = 30; scene.add(g);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const cx = cv.getContext('2d'); for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { cx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; cx.fillRect(i * 16, j * 16, 16, 16); }
  const ct = new THREE.CanvasTexture(cv); ct.colorSpace = THREE.SRGBColorSpace; const line = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: ct })); line.rotation.x = -Math.PI / 2; line.position.y = 0.3; const lg = new THREE.Group(); lg.add(line); lg.rotation.y = th; lg.position.set(p0[0], demH(p0[0], -p0[1]) + 0.3, -p0[1]); lg.renderOrder = 31; scene.add(lg); }

/* ------------------------------ câmera ------------------------------ */
const cityC = ll([-50.157, -25.104]), rc = (() => { let x = 0, y = 0; for (const p of route) { x += p[0]; y += p[1]; } return [x / route.length, y / route.length]; })();
const tF0 = S('d1', 1.2), tF1 = S('c1', -0.2), tTurn = S('d4', 0.6);
const SK = [{ t: tF0 - 1.2, s: 0 }, { t: tF0, s: 0 }, { t: E('d1'), s: 60 }, { t: tTurn, s: L1 }, { t: tF1, s: LTOT }];
function monoTan(ts, vs) { const n = ts.length, h = [], d = [], m = new Array(n).fill(0); for (let i = 0; i < n - 1; i++) { h[i] = Math.max(ts[i + 1] - ts[i], 1e-6); d[i] = (vs[i + 1] - vs[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (h[i - 1] + h[i]) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i]); return m; }
const herm = (v0, v1, m0, m1, h, u) => (2 * u ** 3 - 3 * u ** 2 + 1) * v0 + (u ** 3 - 2 * u ** 2 + u) * h * m0 + (-2 * u ** 3 + 3 * u ** 2) * v1 + (u ** 3 - u ** 2) * h * m1;
const SKT = SK.map(k => k.t), SKM = monoTan(SKT, SK.map(k => k.s));
function sAt(t) { if (t <= SKT[0]) return 0; if (t >= SKT[SKT.length - 1]) return LTOT; let i = 0; while (i < SK.length - 2 && t > SK[i + 1].t) i++; const h = SKT[i + 1] - SKT[i], u = clamp((t - SKT[i]) / h); return clamp(herm(SK[i].s, SK[i + 1].s, SKM[i], SKM[i + 1], h, u), 0, LTOT); }
const K = [
  { t: 0, x: cityC[0] - 1500, y: cityC[1] + 800, d: 46000, tilt: 0, head: 25 },
  { t: Wd('h1', 'Ponta', 0.2), x: cityC[0] - 300, y: cityC[1] + 200, d: 34000, tilt: 0, head: 18 },
  { t: E('h1', 0.0), x: rc[0] - 400, y: rc[1], d: 19000, tilt: 0, head: 10 },
  { t: E('h2', 0.0), x: rc[0] - 100, y: rc[1] - 100, d: 13800, tilt: 0, head: 0 },
  { t: S('d1', 0.5), x: STAR[0] - 40, y: STAR[1] + 30, d: 900, tilt: 14, head: 8 },
];
let hPrev = 0;
for (let t = tF0; t <= tF1 + 1e-6; t += 0.4) { const s = sAt(t), p = atS(Math.min(s + 70, LTOT)); let hd = headAt(Math.min(s + 70, LTOT)); while (hd - hPrev > 180) hd -= 360; while (hd - hPrev < -180) hd += 360; hPrev = hd;
  const ida = s < L1; const ramp = smooth(Math.min(s, LTOT - s) / 1400); K.push({ t, x: p[0], y: p[1], d: lerp(520, 1750, ramp), tilt: lerp(46, 36, ramp), head: hd }); }
K.push({ t: tF1 + 1.3, x: rc[0] - 100, y: rc[1] - 100, d: 13000, tilt: 0, head: hPrev * 0 + 0 });
K.push({ t: TOTAL, x: rc[0] - 100, y: rc[1] - 100, d: 12000, tilt: 8, head: 12 });
{ const bad = K.find((k, i) => i && k.t <= K[i - 1].t); if (bad) throw new Error('chaves fora de ordem ' + bad.t); }
const KF = ['x', 'y', 'tilt', 'head'], KTS = K.map(k => k.t), KLD = K.map(k => Math.log(k.d));
const KTAN = Object.fromEntries([...KF.map(f => [f, monoTan(KTS, K.map(k => k[f]))]), ['ld', monoTan(KTS, KLD)]]);
function camState(t) { let i = 0; while (i < K.length - 2 && t > K[i + 1].t) i++; const a = K[i], b = K[i + 1], h = Math.max(b.t - a.t, 1e-6), u = clamp((t - a.t) / h), o = {};
  for (const f of KF) o[f] = herm(a[f], b[f], KTAN[f][i], KTAN[f][i + 1], h, u); o.d = Math.exp(herm(KLD[i], KLD[i + 1], KTAN.ld[i], KTAN.ld[i + 1], h, u)); return o; }
const BEATS = [Wd('h1', 'Ponta', 0), S('d1', 0), S('d2', 0), S('d3', 0), S('d4', 0), S('d5', 0), S('d6', 0), S('f1', 0), S('c1', 0)];
function placeCamera(c) {
  const hd = c.head * DEG, tl = c.tilt * DEG, fw = new THREE.Vector3(Math.sin(hd), 0, -Math.cos(hd)), tgt = new THREE.Vector3(c.x, demH(c.x, -c.y), -c.y);
  camera.position.copy(tgt).addScaledVector(fw, -c.d * Math.sin(tl)); camera.position.y = tgt.y + c.d * Math.cos(tl); camera.up.copy(fw); camera.lookAt(tgt);
  camera.near = Math.max(1, c.d * 0.015); camera.far = c.d * 12 + 40000; camera.updateProjectionMatrix();
  const low = smooth((c.tilt - 8) / 30), fogF = lerp(1e9, c.d * 4.5 + 1800, low), fogN = lerp(5e8, c.d * 0.9, low);
  UNI.uFogN.value = fogN; UNI.uFogF.value = fogF; scene.fog.near = fogN; scene.fog.far = fogF; UNI.uS.value = clamp(c.d / 900, 1, 60); }

/* ------------------------------ interface ------------------------------ */
const labelsEl = document.getElementById('labels'), capEl = document.getElementById('cap'), cardEl = document.getElementById('card'), barChip = document.getElementById('chip'), barTtl = document.getElementById('ttl');
const footEl = document.getElementById('foot'), hudEl = document.getElementById('hud'), hfl = null;
document.getElementById('speed')?.remove(); document.getElementById('pulse')?.remove();
const LABELS = [], _p = new THREE.Vector3();
function addLabel(o) { const el = document.createElement('div'); el.className = 'lab ' + (o.cls || ''); el.innerHTML = o.text; labelsEl.appendChild(el); const dot = o.dot ? Object.assign(document.createElement('div'), { className: 'dot' }) : null; if (dot) labelsEl.appendChild(dot); LABELS.push({ ...o, el, dotEl: dot, pos: new THREE.Vector3(o.xy[0], (o.up ?? 0) + demH(o.xy[0], -o.xy[1]), -o.xy[1]) }); }
const turnP = atS(L1);
addLabel({ text: 'PONTA GROSSA · PR', xy: [cityC[0] - 500, cityC[1] + 300], t0: 0.3, t1: E('h1', 0.1), cls: '', dot: false, up: 0 });
addLabel({ text: 'LARGADA E CHEGADA<br><span style="font-size:.62em;font-weight:800">ESQUADRÃO DA VIDA</span>', xy: STAR, t0: Wd('d1', 'largada', -0.4), t1: E('d1', 0.9), cls: '', dot: true, up: 14, dy: -150 });
addLabel({ text: 'UVARANAS', xy: ll([-50.1165, -25.0965]), t0: Wd('d3', 'Uvaranas', -0.6), t1: E('d3', 0.5), cls: '', dot: false, up: 10 });
addLabel({ text: 'UEPG', xy: ll([-50.10427, -25.09368]), t0: Wd('d3', 'UEPG', -0.4), t1: E('d3', 0.4), cls: 'sm', dot: true, up: 18, dy: -10 });
addLabel({ text: 'HOSPITAL REGIONAL', xy: ll([-50.1028, -25.0987]), t0: Wd('d3', 'Hospital', -0.4), t1: E('d3', 0.6), cls: 'sm', dot: true, up: 18, dy: -10 });
addLabel({ text: 'RETORNO<br><span style="font-size:.62em;font-weight:800">CAMPO DE INSTRUÇÃO GEN. CALAZANS (APROX.)</span>', xy: turnP, t0: Wd('d4', 'laço', -0.6), t1: E('d4', 1.2), cls: '', dot: true, up: 14, dy: -150 });
addLabel({ text: 'CHEGADA<br><span style="font-size:.62em;font-weight:800">ESQUADRÃO DA VIDA</span>', xy: STAR, t0: Wd('d6', 'chegada', -0.6), t1: E('f1', 0.2), cls: '', dot: true, up: 14, dy: -150 });

const FOOT = 'Relevo real exagerado 3× · © OpenStreetMap via Overture Maps · altura dos prédios estimada · traçado aproximado';
// perfil de altitude real ao longo do percurso (modelo digital de elevação)
const PROF = []; for (let q = 0; q <= LTOT; q += 12) { const p = atS(q); PROF.push([q, demRaw(p[0], -p[1])]); }
const eMin = Math.min(...PROF.map(a => a[1])), eMax = Math.max(...PROF.map(a => a[1])), eStart = PROF[0][1], eTip = demRaw(...(a => [a[0], -a[1]])(atS(L1 + L3 * 0.5))), CLIMB = Math.round(eTip - eStart);
const PW = 960, PH = 74, px_ = q => q / LTOT * PW, py_ = e => PH - 8 - (e - eMin) / Math.max(eMax - eMin, 1) * (PH - 18);
const profD = PROF.map((a, i) => (i ? 'L' : 'M') + px_(a[0]).toFixed(1) + ' ' + py_(a[1]).toFixed(1)).join('');
hudEl.innerHTML = `<svg width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}" style="display:block"><defs><clipPath id="pc"><rect id="pcr" x="0" y="0" width="0" height="${PH}"/></clipPath></defs>
  <path d="${profD}L${PW} ${PH}L0 ${PH}Z" fill="rgba(255,255,255,.22)"/><path d="${profD}L${PW} ${PH}L0 ${PH}Z" fill="rgba(255,194,26,.85)" clip-path="url(#pc)"/><path d="${profD}" fill="none" stroke="#fff" stroke-width="3"/>
  <circle id="pdot" r="9" fill="#fff" stroke="#ffc21a" stroke-width="5"/></svg><div class="tx" id="htx"></div>`;
const pcr = document.getElementById('pcr'), pdot = document.getElementById('pdot'), htx2 = document.getElementById('htx');
const CARDS = [
  { t0: S('h1', 0.1), t1: E('h1', 0.2), html: `<div class="big">20 NOV</div><div class="sub">Ponta Grossa · Percurso oficial</div>` },
  { t0: Wd('d1', 'largada', -0.1), t1: E('d1', 0.3), html: `<div class="big s">LARGADA</div><div class="sub">Esquadrão da Vida · Av. dos Vereadores, 850</div>` },
  { t0: Wd('d2', 'ida', -0.1), t1: E('d2', 0.3), html: `<div class="big s">IDA</div><div class="sub" style="color:#ffd23c">Rumo ao Campo de Instrução General Calazans</div>` },
  { t0: Wd('d3', 'Uvaranas', -0.3), t1: E('d3', 0.3), html: `<div class="big s">UVARANAS</div><div class="sub">UEPG · Hospital Regional</div>` },
  { t0: Wd('d4', 'retorno', -0.6), t1: E('d4', 0.4), html: `<div class="big s">RETORNO</div><div class="sub">Laço no Campo de Instrução</div>` },
  { t0: Wd('d5', 'volta', -0.1), t1: E('d5', 0.4), html: `<div class="big s" style="color:#6fc8ff">VOLTA</div><div class="sub">De volta ao Esquadrão da Vida</div>` },
  { t0: Wd('d6', 'chegada', -0.4), t1: E('d6', 0.4), html: `<div class="big s">CHEGADA</div><div class="sub">Em frente ao Esquadrão da Vida</div>` },
  { t0: S('f1', -0.1), t1: E('f1', 0.3), html: `<div class="big">21 km</div><div class="sub">Percurso oficial · Corrida de rua</div>` },
  { t0: S('c1', 0.0), t1: TOTAL + 1, html: `<div class="big s" style="font-size:60px">11ª RESGATANDO VIDAS</div><div class="big s" style="font-size:60px">NA CORRIDA</div><div class="sub" style="margin-top:14px">20 NOV · Ponta Grossa</div>` },
];
const BAR = [{ t: 0, chip: '20 NOV', ttl: 'Corrida de 21 km' }, { t: S('d1', -0.1), chip: 'LARGADA', ttl: 'Esquadrão da Vida' }, { t: S('d2', -0.1), chip: 'IDA', ttl: 'Rumo ao Campo de Instrução' }, { t: S('d3', -0.1), chip: 'UVARANAS', ttl: 'UEPG · Hospital Regional' },
  { t: S('d4', -0.1), chip: 'RETORNO', ttl: 'Campo de Instrução' }, { t: S('d5', -0.1), chip: 'VOLTA', ttl: 'Rumo ao Esquadrão' }, { t: S('d6', -0.1), chip: 'CHEGADA', ttl: 'Esquadrão da Vida' }, { t: S('f1', -0.1), chip: '21 KM', ttl: 'Corrida de rua' }, { t: S('c1', -0.1), chip: '20 NOV', ttl: 'Ponta Grossa' }];
const CHUNKS = []; { for (const l of TL.lines) { let cur = []; const flush = () => { if (cur.length) { CHUNKS.push({ words: cur, t0: cur[0].t0, t1: cur[cur.length - 1].t1 }); cur = []; } };
  for (const w of l.words) { const txt = w.w.replace(/[,.:;]/g, '').toUpperCase(); const len = cur.reduce((a, x) => a + x.txt.length + 1, 0) + txt.length; if (cur.length && (len > 22 || cur.length >= 4)) flush(); cur.push({ ...w, txt }); if (/[,.:?]$/.test(w.w)) flush(); } flush(); } }
let capKey = '', cardKey = -1; const fmt = v => v.toFixed(1).replace('.', ',');

/* ------------------------------ quadro ------------------------------ */
function update(t) {
  const c = camState(t); { let k = 1; for (const b of BEATS) if (t >= b && t - b < 1.0) k = Math.min(k, 1 - 0.06 * Math.exp(-(t - b) / 0.2)); c.d *= k; }
  placeCamera(c); camera.updateMatrixWorld(); UNI.uTime.value = t;
  const s = sAt(t), full = smooth((t - S('c1', -0.4)) / 0.8), drawIdle = t < tF0 - 1.0 ? 0 : 1;
  const prog = full > 0 ? LTOT : Math.min(LTOT, s + 380) * drawIdle;
  rFill.uniforms.uDraw.value = rCase.uniforms.uDraw.value = rGlow.uniforms.uDraw.value = prog;
  rGhost.uniforms.uDraw.value = t > E('h1', -0.3) ? LTOT * smooth((t - E('h1', -0.3)) / 1.2) : 0; rGhost.uniforms.uAlpha.value = 1 - smooth((t - (tF0 - 1.2)) / 0.5);
  renderer.render(scene, camera);

  for (const lb of LABELS) { let a; if (lb.near != null) { a = (1 - smooth((Math.abs(s - lb.near) - 120) / 160)) * smooth((t - tF0 + 0.2) / 0.4) * (1 - smooth((t - E('d4', 0.2)) / 0.4)); } else a = smooth((t - lb.t0) / 0.28) * (1 - smooth((t - lb.t1) / 0.3));
    const q = _p.copy(lb.pos).project(camera); if (a <= 0.01 || q.z > 1 || q.z < -1) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; }
    const px = clamp((q.x + 1) / 2 * W, 300, 780), py = (1 - q.y) / 2 * H, ly = clamp(py + (lb.dy ?? -14), 400, 980); if (lb.near != null && (py < 360 || py > 960)) { lb.el.style.opacity = 0; if (lb.dotEl) lb.dotEl.style.opacity = 0; continue; } lb.el.style.opacity = a; lb.el.style.left = px + 'px'; lb.el.style.top = ly + 'px'; lb.el.style.transform = `translate(-50%,-100%) scale(${0.85 + 0.15 * a})`;
    if (lb.dotEl) { lb.dotEl.style.opacity = a; lb.dotEl.style.left = ((q.x + 1) / 2 * W) + 'px'; lb.dotEl.style.top = py + 'px'; } }
  const ch = CHUNKS.find(x => t >= x.t0 - 0.05 && t <= x.t1 + 0.18);
  if (ch) { const cur = ch.words.findIndex(w => t >= w.t0 && t < w.t1); const idx = cur < 0 ? (t >= ch.words[ch.words.length - 1].t1 ? ch.words.length - 1 : 0) : cur; const key = CHUNKS.indexOf(ch) + ':' + idx;
    if (key !== capKey) { capEl.innerHTML = ch.words.map((w, i) => `<span class="w${i === idx ? ' on' : ''}">${w.txt}</span>`).join(' '); capKey = key; } } else if (capKey) { capEl.innerHTML = ''; capKey = ''; }
  const ci = CARDS.findIndex(x => t >= x.t0 && t < x.t1);
  if (ci >= 0) { if (ci !== cardKey) { cardEl.innerHTML = CARDS[ci].html; cardKey = ci; } const cd = CARDS[ci], a = smooth((t - cd.t0) / 0.3) * (1 - smooth((t - (cd.t1 - 0.25)) / 0.25)); cardEl.style.opacity = a; cardEl.style.transform = `translateY(${(1 - a) * 40}px)`; } else { cardEl.style.opacity = 0; cardKey = -1; }
  let b = BAR[0]; for (const x of BAR) if (t >= x.t) b = x; if (barChip.textContent !== b.chip) { barChip.textContent = b.chip; barTtl.textContent = b.ttl; }
  footEl.textContent = FOOT; footEl.style.opacity = 1;
  const hv = smooth((t - S('d2', -0.2)) / 0.5) * (1 - smooth((t - S('c1', -0.2)) / 0.4)); hudEl.style.opacity = hv; const sh = full > 0 ? LTOT : Math.min(s, LTOT); pcr.setAttribute('width', px_(sh)); const pp = atS(sh); const alt = demRaw(pp[0], -pp[1]); pdot.setAttribute('cx', px_(sh)); pdot.setAttribute('cy', py_(alt)); htx2.textContent = `${fmt(sh / 1000)} km de 21 km · altitude ${Math.round(alt)} m`;
}
window.__TOTAL = TOTAL; window.__INFO = { LTOT, L1, L3, bldCount, landmarks: LANDMARKS.map(l => l.label) };
window.renderFrame = async t => { update(t); await new Promise(r => requestAnimationFrame(() => r())); return true; };
window.__ready = true; update(0);
