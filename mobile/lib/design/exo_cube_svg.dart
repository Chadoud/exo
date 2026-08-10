import 'package:flutter/material.dart';

import 'exo_cube_draw.dart';

/// Static Exo cube mark — same one-path stroke as boot ([ExoCubeDraw] at full progress).
///
/// Kept name for call sites; no PNG swap after the intro draw.
class ExoCubeSvg extends StatelessWidget {
  const ExoCubeSvg({
    super.key,
    this.size = 44,
  });

  final double size;

  @override
  Widget build(BuildContext context) {
    return ExoCubeDraw(progress: 1, size: size);
  }
}
