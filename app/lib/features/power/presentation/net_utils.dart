/// Calcula o endereço de broadcast: ip | ~máscara.
String? broadcastOf(String ip, String mask) {
  try {
    final a = ip.split('.').map(int.parse).toList();
    final m = mask.split('.').map(int.parse).toList();
    if (a.length != 4 || m.length != 4) return null;
    return [for (var i = 0; i < 4; i++) (a[i] | (~m[i] & 0xff))].join('.');
  } catch (_) {
    return null;
  }
}
