import 'package:flutter/foundation.dart';

/// Tagged diagnostic logging for signaling/WebRTC flows.
///
/// Compiled out of release builds ([kDebugMode]); additionally silenceable in
/// debug builds with --dart-define=CALLSAFE_DEBUG_LOG=false.
const bool _enabled =
    bool.fromEnvironment('CALLSAFE_DEBUG_LOG', defaultValue: true);

void debugLog(String tag, String message) {
  if (kDebugMode && _enabled) {
    debugPrint('[$tag] $message');
  }
}
