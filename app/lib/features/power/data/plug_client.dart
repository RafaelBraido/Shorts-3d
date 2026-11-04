import 'package:http/http.dart' as http;

/// Tomada inteligente via HTTP (Tasmota, Shelly, webhook do Home Assistant...).
/// Chamada direto do celular: funciona mesmo com o PC desligado.
class PlugClient {
  Future<void> switchTo(bool on, {required String onUrl, required String offUrl}) async {
    final res = await http.get(Uri.parse(on ? onUrl : offUrl)).timeout(const Duration(seconds: 5));
    if (res.statusCode >= 400) {
      throw Exception('Tomada respondeu HTTP ${res.statusCode}');
    }
  }
}
