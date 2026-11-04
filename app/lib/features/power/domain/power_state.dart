enum Link { unconfigured, connecting, online, standby, offline, waking, shuttingDown, restarting }

class PendingAction {
  final String action;
  final DateTime at;
  const PendingAction(this.action, this.at);
}

class PowerState {
  final Link link;
  final String hostname;
  final int? cpu;
  final int? mem;
  final int? uptimeSec;
  final List<String> actions;
  final PendingAction? pending;
  final String? notice; // mensagem transitória (erro/sucesso)
  final bool busy;

  const PowerState({
    this.link = Link.unconfigured,
    this.hostname = '',
    this.cpu,
    this.mem,
    this.uptimeSec,
    this.actions = const [],
    this.pending,
    this.notice,
    this.busy = false,
  });

  PowerState copyWith({
    Link? link, String? hostname, int? cpu, int? mem, int? uptimeSec,
    List<String>? actions, PendingAction? pending, bool clearPending = false,
    String? notice, bool clearNotice = false, bool? busy,
  }) =>
      PowerState(
        link: link ?? this.link,
        hostname: hostname ?? this.hostname,
        cpu: cpu ?? this.cpu,
        mem: mem ?? this.mem,
        uptimeSec: uptimeSec ?? this.uptimeSec,
        actions: actions ?? this.actions,
        pending: clearPending ? null : (pending ?? this.pending),
        notice: clearNotice ? null : (notice ?? this.notice),
        busy: busy ?? this.busy,
      );
}
