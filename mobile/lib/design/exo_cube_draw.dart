import 'package:flutter/material.dart';

import 'exo_colors.dart';
import 'exo_cube_svg.dart';

/// Isometric Exo cube (matches `assets/exo_cube.svg` / favicon) — draws itself.
class ExoCubeDraw extends StatelessWidget {
  const ExoCubeDraw({
    super.key,
    required this.progress,
    this.size = 128,
    this.strokeColor = ExoColors.textPrimary,
    this.strokeWidth = 1.5,
  });

  /// 0 = blank, 1 = fully drawn.
  final double progress;
  final double size;
  final Color strokeColor;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Exo',
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _ExoCubePainter(
            progress: progress.clamp(0.0, 1.0),
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
          ),
        ),
      ),
    );
  }
}

/// Animated boot mark — stroke-draws the cube, crossfades to filled SVG, then completes.
class ExoCubeIntro extends StatefulWidget {
  const ExoCubeIntro({
    super.key,
    this.size = 168,
    this.duration = const Duration(milliseconds: 1400),
    this.crossfadeDuration = const Duration(milliseconds: 280),
    this.onComplete,
  });

  final double size;
  final Duration duration;
  final Duration crossfadeDuration;
  final VoidCallback? onComplete;

  @override
  State<ExoCubeIntro> createState() => _ExoCubeIntroState();
}

class _ExoCubeIntroState extends State<ExoCubeIntro> with TickerProviderStateMixin {
  late final AnimationController _drawController = AnimationController(
    vsync: this,
    duration: widget.duration,
  );
  late final AnimationController _fadeController = AnimationController(
    vsync: this,
    duration: widget.crossfadeDuration,
  );

  @override
  void initState() {
    super.initState();
    _drawController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _fadeController.forward();
      }
    });
    _fadeController.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        widget.onComplete?.call();
      }
    });
    _drawController.forward();
  }

  @override
  void dispose() {
    _drawController.dispose();
    _fadeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([_drawController, _fadeController]),
      builder: (context, _) {
        final t = Curves.easeInOutCubic.transform(_drawController.value);
        final fade = Curves.easeInOut.transform(_fadeController.value);
        return SizedBox(
          width: widget.size,
          height: widget.size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Opacity(
                opacity: 1 - fade,
                child: ExoCubeDraw(progress: t, size: widget.size),
              ),
              Opacity(
                opacity: fade,
                child: ExoCubeSvg(size: widget.size),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Full-screen boot: solid canvas + self-drawing cube (replaces spinner / favicon).
class ExoBootScreen extends StatelessWidget {
  const ExoBootScreen({
    super.key,
    required this.onIntroComplete,
  });

  final VoidCallback onIntroComplete;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ExoColors.bgPrimary,
      body: Center(
        child: ExoCubeIntro(onComplete: onIntroComplete),
      ),
    );
  }
}

class _ExoCubePainter extends CustomPainter {
  _ExoCubePainter({
    required this.progress,
    required this.strokeColor,
    required this.strokeWidth,
  });

  final double progress;
  final Color strokeColor;
  final double strokeWidth;

  /// Outer hexagon — drawn in the first ~58% of the animation.
  /// Geometry matches `assets/exo_cube.svg` (larger inscribed cube in 48×48).
  static Path outerPath() {
    return Path()
      ..moveTo(24, 5)
      ..lineTo(41, 15)
      ..lineTo(41, 33)
      ..lineTo(24, 43)
      ..lineTo(7, 33)
      ..lineTo(7, 15)
      ..close();
  }

  /// Internal Y edges — drawn in the remaining ~42%.
  static Path innerPath() {
    return Path()
      ..moveTo(24, 5)
      ..lineTo(24, 24)
      ..moveTo(7, 15)
      ..lineTo(24, 24)
      ..lineTo(41, 15)
      ..moveTo(24, 24)
      ..lineTo(24, 43);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.shortestSide / 48;
    canvas.scale(scale);

    // strokeWidth is logical px; divide so it does not thicken when size grows.
    final paint = Paint()
      ..color = strokeColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth / scale
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;

    const outerShare = 0.58;
    if (progress <= 0) return;

    if (progress < outerShare) {
      _drawPartial(canvas, outerPath(), progress / outerShare, paint);
      return;
    }

    _drawPartial(canvas, outerPath(), 1, paint);
    _drawPartial(canvas, innerPath(), (progress - outerShare) / (1 - outerShare), paint);
  }

  void _drawPartial(Canvas canvas, Path path, double t, Paint paint) {
    if (t <= 0) return;
    if (t >= 1) {
      canvas.drawPath(path, paint);
      return;
    }
    for (final metric in path.computeMetrics()) {
      canvas.drawPath(metric.extractPath(0, metric.length * t), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _ExoCubePainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.strokeColor != strokeColor ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

/// Path lengths in viewBox units — for unit tests.
double exoCubeOuterPathLength() {
  var total = 0.0;
  for (final m in _ExoCubePainter.outerPath().computeMetrics()) {
    total += m.length;
  }
  return total;
}

double exoCubeInnerPathLength() {
  var total = 0.0;
  for (final m in _ExoCubePainter.innerPath().computeMetrics()) {
    total += m.length;
  }
  return total;
}
