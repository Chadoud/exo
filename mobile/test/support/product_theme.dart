import 'package:flutter/material.dart';

import 'package:exosites_mobile/design/exo_theme.dart';

/// The theme the app actually ships (desktop light tokens).
///
/// Widget tests must go through this instead of naming a theme directly.
ThemeData productTheme() => ExoTheme.product();
