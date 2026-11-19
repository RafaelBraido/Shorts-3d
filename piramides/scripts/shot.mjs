// uso: node scripts/shot.mjs t1 t2 ... -> out/shots/t_<t>.jpg
import { createRequire } from 'module'; const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
import fs from 'fs';
const ts = process.argv.slice(2).map(Number); fs.mkdirSync('out/shots', { recursive: true });
const b = await chromium.launch({ args: process.env.GPU ? ['--use-gl=angle', '--use-angle=default', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
p.on('console', m => console.log('[page]', m.text())); p.on('pageerror', e => console.log('[err]', e.message));
await p.goto('http://localhost:8124/src/index.html'); await p.waitForFunction('window.__ready', null, { timeout: 120000 });
for (const t of ts) { const t0 = Date.now(); await p.evaluate(t => window.renderFrame(t), t); await p.screenshot({ path: `out/shots/t_${t}.jpg`, type: 'jpeg', quality: 90 }); console.log(t, Date.now() - t0, 'ms'); }
await b.close();
