import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = process.env.PCR_CONFIG || path.join(dir, '..', 'config.json');

const defaults = () => ({
  port: 8765,
  host: '0.0.0.0',
  token: crypto.randomBytes(24).toString('hex'),
  // Atrasa a ação para a resposta chegar ao celular e permitir "Cancelar".
  defaultDelaySec: 5,
  // Ações permitidas. Remova "shutdown" etc. se quiser restringir.
  allowedActions: ['shutdown', 'restart', 'sleep', 'hibernate', 'lock'],
  // Tomada inteligente opcional (HTTP genérico: Tasmota, Shelly, Home Assistant...).
  plug: null,
});

export function loadConfig() {
  let cfg;
  if (fs.existsSync(CONFIG_PATH)) {
    cfg = { ...defaults(), ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } else {
    cfg = defaults();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    console.log(`[config] criado ${CONFIG_PATH}`);
  }
  if (process.env.PCR_PORT) cfg.port = Number(process.env.PCR_PORT);
  if (process.env.PCR_TOKEN) cfg.token = process.env.PCR_TOKEN;
  return cfg;
}
