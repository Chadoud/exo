import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'exo_colors.dart';

/// Brand cube stroke — matches `assets/exo_cube.svg` / PNG (`#6366F1`).
const Color kExoCubeStroke = Color(0xFF6366F1);

/// Self-drawing wireframe cube (boot + tests). Path from `exo_cube.svg` `#cube-draw-path`.
class ExoCubeDraw extends StatelessWidget {
  const ExoCubeDraw({
    super.key,
    required this.progress,
    this.size = 128,
    this.strokeColor = kExoCubeStroke,
    this.strokeWidth = 2.5,
  });

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
          painter: _ExoCubeStrokePainter(
            progress: progress.clamp(0.0, 1.0),
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
          ),
        ),
      ),
    );
  }
}

/// Boot: purple wireframe draws itself along the brand one-path, then holds.
///
/// Completes once; parent rebuilds (e.g. hydrate) must not remount this widget
/// or the stroke will restart — keep a stable [Key] on [ExoBootScreen].
class ExoCubeIntro extends StatefulWidget {
  const ExoCubeIntro({
    super.key,
    this.size = 168,
    this.duration = const Duration(milliseconds: 1400),
    this.settleDuration = const Duration(milliseconds: 280),
    this.onComplete,
  });

  final double size;
  final Duration duration;
  final Duration settleDuration;
  final VoidCallback? onComplete;

  @override
  State<ExoCubeIntro> createState() => _ExoCubeIntroState();
}

class _ExoCubeIntroState extends State<ExoCubeIntro> with SingleTickerProviderStateMixin {
  late final AnimationController _drawController = AnimationController(
    vsync: this,
    duration: widget.duration,
  );
  bool _notifiedComplete = false;

  @override
  void initState() {
    super.initState();
    unawaited(_runIntro());
  }

  Future<void> _runIntro() async {
    await _drawController.forward();
    await Future<void>.delayed(widget.settleDuration);
    if (!mounted || _notifiedComplete) return;
    _notifiedComplete = true;
    widget.onComplete?.call();
  }

  @override
  void dispose() {
    _drawController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _drawController,
      builder: (context, _) {
        final t = Curves.easeInOutCubic.transform(_drawController.value);
        return ExoCubeDraw(progress: t, size: widget.size);
      },
    );
  }
}

/// Full-screen boot: solid canvas + brand cube drawing itself.
class ExoBootScreen extends StatelessWidget {
  const ExoBootScreen({
    super.key,
    required this.onIntroComplete,
    this.introDuration = const Duration(milliseconds: 1400),
    this.settleDuration = const Duration(milliseconds: 280),
  });

  final VoidCallback onIntroComplete;
  final Duration introDuration;
  final Duration settleDuration;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ExoColors.bgPrimary,
      body: Center(
        child: ExoCubeIntro(
          duration: introDuration,
          settleDuration: settleDuration,
          onComplete: onIntroComplete,
        ),
      ),
    );
  }
}

/// ViewBox + stroke path from `assets/exo_cube.svg`.
abstract final class _ExoCubePaths {
  static const vbW = 133.0;
  static const vbH = 150.0;

  /// Continuous one-path outline (`#cube-draw-path`).
  static Path get draw => Path()
    ..moveTo(74.0402, 3.06177)
    ..lineTo(8.12761, 40.2283)
    ..lineTo(2.6107, 108.464)
    ..lineTo(74.9112, 72.4587)
    ..lineTo(74.0402, 3.06177)
    ..lineTo(125.144, 49.2296)
    ..lineTo(130.371, 116.884)
    ..lineTo(60.3931, 146.792)
    ..lineTo(2.6107, 108.464)
    ..lineTo(74.9112, 72.4587)
    ..lineTo(130.371, 116.884);
}

class _ExoCubeStrokePainter extends CustomPainter {
  _ExoCubeStrokePainter({
    required this.progress,
    required this.strokeColor,
    required this.strokeWidth,
  });

  final double progress;
  final Color strokeColor;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;

    final scale = math.min(size.width / _ExoCubePaths.vbW, size.height / _ExoCubePaths.vbH);
    final dx = (size.width - _ExoCubePaths.vbW * scale) / 2;
    final dy = (size.height - _ExoCubePaths.vbH * scale) / 2;
    canvas.translate(dx, dy);
    canvas.scale(scale);

    final stroke = Paint()
      ..color = strokeColor
      ..style = PaintingStyle.stroke
      // Match SVG `vector-effect="non-scaling-stroke"` — constant screen weight.
      ..strokeWidth = strokeWidth / scale
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;

    final path = _ExoCubePaths.draw;
    if (progress >= 1) {
      canvas.drawPath(path, stroke);
      return;
    }
    for (final metric in path.computeMetrics()) {
      canvas.drawPath(metric.extractPath(0, metric.length * progress), stroke);
    }
  }

  @override
  bool shouldRepaint(covariant _ExoCubeStrokePainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.strokeColor != strokeColor ||
        oldDelegate.strokeWidth != strokeWidth;
  }
}

double exoCubeDrawPathLength() {
  var total = 0.0;
  for (final m in _ExoCubePaths.draw.computeMetrics()) {
    total += m.length;
  }
  return total;
}

/// Kept for older tests that split outer/inner; both map to the one-path length.
double exoCubeOuterPathLength() => exoCubeDrawPathLength();

double exoCubeInnerPathLength() => exoCubeDrawPathLength();
