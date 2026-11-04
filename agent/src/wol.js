import dgram from 'node:dgram';

export function parseMac(mac) {
  const hex = String(mac).replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) throw new Error(`MAC inválido: ${mac}`);
  return Buffer.from(hex, 'hex');
}

/** Magic packet: 6 x 0xFF + 16 repetições do MAC (102 bytes). */
export function buildMagicPacket(mac) {
  const m = parseMac(mac);
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(m)]);
}

/** Envia o pacote por broadcast UDP nas portas 9 e 7. */
export function sendMagicPacket(mac, { broadcast = '255.255.255.255', ports = [9, 7] } = {}) {
  const packet = buildMagicPacket(mac);
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', (e) => { sock.close(); reject(e); });
    sock.bind(() => {
      sock.setBroadcast(true);
      let left = ports.length;
      for (const port of ports) {
        sock.send(packet, port, broadcast, (err) => {
          if (err) { sock.close(); return reject(err); }
          if (--left === 0) { sock.close(); resolve(); }
        });
      }
    });
  });
}
