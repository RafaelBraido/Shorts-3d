import 'dart:ui';
import 'package:flutter/material.dart';

/// Vidro fosco: BackdropFilter + camada translúcida + borda fina.
/// Implementação própria (sem pacote) para manter o app leve.
class Glass extends StatelessWidget {
  const Glass({
    super.key,
    required this.child,
    this.radius = 24,
    this.padding = const EdgeInsets.all(16),
    this.blur = 24,
    this.tint,
  });

  final Widget child;
  final double radius;
  final EdgeInsets padding;
  final double blur;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: tint ?? (dark ? const Color(0x2EFFFFFF) : const Color(0x99FFFFFF)),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(
              color: dark ? const Color(0x33FFFFFF) : const Color(0x80FFFFFF),
              width: 0.8,
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Fundo com gradiente suave e "manchas" de cor para o blur ter o que desfocar.
class AuroraBackground extends StatelessWidget {
  const AuroraBackground({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Stack(children: [
      Positioned.fill(
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: dark
                  ? const [Color(0xFF0B0B14), Color(0xFF14142B)]
                  : const [Color(0xFFEAF2FF), Color(0xFFF8EEFF)],
            ),
          ),
        ),
      ),
      Positioned(top: -80, left: -60, child: _blob(const Color(0xFF0A84FF), dark)),
      Positioned(bottom: -100, right: -80, child: _blob(const Color(0xFFBF5AF2), dark)),
      Positioned.fill(child: child),
    ]);
  }

  Widget _blob(Color c, bool dark) => Container(
        width: 280,
        height: 280,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: c.withValues(alpha: dark ? 0.35 : 0.28),
        ),
      );
}
