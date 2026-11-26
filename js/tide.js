// Fundo "maré": ondas em WebGL puro (um shader, sem biblioteca) na cor do humor.
// Leve: renderiza em resolução reduzida, pausa com a aba escondida e fica parado com "menos movimento".
import { moodRgb } from './charts.js';

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `
precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform vec3 uColor; uniform float uLevel; uniform float uDark;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  float x = uv.x * asp;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    float k = float(i);
    float base = 0.07 + uLevel * 0.2 + k * 0.065;
    float w = sin(x * (2.2 + k * 1.3) + uTime * (0.32 + k * 0.1) + k * 2.1) * 0.026
            + sin(x * (5.6 - k * 0.8) - uTime * (0.22 + k * 0.06) + k) * 0.012;
    float line = base + w;
    float fill = smoothstep(line + 0.004, line - 0.004, uv.y);
    float crest = smoothstep(0.014, 0.0, abs(uv.y - line)) * 0.5;
    float a = (fill * (0.1 - k * 0.012) + crest * 0.1) * (1.0 + uDark * 0.25);
    vec3 c = mix(uColor, vec3(1.0), 0.18 * (3.0 - k) / 3.0 * (1.0 - uDark));
    acc = vec4(acc.rgb * (1.0 - a) + c * a, acc.a * (1.0 - a) + a);
  }
  gl_FragColor = acc;
}`;

export function createTide() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'tide';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // um triângulo cobre a tela
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(['uRes', 'uTime', 'uColor', 'uLevel', 'uDark'].map((n) => [n, gl.getUniformLocation(prog, n)]));

  document.body.prepend(canvas);

  // estado suavizado
  const cur = { r: 0.5, g: 0.8, b: 0.75, level: 0.5 }, tgt = { ...cur };
  const dark = matchMedia('(prefers-color-scheme: dark)');
  let raf = 0, last = performance.now(), t = 0, alive = true;

  const resize = () => {
    const s = Math.min(window.devicePixelRatio || 1, 1.5) * 0.6; // baixa resolução: as ondas são suaves
    const w = Math.max(2, Math.floor(innerWidth * s)), h = Math.max(2, Math.floor(innerHeight * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  const draw = () => {
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform3f(U.uColor, cur.r, cur.g, cur.b);
    gl.uniform1f(U.uLevel, cur.level);
    gl.uniform1f(U.uDark, dark.matches ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const k = 1 - Math.exp(-dt * 3.2); // aproxima a cor e a altura do alvo
    for (const key of ['r', 'g', 'b', 'level']) cur[key] += (tgt[key] - cur[key]) * k;
    draw();
    if (alive && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (reduced) { Object.assign(cur, tgt); t = 3; resize(); draw(); return; }
    if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  addEventListener('resize', () => { resize(); if (reduced) draw(); });
  document.addEventListener('visibilitychange', kick);
  dark.addEventListener?.('change', kick);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); alive = false; canvas.remove(); });
  resize(); kick();

  return {
    /** m: nota 1–5 (a altura das ondas sobe com o humor). */
    setMood(m) {
      const [r, g, b] = moodRgb(m);
      Object.assign(tgt, { r, g, b, level: (Math.max(1, Math.min(5, m)) - 1) / 4 });
      kick();
    },
  };
}
