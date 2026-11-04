import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../power/data/agent_client.dart';

class ChatMessage {
  final String role; // user | assistant
  final String content;
  const ChatMessage(this.role, this.content);
}

class ChatState {
  final List<ChatMessage> messages;
  final bool streaming;
  final String? error;
  const ChatState({this.messages = const [], this.streaming = false, this.error});
}

/// Conversa com o Ollama do PC (via agent, em streaming).
class ChatCubit extends Cubit<ChatState> {
  ChatCubit(this._agent) : super(const ChatState()) {
    _sub = _agent.events.listen(_onEvent);
  }
  final AgentClient _agent;
  late final StreamSubscription _sub;
  int? _reqId;

  Future<void> send(String text) async {
    final t = text.trim();
    if (t.isEmpty || state.streaming) return;
    final history = [...state.messages, ChatMessage('user', t)];
    emit(ChatState(messages: [...history, const ChatMessage('assistant', '')], streaming: true));
    try {
      final recent = history.length > 20 ? history.sublist(history.length - 20) : history;
      final ack = await _agent.request({
        'type': 'chat',
        'messages': [for (final m in recent) {'role': m.role, 'content': m.content}],
      });
      _reqId = ack['id'] as int;
    } catch (e) {
      _finish('$e'.replaceFirst('Exception: ', ''));
    }
  }

  Future<void> stop() async {
    try { await _agent.request({'type': 'chat_stop'}); } catch (_) {}
    _finish(null);
  }

  void clear() => emit(const ChatState());

  void _onEvent(Map<String, dynamic> m) {
    if (m['type'] != 'chat_chunk' || m['id'] != _reqId) return;
    if (m['text'] != null) {
      final list = [...state.messages];
      final last = list.removeLast();
      list.add(ChatMessage('assistant', last.content + m['text']));
      emit(ChatState(messages: list, streaming: true));
    }
    if (m['done'] == true) _finish(m['error'] as String?);
  }

  void _finish(String? error) {
    _reqId = null;
    var list = state.messages;
    if (list.isNotEmpty && list.last.role == 'assistant' && list.last.content.isEmpty) {
      list = list.sublist(0, list.length - 1);
    }
    emit(ChatState(messages: list, error: error));
  }

  @override
  Future<void> close() {
    _sub.cancel();
    return super.close();
  }
}
