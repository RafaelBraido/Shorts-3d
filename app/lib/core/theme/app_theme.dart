import 'package:flutter/material.dart';

/// Tokens de design estilo Apple. Claro/escuro seguem o sistema.
class Palette {
  static const blue = Color(0xFF0A84FF);
  static const green = Color(0xFF30D158);
  static const orange = Color(0xFFFF9F0A);
  static const red = Color(0xFFFF453A);
  static const gray = Color(0xFF8E8E93);
}

class AppTheme {
  static ThemeData _base(Brightness b) {
    final dark = b == Brightness.dark;
    final scheme = ColorScheme.fromSeed(seedColor: Palette.blue, brightness: b);
    return ThemeData(
      useMaterial3: true,
      brightness: b,
      colorScheme: scheme,
      scaffoldBackgroundColor: Colors.transparent,
      // Fonte do sistema: San Francisco no iOS/macOS, Roboto no Android.
      textTheme: Typography.material2021(platform: TargetPlatform.iOS)
          .black
          .apply(
            bodyColor: dark ? Colors.white : const Color(0xFF1C1C1E),
            displayColor: dark ? Colors.white : const Color(0xFF1C1C1E),
          ),
      // Transição estilo iOS em todas as plataformas.
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: CupertinoPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.windows: CupertinoPageTransitionsBuilder(),
        TargetPlatform.linux: CupertinoPageTransitionsBuilder(),
      }),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? const Color(0x33FFFFFF) : const Color(0x14000000),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }

  static final light = _base(Brightness.light);
  static final dark = _base(Brightness.dark);
}
