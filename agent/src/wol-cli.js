import { sendMagicPacket } from './wol.js';
const [mac, broadcast] = process.argv.slice(2);
if (!mac) { console.error('uso: npm run wol -- AA:BB:CC:DD:EE:FF [broadcast]'); process.exit(1); }
await sendMagicPacket(mac, broadcast ? { broadcast } : {});
console.log('magic packet enviado para', mac);
