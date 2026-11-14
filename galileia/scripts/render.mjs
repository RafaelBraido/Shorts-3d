// uso: node scripts/render.mjs <worker> <nWorkers> -> out/frames/f_%05d.jpg (30 fps, determinístico)
import { createRequire } from 'module'; const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
import fs from 'fs';
const [wk, nw] = process.argv.slice(2).map(Number); const FPS = 30;
const tl = JSON.parse(fs.readFileSync('out/timeline.json')); const N = Math.ceil(tl.total * FPS); fs.mkdirSync('out/frames', { recursive: true });
const b = await chromium.launch({ args: process.env.GPU ? ['--use-gl=angle', '--use-angle=default', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('http://localhost:8123/src/index.html'); await p.waitForFunction('window.__ready', null, { timeout: 180000 });
let done = 0;
for (let f = wk; f < N; f += nw) {
  const path = `out/frames/f_${String(f).padStart(5, '0')}.jpg`; if (fs.existsSync(path)) continue;
  await p.evaluate(t => window.renderFrame(t), f / FPS); await p.screenshot({ path, type: 'jpeg', quality: 97 }); done++;
  if (done % 20 === 0) console.log(`w${wk} ${done} (frame ${f}/${N})`);
}
await b.close(); console.log(`w${wk} fim`);
