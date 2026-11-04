import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../core/widgets/glass.dart';
import '../../power/presentation/power_cubit.dart';
import '../domain/pc_profile.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final Map<String, TextEditingController> c;

  @override
  void initState() {
    super.initState();
    final p = context.read<PowerCubit>().profile;
    c = {
      'name': TextEditingController(text: p.name),
      'host': TextEditingController(text: p.host),
      'port': TextEditingController(text: '${p.port}'),
      'token': TextEditingController(text: p.token),
      'mac': TextEditingController(text: p.mac),
      'broadcast': TextEditingController(text: p.broadcast),
      'on': TextEditingController(text: p.plugOnUrl),
      'off': TextEditingController(text: p.plugOffUrl),
    };
  }

  @override
  void dispose() {
    for (final x in c.values) {
      x.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final cubit = context.read<PowerCubit>();
    final nav = Navigator.of(context);
    await cubit.saveProfile(PcProfile(
      name: c['name']!.text.trim(),
      host: c['host']!.text.trim(),
      port: int.tryParse(c['port']!.text) ?? 8765,
      token: c['token']!.text.trim(),
      mac: c['mac']!.text.trim(),
      broadcast: c['broadcast']!.text.trim().isEmpty ? '255.255.255.255' : c['broadcast']!.text.trim(),
      plugOnUrl: c['on']!.text.trim(),
      plugOffUrl: c['off']!.text.trim(),
    ));
    nav.pop();
  }

  Widget _field(String key, String label,
          {TextInputType? type, bool obscure = false, String? hint}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: c[key],
          keyboardType: type,
          obscureText: obscure,
          autocorrect: false,
          decoration: InputDecoration(labelText: label, hintText: hint),
        ),
      );

  Widget _section(String title, List<Widget> children) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Glass(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 12),
            ...children,
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return AuroraBackground(
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          title: const Text('Ajustes'),
          actions: [TextButton(onPressed: _save, child: const Text('Salvar'))],
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(padding: const EdgeInsets.all(20), children: [
              _section('Computador', [
                _field('name', 'Nome'),
                _field('host', 'IP do PC', type: TextInputType.number, hint: '192.168.0.10'),
                _field('port', 'Porta', type: TextInputType.number),
                _field('token', 'Token do agent', obscure: true),
              ]),
              _section('Wake-on-LAN', [
                _field('mac', 'MAC (preenchido sozinho na 1ª conexão)', hint: 'AA:BB:CC:DD:EE:FF'),
                _field('broadcast', 'Broadcast', hint: '192.168.0.255'),
              ]),
              _section('Tomada inteligente (opcional)', [
                _field('on', 'URL para ligar', type: TextInputType.url),
                _field('off', 'URL para desligar', type: TextInputType.url),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}
