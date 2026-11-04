import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../../settings/domain/pc_profile.dart';

/// Conexão WebSocket resiliente com o agent do PC.
/// - reconecta sozinha a cada 3 s
/// - watchdog: o agent manda "status" a cada 3 s; sem nada por 9 s = PC caiu
///   (um corte de energia não fecha o TCP, então só o timeout detecta).
class AgentClient {
  final _events = StreamController<Map<String, dynamic>>.broadcast();
  final _connection = StreamController<bool>.broadcast();
  final _acks = <int, Completer<Map<String, dynamic>>>{};

  WebSocketChannel? _channel;
  StreamSubscription? _sub;
  Timer? _retry;
  Timer? _watchdog;
  DateTime _lastMsg = DateTime.now();
  PcProfile? _profile;
  bool _wanted = false;
  bool _connected = false;
  int _seq = 0;

  Stream<Map<String, dynamic>> get events => _events.stream;
  Stream<bool> get connection => _connection.stream;
  bool get isConnected => _connected;
  PcProfile? get profile => _profile;

  void connect(PcProfile p) {
    disconnect();
    if (!p.hasAgent) return;
    _profile = p;
    _wanted = true;
    _open();
  }

  void disconnect() {
    _wanted = false;
    _retry?.cancel();
    _teardown();
    _setConnected(false);
  }

  Future<void> _open() async {
    final p = _profile;
    if (p == null || !_wanted) return;
    _teardown();
    try {
      final ch = IOWebSocketChannel.connect(
        Uri.parse('ws://${p.host}:${p.port}'),
        headers: {'x-pcr-token': p.token},
        connectTimeout: const Duration(seconds: 4),
      );
      await ch.ready;
      if (!_wanted) {
        ch.sink.close();
        return;
      }
      _channel = ch;
      _lastMsg = DateTime.now();
      _sub = ch.stream.listen(_onData, onDone: _lost, onError: (_) => _lost());
      _watchdog = Timer.periodic(const Duration(seconds: 3), (_) {
        if (DateTime.now().difference(_lastMsg).inSeconds > 9) _lost();
      });
      _setConnected(true);
    } catch (_) {
      _lost();
    }
  }

  void _onData(dynamic raw) {
    _lastMsg = DateTime.now();
    final m = jsonDecode(raw as String) as Map<String, dynamic>;
    if (m['type'] == 'ack') {
      _acks.remove(m['id'])?.complete(m);
      return;
    }
    _events.add(m);
  }

  void _lost() {
    _teardown();
    _setConnected(false);
    if (_wanted) {
      _retry?.cancel();
      _retry = Timer(const Duration(seconds: 3), _open);
    }
  }

  void _teardown() {
    _watchdog?.cancel();
    _sub?.cancel();
    _channel?.sink.close();
    _sub = null;
    _channel = null;
    for (final c in _acks.values) {
      if (!c.isCompleted) c.completeError(StateError('conexão perdida'));
    }
    _acks.clear();
  }

  void _setConnected(bool v) {
    if (_connected == v) return;
    _connected = v;
    _connection.add(v);
  }

  /// Envia um comando e espera o ack do agent (5 s).
  Future<Map<String, dynamic>> request(Map<String, dynamic> msg) async {
    final ch = _channel;
    if (ch == null) throw StateError('Agent offline');
    final id = ++_seq;
    final c = Completer<Map<String, dynamic>>();
    _acks[id] = c;
    ch.sink.add(jsonEncode({...msg, 'id': id}));
    final ack = await c.future.timeout(const Duration(seconds: 5), onTimeout: () {
      _acks.remove(id);
      throw TimeoutException('sem resposta do agent');
    });
    if (ack['ok'] != true) throw Exception(ack['error'] ?? 'erro desconhecido');
    return ack;
  }

  Future<void> power(String action, {int delaySec = 5}) =>
      request({'type': 'power', 'action': action, 'delaySec': delaySec});

  Future<void> cancelPending() => request({'type': 'cancel'});

  void dispose() {
    disconnect();
    _events.close();
    _connection.close();
  }
}
