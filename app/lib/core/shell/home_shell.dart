import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../features/assistant/assistant_page.dart';
import '../../features/files/files_page.dart';
import '../../features/power/presentation/power_page.dart';
import '../widgets/glass.dart';

/// Casca com barra de abas de vidro. IndexedStack mantém o estado de cada aba.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _i = 0;
  static const _tabs = [
    (CupertinoIcons.power, 'Energia'),
    (CupertinoIcons.folder_fill, 'Arquivos'),
    (CupertinoIcons.sparkles, 'Assistente'),
  ];

  @override
  Widget build(BuildContext context) {
    return AuroraBackground(
      child: Scaffold(
        body: IndexedStack(
          index: _i,
          children: const [PowerPage(), FilesPage(), AssistantPage()],
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(40, 0, 40, 8),
            child: Glass(
              radius: 30,
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(children: [
                for (var k = 0; k < _tabs.length; k++)
                  Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        if (_i != k) HapticFeedback.selectionClick();
                        setState(() => _i = k);
                      },
                      child: AnimatedOpacity(
                        duration: const Duration(milliseconds: 200),
                        opacity: _i == k ? 1 : 0.45,
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Icon(_tabs[k].$1, size: 22),
                          Text(_tabs[k].$2, style: const TextStyle(fontSize: 10)),
                        ]),
                      ),
                    ),
                  ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
