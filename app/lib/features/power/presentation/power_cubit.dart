import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../settings/data/profile_store.dart';
import '../../settings/domain/pc_profile.dart';
import '../data/agent_client.dart';
import '../data/plug_client.dart';
import '../data/wol_service.dart';
import '../domain/power_state.dart';
import 'net_utils.dart';

class PowerCubit extends Cubit<PowerState> {
  PowerCubit(this._store, this._agent, this._wol, this._plug) : super(const PowerState()) {
    _profile = _store.load();
    _subs = [
      _agent.connection.listen(_onConnection),
      _agent.events.listen(_onEvent),
    ];
    _applyProfile();
  }

  final ProfileStore _store;
  final AgentClient _agent;
  final WolService _wol;
  final PlugClient _plug;
  late PcProfile _profile;
  late final List<StreamSubscription> _subs;

  bool _expectSleep = false; // agent avisou que vai suspender
  bool _cutAfterOff = false; // desligar e depois cortar a tomada
  Timer? _wakeTimeout;

  PcProfile get profile => _profile;

  // ───────── perfil
  Future<void> saveProfile(PcProfile p) async {
    _profile = p;
    await _store.save(p);
    _applyProfile();
  }

  void _applyProfile() {
    _wakeTimeout?.cancel();
    _expectSleep = false;
    if (_profile.hasAgent) {
      emit(state.copyWith(link: Link.connecting, clearPending: true));
      _agent.connect(_profile);
    } else {
      _agent.disconnect();
      // Sem agent ainda dá para ligar via WoL se houver MAC.
      emit(PowerState(link: _profile.canWake ? Link.offline : Link.unconfigured));
    }
  }

  // ───────── eventos do agent
  void _onConnection(bool up) {
    if (up) {
      _wakeTimeout?.cancel();
      _expectSleep = false;
      emit(state.copyWith(link: Link.online, clearNotice: true));
      return;
    }
    switch (state.link) {
      case Link.shuttingDown:
        emit(state.copyWith(
          link: _expectSleep ? Link.standby : Link.offline,
          clearPending: true,
        ));
        if (_cutAfterOff && !_expectSleep) {
          _cutAfterOff = false;
          // dá tempo do SO terminar de desligar antes de tirar a energia
          Timer(const Duration(seconds: 10), () => plugSwitch(false));
        }
      case Link.restarting || Link.waking:
        break; // continua aguardando voltar
      default:
        emit(state.copyWith(
          link: _expectSleep ? Link.standby : Link.offline,
          clearPending: true,
        ));
    }
  }

  void _onEvent(Map<String, dynamic> m) {
    switch (m['type']) {
      case 'hello':
        _learnNetwork(m);
        emit(state.copyWith(
          link: _linkFromAgent(m['state']),
          hostname: m['hostname'] ?? '',
          actions: List<String>.from(m['actions'] ?? const []),
        ));
      case 'status':
        emit(state.copyWith(
          cpu: m['cpu'], mem: m['memUsedPct'], uptimeSec: m['uptimeSec'],
        ));
      case 'state':
        final s = m['state'] as String?;
        if (s == 'sleeping') _expectSleep = true;
        final p = m['pending'] as Map<String, dynamic>?;
        emit(state.copyWith(
          link: _linkFromAgent(s),
          pending: p == null
              ? null
              : PendingAction(p['action'], DateTime.fromMillisecondsSinceEpoch(p['at'])),
          clearPending: p == null,
          notice: m['error'] != null ? 'Falhou: ${m['error']}' : null,
        ));
    }
  }

  Link _linkFromAgent(String? s) => switch (s) {
        'shutting_down' => Link.shuttingDown,
        'restarting' => Link.restarting,
        'sleeping' => Link.shuttingDown, // vira standby quando a conexão cair
        _ => Link.online,
      };

  /// Primeira conexão: guarda MAC e broadcast do PC para o Wake-on-LAN.
  void _learnNetwork(Map<String, dynamic> hello) {
    if (_profile.mac.isNotEmpty) return;
    final nics = (hello['nics'] as List?) ?? const [];
    if (nics.isEmpty) return;
    final n = nics.first as Map<String, dynamic>;
    saveProfile(_profile.copyWith(
      mac: n['mac'],
      broadcast: broadcastOf(n['ip'], n['netmask']) ?? _profile.broadcast,
    ));
  }

  // ───────── ações
  Future<void> wake() async {
    if (!_profile.canWake) {
      return _toast('Configure o MAC do PC em Ajustes.');
    }
    HapticFeedback.mediumImpact();
    try {
      // 3 envios: UDP não tem confirmação.
      for (var i = 0; i < 3; i++) {
        await _wol.send(_profile.mac, broadcast: _profile.broadcast);
        await Future<void>.delayed(const Duration(milliseconds: 300));
      }
      emit(state.copyWith(link: Link.waking, clearNotice: true));
      _wakeTimeout?.cancel();
      _wakeTimeout = Timer(const Duration(seconds: 90), () {
        if (state.link == Link.waking) {
          emit(state.copyWith(
            link: Link.offline,
            notice: 'O PC não respondeu. Confira WoL na BIOS/placa de rede e o cabo Ethernet.',
          ));
        }
      });
    } catch (e) {
      _toast('Falha ao enviar Wake-on-LAN: $e');
    }
  }

  Future<void> power(String action) async {
    HapticFeedback.heavyImpact();
    await _run(() => _agent.power(action));
  }

  Future<void> cancelPending() async {
    HapticFeedback.selectionClick();
    await _run(() => _agent.cancelPending());
    emit(state.copyWith(clearPending: true));
  }

  /// Desliga o Windows/macOS/Linux e, quando cair, corta a tomada.
  Future<void> shutdownAndCut() async {
    if (!_profile.hasPlug) return _toast('Configure a tomada inteligente em Ajustes.');
    _cutAfterOff = true;
    await power('shutdown');
  }

  Future<void> plugSwitch(bool on) async {
    if (!_profile.hasPlug) return _toast('Configure a tomada inteligente em Ajustes.');
    HapticFeedback.mediumImpact();
    await _run(() => _plug.switchTo(on,
        onUrl: _profile.plugOnUrl, offUrl: _profile.plugOffUrl));
    if (on) {
      _toast('Tomada ligada. Enviando Wake-on-LAN em 20 s…');
      Timer(const Duration(seconds: 20), wake);
    } else {
      _toast('Tomada desligada.');
    }
  }

  Future<void> _run(Future<void> Function() job) async {
    emit(state.copyWith(busy: true));
    try {
      await job();
    } catch (e) {
      _cutAfterOff = false;
      emit(state.copyWith(notice: '$e'.replaceFirst('Exception: ', '')));
    } finally {
      emit(state.copyWith(busy: false));
    }
  }

  void _toast(String msg) => emit(state.copyWith(notice: msg));
  void clearNotice() => emit(state.copyWith(clearNotice: true));

  @override
  Future<void> close() {
    for (final s in _subs) {
      s.cancel();
    }
    _wakeTimeout?.cancel();
    _agent.dispose();
    return super.close();
  }
}
