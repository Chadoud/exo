import '../app/exo_config.dart';

String normalizePairingCloudOrigin(String raw) {
  final trimmed = raw.trim().replaceAll(RegExp(r'/$'), '');
  final uri = Uri.tryParse(trimmed);
  if (uri == null || !uri.hasScheme || uri.host.isEmpty) return '';
  if (uri.scheme != 'https') return '';
  final port = uri.hasPort ? ':${uri.port}' : '';
  return '${uri.scheme}://${uri.host.toLowerCase()}$port';
}

/// First-party sync API hosts only — pairing must not redirect bearer tokens elsewhere.
bool isAllowedPairingCloudUrl(String? raw) {
  if (raw == null || raw.trim().isEmpty) return true; // omit → keep app default
  final origin = normalizePairingCloudOrigin(raw);
  if (origin.isEmpty) return false;
  final allowed = <String>{
    normalizePairingCloudOrigin(ExoConfig.cloudUrl),
    'https://api.exosites.ch',
    'https://staging-api.exosites.ch',
  }..removeWhere((e) => e.isEmpty);
  return allowed.contains(origin);
}
