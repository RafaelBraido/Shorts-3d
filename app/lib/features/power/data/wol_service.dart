import 'dart:io';
import 'dart:typed_data';

/// Wake-on-LAN: envia o "magic packet" por broadcast UDP (portas 9 e 7).
/// Roda no celular e no desktop; só funciona dentro da mesma rede local.
class WolService {
  static Uint8List parseMac(String mac) {
    final hex = mac.replaceAll(RegExp(r'[^0-9a-fA-F]'), '');
    if (hex.length != 12) throw FormatException('MAC inválido: $mac');
    return Uint8List.fromList(
        [for (var i = 0; i < 12; i += 2) int.parse(hex.substring(i, i + 2), radix: 16)]);
  }

  static Uint8List buildPacket(String mac) {
    final m = parseMac(mac);
    final b = BytesBuilder()..add(List.filled(6, 0xff));
    for (var i = 0; i < 16; i++) {
      b.add(m);
    }
    return b.toBytes(); // 102 bytes
  }

  Future<void> send(String mac, {String broadcast = '255.255.255.255'}) async {
    final packet = buildPacket(mac);
    final targets = {broadcast, '255.255.255.255'};
    final socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
    try {
      socket.broadcastEnabled = true;
      for (final t in targets) {
        for (final port in const [9, 7]) {
          socket.send(packet, InternetAddress(t), port);
        }
      }
    } finally {
      socket.close();
    }
  }
}
