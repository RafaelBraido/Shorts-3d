/// Dados de um PC controlado. Imutável e serializável.
class PcProfile {
  final String name;
  final String host;
  final int port;
  final String token;
  final String mac; // para Wake-on-LAN
  final String broadcast; // ex.: 192.168.0.255 (ou 255.255.255.255)
  final String plugOnUrl; // tomada inteligente (opcional)
  final String plugOffUrl;

  const PcProfile({
    this.name = 'Meu PC',
    this.host = '',
    this.port = 8765,
    this.token = '',
    this.mac = '',
    this.broadcast = '255.255.255.255',
    this.plugOnUrl = '',
    this.plugOffUrl = '',
  });

  bool get hasAgent => host.isNotEmpty && token.isNotEmpty;
  bool get canWake => mac.isNotEmpty;
  bool get hasPlug => plugOnUrl.isNotEmpty && plugOffUrl.isNotEmpty;

  PcProfile copyWith({
    String? name, String? host, int? port, String? token, String? mac,
    String? broadcast, String? plugOnUrl, String? plugOffUrl,
  }) =>
      PcProfile(
        name: name ?? this.name,
        host: host ?? this.host,
        port: port ?? this.port,
        token: token ?? this.token,
        mac: mac ?? this.mac,
        broadcast: broadcast ?? this.broadcast,
        plugOnUrl: plugOnUrl ?? this.plugOnUrl,
        plugOffUrl: plugOffUrl ?? this.plugOffUrl,
      );

  Map<String, dynamic> toJson() => {
        'name': name, 'host': host, 'port': port, 'token': token, 'mac': mac,
        'broadcast': broadcast, 'plugOnUrl': plugOnUrl, 'plugOffUrl': plugOffUrl,
      };

  factory PcProfile.fromJson(Map<String, dynamic> j) => PcProfile(
        name: j['name'] ?? 'Meu PC',
        host: j['host'] ?? '',
        port: j['port'] ?? 8765,
        token: j['token'] ?? '',
        mac: j['mac'] ?? '',
        broadcast: j['broadcast'] ?? '255.255.255.255',
        plugOnUrl: j['plugOnUrl'] ?? '',
        plugOffUrl: j['plugOffUrl'] ?? '',
      );
}
