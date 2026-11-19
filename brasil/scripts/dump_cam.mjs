// exporta a câmera (matriz do mundo, deslocamento e fov) de cada quadro -> out/cam_track.json
import { createRequire } from 'module'; const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
import fs from 'fs';
const tl = JSON.parse(fs.readFileSync('out/timeline.json')); const N = Math.ceil(tl.total * 30);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(`http://localhost:${process.env.PORT || 8126}/src/index.html?overlay=1`); await p.waitForFunction('window.__ready', null, { timeout: 180000 });
const out = await p.evaluate(n => { const r = []; for (let f = 0; f < n; f++) r.push(window.camAt(f / 30)); return r; }, N);
fs.writeFileSync('out/cam_track.json', JSON.stringify({ fps: 30, frames: out })); console.log('quadros', out.length); await b.close();
