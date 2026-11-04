import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../core/di/injection.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/glass.dart';
import '../power/domain/power_state.dart';
import '../power/presentation/power_cubit.dart';
import 'files_service.dart';

class FilesPage extends StatefulWidget {
  const FilesPage({super.key});
  @override
  State<FilesPage> createState() => _FilesPageState();
}

class _FilesPageState extends State<FilesPage> {
  final _svc = sl<FilesService>();
  String _path = '';
  List<RemoteEntry> _items = const [];
  bool _loading = false;
  String? _error;
  double? _progress;
  bool _loadedOnce = false;

  Future<void> _load(String path) async {
    setState(() { _loading = true; _error = null; });
    try {
      final items = await _svc.list(path);
      setState(() { _path = path; _items = items; });
    } catch (e) {
      setState(() => _error = '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String get _parent {
    final parts = _path.split('/').where((p) => p.isNotEmpty).toList();
    if (parts.length <= 1) return '';
    return '/${parts.sublist(0, parts.length - 1).join('/')}';
  }

  String _size(int b) {
    if (b < 1024) return '$b B';
    if (b < 1048576) return '${(b / 1024).toStringAsFixed(0)} KB';
    if (b < 1073741824) return '${(b / 1048576).toStringAsFixed(1)} MB';
    return '${(b / 1073741824).toStringAsFixed(2)} GB';
  }

  void _toast(String m) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(m), behavior: SnackBarBehavior.floating));

  Future<void> _open(RemoteEntry e) async {
    HapticFeedback.selectionClick();
    final full = '$_path/${e.name}';
    if (e.dir) return _load(full);
    setState(() => _progress = 0);
    try {
      await _svc.downloadAndShare(full, e.name, onProgress: (p) => setState(() => _progress = p));
    } catch (err) {
      _toast('$err'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _progress = null);
    }
  }

  Future<void> _upload() async {
    try {
      setState(() => _progress = -1); // indeterminado
      final name = await _svc.pickAndUpload(_path);
      if (name != null) {
        _toast('Enviado: $name');
        await _load(_path);
      }
    } catch (err) {
      _toast('$err'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _progress = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PowerCubit, PowerState>(
      buildWhen: (a, b) => (a.link == Link.online) != (b.link == Link.online),
      builder: (context, s) {
        final online = s.link == Link.online;
        if (online && !_loadedOnce) {
          _loadedOnce = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => _load(''));
        }
        if (!online) _loadedOnce = false;
        return SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                  child: Row(children: [
                    if (_path.isNotEmpty)
                      IconButton(
                          icon: const Icon(CupertinoIcons.chevron_back),
                          onPressed: () => _load(_parent)),
                    Expanded(
                      child: Text(_path.isEmpty ? 'Arquivos do PC' : _path,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                    if (_path.isNotEmpty)
                      IconButton(
                          icon: const Icon(CupertinoIcons.arrow_up_doc),
                          tooltip: 'Enviar do celular para esta pasta',
                          onPressed: _progress == null ? _upload : null),
                  ]),
                ),
                if (_progress != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: LinearProgressIndicator(value: _progress! >= 0 ? _progress : null),
                  ),
                Expanded(child: _body(online)),
              ]),
            ),
          ),
        );
      },
    );
  }

  Widget _body(bool online) {
    if (!online) return const _Empty('Conecte-se ao PC para ver os arquivos.');
    if (_loading && _items.isEmpty) return const Center(child: CupertinoActivityIndicator());
    if (_error != null) return _Empty(_error!);
    if (_items.isEmpty) return const _Empty('Pasta vazia.');
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: _items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final e = _items[i];
        return GestureDetector(
          onTap: () => _open(e),
          child: Glass(
            radius: 16,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              Icon(e.dir ? CupertinoIcons.folder_fill : CupertinoIcons.doc_fill,
                  color: e.dir ? Palette.blue : Palette.gray),
              const SizedBox(width: 12),
              Expanded(child: Text(e.name, overflow: TextOverflow.ellipsis)),
              if (!e.dir)
                Text(_size(e.size), style: const TextStyle(color: Palette.gray, fontSize: 12)),
            ]),
          ),
        );
      },
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Palette.gray)),
        ),
      );
}
