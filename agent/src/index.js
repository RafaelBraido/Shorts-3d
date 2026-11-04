import { loadConfig, CONFIG_PATH } from './config.js';
import { createAgent, localMacs } from './server.js';

const cfg = loadConfig();
const agent = createAgent(cfg);
await agent.listen();

console.log('\n=== PC Remote Agent ===');
console.log(`Porta:  ${cfg.port}`);
console.log(`Token:  ${cfg.token}   (em ${CONFIG_PATH})`);
for (const n of localMacs()) console.log(`Rede:   ${n.iface}  ${n.ip}  MAC ${n.mac}`);
console.log('Use IP + token no app (Ajustes). Ctrl+C para sair.\n');

process.on('SIGINT', () => { agent.close(); process.exit(0); });
