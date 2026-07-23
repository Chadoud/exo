import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Static Exo cube from `assets/exo_cube.svg` (wordmark / post-boot).
/// Boot draw animation stays on [ExoCubeDraw] / [ExoCubeIntro].
///
/// No [ColorFilter.srcIn] — the asset has shaded face fills + light strokes.
class ExoCubeSvg extends StatelessWidget {
  const ExoCubeSvg({
    super.key,
    this.size = 44,
  });

  static const assetPath = 'assets/exo_cube.svg';

  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Exo',
      child: SvgPicture.asset(
        assetPath,
        width: size,
        height: size,
        fit: BoxFit.contain,
      ),
    );
  }
}
