// Carinha 3D do Maré (three.js). Empacotado em js/vendor/face3d.js por `npm run build:3d`.
// Só importa o que usa, para o arquivo final ficar pequeno. Roda 100% local, sem CDN.
import {
  WebGLRenderer, Scene, PerspectiveCamera, SphereGeometry, MeshStandardMaterial, Mesh, Group,
  HemisphereLight, DirectionalLight, TubeGeometry, CatmullRomCurve3, Vector3, Color, BoxGeometry, SRGBColorSpace,
} from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const surfZ = (x, y) => Math.sqrt(Math.max(0.03, 1 - x * x - y * y));

// Forma de cada humor (1–5): curvatura da boca, espessura, ângulo/visibilidade das sobrancelhas.
const SHAPES = {
  1: { c: -0.17, mr: 0.034, brow: -0.5, browVis: 1 },
  2: { c: -0.09, mr: 0.03, brow: 0.32, browVis: 1 },
  3: { c: 0, mr: 0.03, brow: 0, browVis: 0 },
  4: { c: 0.11, mr: 0.03, brow: 0, browVis: 0 },
  5: { c: 0.18, mr: 0.05, brow: 0, browVis: 0 },
};

/** Mola amortecida simples para um valor escalar. */
class Spring {
  constructor(v, k = 170, d = 17) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.d = d; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.vel += (this.k * (this.t - this.v) - this.d * this.vel) * h; this.v += this.vel * h; }
  }
  get settled() { return Math.abs(this.t - this.v) < 1e-4 && Math.abs(this.vel) < 1e-3; }
}

export function createFace3D(box, { reduced = false } = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    if (!renderer.getContext()) return null;
  } catch { return null; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'face3d';
  canvas.setAttribute('aria-hidden', 'true');
  box.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0, 4.7);
  scene.add(new HemisphereLight(0xffffff, 0x9aa7b8, 1.5));
  const key = new DirectionalLight(0xffffff, 2.4); key.position.set(2.2, 3, 4); scene.add(key);
  const rim = new DirectionalLight(0xbfd8ff, 0.9); rim.position.set(-3, 1, -2); scene.add(rim);

  const group = new Group(); scene.add(group);
  const bodyMat = new MeshStandardMaterial({ color: 0x7fd1c0, roughness: 0.5, metalness: 0 });
  const body = new Mesh(new SphereGeometry(1, 64, 48), bodyMat); group.add(body);

  const featMat = new MeshStandardMaterial({ color: 0x1a2430, roughness: 0.55, metalness: 0 });
  const eyeGeo = new SphereGeometry(0.085, 24, 16);
  const eyes = [-1, 1].map((s) => { const m = new Mesh(eyeGeo, featMat); m.position.set(s * 0.3, 0.17, surfZ(s * 0.3, 0.17) * 0.985); group.add(m); return m; });
  const browGeo = new BoxGeometry(0.26, 0.055, 0.06);
  const brows = [-1, 1].map((s) => { const m = new Mesh(browGeo, featMat); m.position.set(s * 0.31, 0.4, surfZ(s * 0.31, 0.4) * 1.0); m.userData.side = s; group.add(m); return m; });
  const mouth = new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(-0.3, -0.2, 0.9), new Vector3(0.3, -0.2, 0.9)]), 4, 0.03, 8, false), featMat);
  group.add(mouth);

  // estado animado
  const sp = { x: new Spring(0, 160, 21), c: new Spring(0), mr: new Spring(0.03), brow: new Spring(0), vis: new Spring(0), pop: new Spring(0, 220, 13), r: new Spring(0.5, 120, 20), g: new Spring(0.8, 120, 20), b: new Spring(0.75, 120, 20), fr: new Spring(0.1, 120, 20), fg: new Spring(0.14, 120, 20), fb: new Spring(0.19, 120, 20) };
  let yaw = 0, pitch = 0, tYaw = 0, tPitch = 0, spin = 0;
  let lastMouth = { c: 99, mr: 99 };
  let queued = null, outX = 3, outStart = 0;

  /** Define os alvos da expressão/cor; `instant` pula a transição (usado fora da vista). */
  const setTargets = (m, { rgb, featRgb }, instant) => {
    const s = SHAPES[m] || SHAPES[3];
    sp.c.t = s.c; sp.mr.t = s.mr; sp.brow.t = s.brow; sp.vis.t = s.browVis;
    sp.r.t = rgb[0]; sp.g.t = rgb[1]; sp.b.t = rgb[2];
    sp.fr.t = featRgb[0]; sp.fg.t = featRgb[1]; sp.fb.t = featRgb[2];
    if (instant) for (const k in sp) if (k !== 'x' && k !== 'pop') { sp[k].v = sp[k].t; sp[k].vel = 0; }
  };

  const rebuildMouth = () => {
    const hw = 0.3, base = -0.2, pts = [];
    for (let i = 0; i <= 10; i++) {
      const x = -hw + (2 * hw * i) / 10, u = 1 - (x / hw) ** 2, y = base - sp.c.v * u;
      pts.push(new Vector3(x, y, surfZ(x, y) * 0.99));
    }
    mouth.geometry.dispose();
    mouth.geometry = new TubeGeometry(new CatmullRomCurve3(pts), 32, Math.max(0.02, sp.mr.v), 10, false);
    lastMouth = { c: sp.c.v, mr: sp.mr.v };
  };

  const apply = (dt) => {
    for (const k in sp) sp[k].step(dt);
    if (Math.abs(sp.c.v - lastMouth.c) > 1e-3 || Math.abs(sp.mr.v - lastMouth.mr) > 1e-4) rebuildMouth();
    bodyMat.color.setRGB(clamp(sp.r.v, 0, 1), clamp(sp.g.v, 0, 1), clamp(sp.b.v, 0, 1), SRGBColorSpace);
    featMat.color.setRGB(clamp(sp.fr.v, 0, 1), clamp(sp.fg.v, 0, 1), clamp(sp.fb.v, 0, 1), SRGBColorSpace);
    for (const b of brows) { b.rotation.z = sp.brow.v * b.userData.side; b.scale.setScalar(Math.max(0.001, clamp(sp.vis.v, 0, 1.1))); }
    const s = 1 + sp.pop.v;
    group.scale.set(s * (1 + sp.pop.v * 0.25), s * (1 - sp.pop.v * 0.25), s);
  };

  let w = 0, h = 0;
  const resize = () => {
    const nw = Math.floor(box.clientWidth), nh = Math.floor(box.clientHeight);
    if (!nw || !nh || (nw === w && nh === h)) return;
    w = nw; h = nh; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); draw();
  };
  const draw = () => renderer.render(scene, camera);

  // movimento ocioso e ponteiro (desligados com prefers-reduced-motion)
  const onMove = (e) => {
    if (reduced) return;
    const r = box.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / 280, dy = (e.clientY - (r.top + r.height / 2)) / 280;
    tYaw = clamp(dx, -1, 1) * 0.5; tPitch = clamp(dy, -1, 1) * 0.3;
  };
  const onDown = () => { if (!reduced) { sp.pop.v = 0.0; sp.pop.vel = 1.4; } };
  window.addEventListener('pointermove', onMove, { passive: true });
  box.addEventListener('pointerdown', onDown);

  let raf = 0, visible = true, last = performance.now(), t0 = last;
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    yaw += (tYaw - yaw) * Math.min(1, dt * 6); pitch += (tPitch - pitch) * Math.min(1, dt * 6);
    const t = (now - t0) / 1000;
    group.rotation.y = yaw + Math.sin(t * 0.8) * 0.1 + spin; group.rotation.x = pitch;
    group.position.y = Math.sin(t * 1.5) * 0.045;
    apply(dt);
    // Deslize: a bolinha sai pela direita (rolando), troca de expressão fora da vista e entra pela esquerda.
    if (queued && (sp.x.v > outX * 0.9 || now - outStart > 320)) {
      setTargets(queued.m, queued.opts, true);
      queued = null;
      sp.x.v = -outX; sp.x.vel = 0; sp.x.k = 150; sp.x.d = 19; sp.x.t = 0;
      sp.pop.v = 0; sp.pop.vel = 0.7;
    }
    group.position.x = sp.x.v;
    group.rotation.z = -sp.x.v; // rolar: deslocamento / raio (raio = 1)
    draw();
    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (reduced) { last = performance.now(); apply(2); draw(); } else if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  io.observe(box);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(resize); ro.observe(box);
  resize();

  // contexto perdido: some a tela preta e volta ao desenho 2D
  let onLost = null;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost?.(); });

  return {
    set onLost(fn) { onLost = fn; },
    /** m: 1–5; rgb/featRgb: [0..1] sRGB. Troca animada: desliza para a direita e a nova entra pela esquerda. */
    setMood(m, opts) {
      if (opts.first || reduced) { setTargets(m, opts, true); kick(); return; }
      const halfW = Math.tan((15 * Math.PI) / 180) * 4.7 * (camera.aspect || 1);
      outX = halfW + 1.4;
      queued = { m, opts }; // se já estiver saindo, só troca o destino
      if (sp.x.t !== outX) { outStart = performance.now(); sp.x.k = 420; sp.x.d = 36; sp.x.t = outX; }
      kick();
    },
    destroy() {
      onLost = null; cancelAnimationFrame(raf); raf = 0; visible = false;
      io.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove); box.removeEventListener('pointerdown', onDown);
      [body.geometry, mouth.geometry, eyeGeo, browGeo, bodyMat, featMat].forEach((x) => x.dispose());
      renderer.dispose(); if (!renderer.getContext().isContextLost()) renderer.forceContextLoss(); canvas.remove();
    },
  };
}
