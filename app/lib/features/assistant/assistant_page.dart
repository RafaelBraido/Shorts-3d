import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:speech_to_text/speech_to_text.dart';
import '../../core/di/injection.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/glass.dart';
import 'chat_cubit.dart';

class AssistantPage extends StatefulWidget {
  const AssistantPage({super.key});
  @override
  State<AssistantPage> createState() => _AssistantPageState();
}

class _AssistantPageState extends State<AssistantPage> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  final _stt = SpeechToText();
  bool _listening = false;

  Future<void> _mic() async {
    HapticFeedback.mediumImpact();
    if (_listening) {
      await _stt.stop();
      return setState(() => _listening = false);
    }
    final ok = await _stt.initialize(onStatus: (s) {
      if (s == 'done' || s == 'notListening') setState(() => _listening = false);
    });
    if (!ok) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Reconhecimento de voz indisponível ou sem permissão.')));
      }
      return;
    }
    setState(() => _listening = true);
    await _stt.listen(
      localeId: 'pt_BR',
      onResult: (r) => _text.text = r.recognizedWords,
    );
  }

  void _send(ChatCubit c) {
    final t = _text.text;
    _text.clear();
    c.send(t);
  }

  @override
  void dispose() {
    _stt.cancel();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cubit = sl<ChatCubit>();
    return BlocProvider.value(
      value: cubit,
      child: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 8, 8),
                child: Row(children: [
                  Expanded(
                    child: Text('Assistente',
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                  ),
                  IconButton(
                      icon: const Icon(CupertinoIcons.trash),
                      tooltip: 'Limpar conversa',
                      onPressed: cubit.clear),
                ]),
              ),
              Expanded(
                child: BlocConsumer<ChatCubit, ChatState>(
                  listener: (_, __) => WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
                  }),
                  builder: (context, s) {
                    if (s.messages.isEmpty) {
                      return Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Text(
                              s.error ??
                                  'Pergunte qualquer coisa.\nRoda no seu PC via Ollama — nada vai para a nuvem.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Palette.gray)),
                        ),
                      );
                    }
                    return ListView(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                      children: [
                        for (final m in s.messages) _Bubble(m),
                        if (s.error != null)
                          Padding(
                            padding: const EdgeInsets.all(8),
                            child: Text(s.error!, style: const TextStyle(color: Palette.red)),
                          ),
                      ],
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                child: BlocBuilder<ChatCubit, ChatState>(
                  builder: (context, s) => Glass(
                    radius: 28,
                    padding: const EdgeInsets.fromLTRB(8, 4, 4, 4),
                    child: Row(children: [
                      IconButton(
                        icon: Icon(_listening ? CupertinoIcons.mic_fill : CupertinoIcons.mic,
                            color: _listening ? Palette.red : null),
                        onPressed: _mic,
                      ),
                      Expanded(
                        child: TextField(
                          controller: _text,
                          minLines: 1,
                          maxLines: 4,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _send(cubit),
                          decoration: const InputDecoration(
                            hintText: 'Mensagem',
                            filled: false,
                            border: InputBorder.none,
                          ),
                        ),
                      ),
                      IconButton(
                        icon: Icon(
                          s.streaming ? CupertinoIcons.stop_circle_fill : CupertinoIcons.arrow_up_circle_fill,
                          size: 32,
                          color: Palette.blue,
                        ),
                        onPressed: s.streaming ? cubit.stop : () => _send(cubit),
                      ),
                    ]),
                  ),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.m);
  final ChatMessage m;
  @override
  Widget build(BuildContext context) {
    final mine = m.role == 'user';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        constraints: const BoxConstraints(maxWidth: 340),
        child: Glass(
          radius: 20,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          tint: mine ? Palette.blue.withValues(alpha: 0.55) : null,
          child: SelectableText(
            m.content.isEmpty ? '…' : m.content,
            style: TextStyle(color: mine ? Colors.white : null, height: 1.35),
          ),
        ),
      ),
    );
  }
}
