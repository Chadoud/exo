import 'package:flutter/material.dart';

import 'package:exosites_mobile/design/exo_theme.dart';

/// The theme the app actually ships.
///
/// Widget tests must go through this instead of naming a theme directly —
/// otherwise a screen can keep passing under dark tokens long after the
/// product has flipped to light.
ThemeData productTheme() => ExoTheme.light();
