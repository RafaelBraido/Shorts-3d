import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/glass.dart';
import '../../settings/presentation/settings_page.dart';
import '../domain/power_state.dart';
import 'power_cubit.dart';

class PowerPage extends StatelessWidget {
  const PowerPage({super.key});

  @override
  Widget build(BuildContext context) {
    return AuroraBackground(
      child: Scaffold(
        body: SafeArea(
          child: BlocConsumer<PowerCubit, PowerState>(
            listenWhen: (a, b) => a.notice != b.notice && b.notice != null,
            listener: (context, s) {
              ScaffoldMessenger.of(context)
                ..hideCurrentSnackBar()
                ..showSnackBar(SnackBar(
                  content: Text(s.notice!),
                  behavior: SnackBarBehavior.floating,
                ));
              context.read<PowerCubit>().clearNotice();
            },
            builder: (context, s) => Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                  children: [
                    _Header(s: s),
                    const SizedBox(height: 28),
                    _PowerButton(s: s),
                    const SizedBox(height: 12),
                    _StatusLabel(s: s),
                    const SizedBox(height: 24),
                    if (s.pending != null) _PendingBanner(p: s.pending!),
                    _SecondaryActions(s: s),
                    const SizedBox(height: 16),
                    if (s.link == Link.online) _Stats(s: s),
                    if (context.read<PowerCubit>().profile.hasPlug) ...[
                      const SizedBox(height: 16),
                      _PlugCard(s: s),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── cabeçalho
class _Header extends StatelessWidget {
  const _Header({required this.s});
  final PowerState s;

  @override
  Widget build(BuildContext context) {
    final p = context.read<PowerCubit>().profile;
    return Row(children: [
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(p.name,
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5)),
          if (s.hostname.isNotEmpty)
            Text(s.hostname, style: const TextStyle(color: Palette.gray)),
        ]),
      ),
      IconButton(
        icon: const Icon(CupertinoIcons.settings),
        onPressed: () {
          HapticFeedback.selectionClick();
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsPage()));
        },
      ),
    ]);
  }
}

// ───────────────────────── botão principal
class _PowerButton extends StatelessWidget {
  const _PowerButton({required this.s});
  final PowerState s;

  Color get _color => switch (s.link) {
        Link.online => Palette.green,
        Link.standby => Palette.orange,
        Link.waking || Link.connecting || Link.shuttingDown || Link.restarting => Palette.blue,
        _ => Palette.gray,
      };

  bool get _transitional =>
      s.link == Link.waking ||
      s.link == Link.connecting ||
      s.link == Link.shuttingDown ||
      s.link == Link.restarting;

  Future<void> _onTap(BuildContext context) async {
    final cubit = context.read<PowerCubit>();
    switch (s.link) {
      case Link.online:
        final ok = await _confirm(context, 'Desligar o PC?',
            'O computador desliga em alguns segundos. Você poderá cancelar.', 'Desligar');
        if (ok) cubit.power('shutdown');
      case Link.offline || Link.standby || Link.unconfigured:
        cubit.wake();
      default:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: GestureDetector(
        onTap: _transitional ? null : () => _onTap(context),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 350),
          curve: Curves.easeOutCubic,
          width: 168,
          height: 168,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: _color.withValues(alpha: 0.45),
                blurRadius: s.link == Link.online ? 48 : 24,
                spreadRadius: s.link == Link.online ? 4 : 0,
              ),
            ],
          ),
          child: ClipOval(
            child: Glass(
              radius: 84,
              padding: EdgeInsets.zero,
              tint: _color.withValues(alpha: 0.28),
              child: Center(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: _transitional
                      ? const CupertinoActivityIndicator(radius: 18, key: ValueKey('spin'))
                      : Icon(CupertinoIcons.power,
                          key: ValueKey(s.link), size: 72, color: _color),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusLabel extends StatelessWidget {
  const _StatusLabel({required this.s});
  final PowerState s;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<PowerCubit>();
    final (text, hint) = switch (s.link) {
      Link.unconfigured => ('Não configurado', 'Abra Ajustes e informe IP e token'),
      Link.connecting => ('Conectando…', ''),
      Link.online => ('Ligado', 'Toque para desligar'),
      Link.standby => ('Em espera', 'Toque para acordar'),
      Link.offline => (
          'Desligado',
          cubit.profile.canWake ? 'Toque para ligar' : 'Configure o MAC em Ajustes'
        ),
      Link.waking => ('Ligando…', 'Pacote Wake-on-LAN enviado'),
      Link.shuttingDown => ('Desligando…', ''),
      Link.restarting => ('Reiniciando…', ''),
    };
    return Column(children: [
      Text(text,
          style: Theme.of(context)
              .textTheme
              .titleLarge
              ?.copyWith(fontWeight: FontWeight.w600)),
      if (hint.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(hint, style: const TextStyle(color: Palette.gray)),
        ),
    ]);
  }
}

// ───────────────────────── contagem regressiva
class _PendingBanner extends StatefulWidget {
  const _PendingBanner({required this.p});
  final PendingAction p;
  @override
  State<_PendingBanner> createState() => _PendingBannerState();
}

class _PendingBannerState extends State<_PendingBanner> {
  late final Timer _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _t.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = widget.p.at.difference(DateTime.now()).inSeconds.clamp(0, 999);
    final label = const {
      'shutdown': 'Desligando',
      'restart': 'Reiniciando',
      'sleep': 'Suspendendo',
      'hibernate': 'Hibernando',
      'lock': 'Bloqueando',
    }[widget.p.action] ?? widget.p.action;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Glass(
        tint: Palette.orange.withValues(alpha: 0.25),
        child: Row(children: [
          Expanded(child: Text('$label em ${left}s', style: const TextStyle(fontWeight: FontWeight.w600))),
          CupertinoButton(
            padding: EdgeInsets.zero,
            onPressed: () => context.read<PowerCubit>().cancelPending(),
            child: const Text('Cancelar'),
          ),
        ]),
      ),
    );
  }
}

// ───────────────────────── ações secundárias
class _SecondaryActions extends StatelessWidget {
  const _SecondaryActions({required this.s});
  final PowerState s;

  @override
  Widget build(BuildContext context) {
    final enabled = s.link == Link.online && s.pending == null && !s.busy;
    Widget tile(String action, IconData icon, String label, {bool confirm = false}) {
      final supported = s.actions.contains(action);
      return Expanded(
        child: Opacity(
          opacity: enabled && supported ? 1 : 0.4,
          child: GestureDetector(
            onTap: enabled && supported
                ? () async {
                    final cubit = context.read<PowerCubit>();
                    if (confirm &&
                        !await _confirm(context, '$label?', 'Tem certeza?', label)) {
                      return;
                    }
                    cubit.power(action);
                  }
                : null,
            child: Glass(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Column(children: [
                Icon(icon, size: 26),
                const SizedBox(height: 6),
                Text(label, style: const TextStyle(fontSize: 13)),
              ]),
            ),
          ),
        ),
      );
    }

    return Row(children: [
      tile('sleep', CupertinoIcons.moon_fill, 'Suspender'),
      const SizedBox(width: 12),
      tile('restart', CupertinoIcons.arrow_clockwise, 'Reiniciar', confirm: true),
      const SizedBox(width: 12),
      tile('lock', CupertinoIcons.lock_fill, 'Bloquear'),
    ]);
  }
}

// ───────────────────────── métricas
class _Stats extends StatelessWidget {
  const _Stats({required this.s});
  final PowerState s;

  String _uptime() {
    final u = s.uptimeSec ?? 0;
    final d = u ~/ 86400, h = (u % 86400) ~/ 3600, m = (u % 3600) ~/ 60;
    return d > 0 ? '${d}d ${h}h' : '${h}h ${m}m';
  }

  @override
  Widget build(BuildContext context) {
    Widget chip(String label, String value) => Expanded(
          child: Column(children: [
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(color: Palette.gray, fontSize: 12)),
          ]),
        );
    return Glass(
      child: Row(children: [
        chip('CPU', '${s.cpu ?? '–'}%'),
        chip('RAM', '${s.mem ?? '–'}%'),
        chip('Ligado há', _uptime()),
      ]),
    );
  }
}

// ───────────────────────── tomada inteligente
class _PlugCard extends StatelessWidget {
  const _PlugCard({required this.s});
  final PowerState s;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<PowerCubit>();
    return Glass(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(children: [
          Icon(CupertinoIcons.bolt_fill, size: 18, color: Palette.orange),
          SizedBox(width: 8),
          Text('Tomada inteligente', style: TextStyle(fontWeight: FontWeight.w600)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: CupertinoButton.filled(
              padding: const EdgeInsets.symmetric(vertical: 12),
              onPressed: s.busy ? null : () => cubit.plugSwitch(true),
              child: const Text('Ligar tomada', style: TextStyle(fontSize: 14)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: CupertinoButton(
              padding: const EdgeInsets.symmetric(vertical: 12),
              color: Palette.red.withValues(alpha: 0.85),
              onPressed: s.busy
                  ? null
                  : () async {
                      final online = s.link == Link.online;
                      final ok = await _confirm(
                          context,
                          online ? 'Desligar e cortar energia?' : 'Cortar a energia?',
                          online
                              ? 'Desliga o PC com segurança e corta a tomada em seguida.'
                              : 'Cortar a energia de um PC ligado pode corromper arquivos.',
                          'Confirmar');
                      if (!ok) return;
                      online ? cubit.shutdownAndCut() : cubit.plugSwitch(false);
                    },
              child: const Text('Desligar tudo', style: TextStyle(fontSize: 14)),
            ),
          ),
        ]),
      ]),
    );
  }
}

Future<bool> _confirm(BuildContext context, String title, String msg, String action) async {
  HapticFeedback.selectionClick();
  final r = await showCupertinoDialog<bool>(
    context: context,
    builder: (ctx) => CupertinoAlertDialog(
      title: Text(title),
      content: Text(msg),
      actions: [
        CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
        CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(action)),
      ],
    ),
  );
  return r ?? false;
}
