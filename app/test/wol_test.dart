import 'package:flutter_test/flutter_test.dart';
import 'package:pc_remote/features/power/data/wol_service.dart';
import 'package:pc_remote/features/power/presentation/net_utils.dart';

void main() {
  test('magic packet: 102 bytes, 6xFF + 16xMAC', () {
    final p = WolService.buildPacket('AA:BB:CC:DD:EE:FF');
    expect(p.length, 102);
    expect(p.sublist(0, 6), List.filled(6, 255));
    expect(p.sublist(96), [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
  });

  test('MAC inválido lança', () {
    expect(() => WolService.parseMac('zz'), throwsFormatException);
  });

  test('broadcast a partir de ip/máscara', () {
    expect(broadcastOf('192.168.0.10', '255.255.255.0'), '192.168.0.255');
    expect(broadcastOf('10.1.2.3', '255.255.0.0'), '10.1.255.255');
  });
}
