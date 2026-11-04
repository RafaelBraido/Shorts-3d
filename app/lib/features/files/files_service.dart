import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../power/data/agent_client.dart';

class RemoteEntry {
  final String name;
  final bool dir;
  final int size;
  const RemoteEntry(this.name, this.dir, this.size);
}

/// Listagem via WebSocket; transferências via HTTP direto (sem nuvem).
class FilesService {
  FilesService(this._agent);
  final AgentClient _agent;

  Future<List<RemoteEntry>> list(String path) async {
    final ack = await _agent.request({'type': 'ls', 'path': path});
    return [
      for (final e in ack['entries'] as List)
        RemoteEntry(e['name'], e['dir'] == true, (e['size'] ?? 0) as int),
    ];
  }

  Uri _uri(String route, Map<String, String> q) {
    final p = _agent.profile!;
    return Uri(scheme: 'http', host: p.host, port: p.port, path: route, queryParameters: q);
  }

  /// Baixa para a pasta temporária e abre a folha de compartilhar/salvar.
  Future<void> downloadAndShare(String virtualPath, String name,
      {void Function(double)? onProgress}) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final req = await client.getUrl(_uri('/download', {'path': virtualPath}));
      req.headers.set('x-pcr-token', _agent.profile!.token);
      final res = await req.close();
      if (res.statusCode != 200) throw Exception('Download falhou (HTTP ${res.statusCode})');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$name');
      final sink = file.openWrite();
      var got = 0;
      await for (final chunk in res) {
        sink.add(chunk);
        got += chunk.length;
        if (res.contentLength > 0) onProgress?.call(got / res.contentLength);
      }
      await sink.close();
      await Share.shareXFiles([XFile(file.path)]);
    } finally {
      client.close();
    }
  }

  /// Escolhe um arquivo no celular e envia para [virtualDir] no PC.
  Future<String?> pickAndUpload(String virtualDir) async {
    final picked = await FilePicker.platform.pickFiles();
    final path = picked?.files.single.path;
    if (path == null) return null;
    final file = File(path);
    final name = picked!.files.single.name;
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final req = await client.putUrl(_uri('/upload', {'dir': virtualDir, 'name': name}));
      req.headers.set('x-pcr-token', _agent.profile!.token);
      req.contentLength = await file.length();
      await req.addStream(file.openRead());
      final res = await req.close();
      if (res.statusCode != 201) throw Exception('Envio falhou (HTTP ${res.statusCode})');
      return name;
    } finally {
      client.close();
    }
  }
}
