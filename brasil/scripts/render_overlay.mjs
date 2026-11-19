// camada transparente (rótulos, contornos, legenda, cartões) -> out/overlay/f_%05d.png ; uso: node scripts/render_overlay.mjs [ini fim]
import { createRequire } from 'module'; const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
import fs from 'fs';
const tl = JSON.parse(fs.readFileSync('out/timeline.json')); const N = Math.ceil(tl.total * 30);
const [a0, a1] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? N - 1)]; fs.mkdirSync('out/overlay', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.goto(`http://localhost:${process.env.PORT || 8126}/src/index.html?overlay=1`); await p.waitForFunction('window.__ready', null, { timeout: 180000 });
for (let f = a0; f <= a1; f++) { await p.evaluate(t => window.renderFrame(t), f / 30); await p.screenshot({ path: `out/overlay/f_${String(f).padStart(5, '0')}.png`, omitBackground: true }); }
await b.close(); console.log('overlay', a0, a1);
