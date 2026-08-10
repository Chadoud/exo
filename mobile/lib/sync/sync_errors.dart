/// Thrown when GO SYNC master key is missing — user must pair with desktop.
class SyncNotPairedException implements Exception {
  @override
  String toString() => 'SyncNotPairedException: pair with desktop in Settings first';
}

/// Access token missing or refresh failed.
class SyncAuthException implements Exception {
  SyncAuthException([this.message = 'auth expired']);
  final String message;

  @override
  String toString() => 'SyncAuthException: $message';
}

/// Network / transport failure talking to the cloud relay.
class SyncNetworkException implements Exception {
  SyncNetworkException([this.message = 'network failed']);
  final String message;

  @override
  String toString() => 'SyncNetworkException: $message';
}

/// Ciphertext could not be decrypted with the stored master key.
class SyncDecryptException implements Exception {
  @override
  String toString() => 'SyncDecryptException: decrypt failed';
}

/// Envelope schema is newer than this app supports — user must update.
class SyncSchemaException implements Exception {
  @override
  String toString() => 'SyncSchemaException: update app';
}
