import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../call/call_manager.dart';
import '../../call/call_state.dart';
import '../../signaling/signaling_client.dart';
import '../../platform/platform.dart';
import '../../storage/call_history_service.dart';

// Server URL injected at build time via --dart-define=SIGNALING_SERVER_URL=ws://...
const _signalingUrl = String.fromEnvironment(
  'SIGNALING_SERVER_URL',
  defaultValue: 'ws://localhost:4000/ws',
);

// HTTP base URL for REST API — injected via --dart-define=API_BASE_URL=https://...
// Defaults to deriving from signaling URL (ws→http, strip /ws path).
const _apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: '',
);

// JWT token for authenticated REST calls — injected via --dart-define=API_AUTH_TOKEN=...
const _apiAuthToken = String.fromEnvironment(
  'API_AUTH_TOKEN',
  defaultValue: '',
);

/// Derive HTTP base URL from WebSocket URL when API_BASE_URL is not explicitly set.
String _resolvedApiBaseUrl() {
  if (_apiBaseUrl.isNotEmpty) return _apiBaseUrl;
  return _signalingUrl
      .replaceFirst(RegExp(r'^ws'), 'http')
      .replaceFirst(RegExp(r'/ws$'), '');
}

/// Fetch TURN credentials from the server.
/// Returns a list of ICE server configs, or null if unavailable (falls back to STUN-only).
Future<List<Map<String, dynamic>>?> _fetchTurnServers() async {
  if (_apiAuthToken.isEmpty) return null;
  final client = HttpClient();
  try {
    final uri = Uri.parse('${_resolvedApiBaseUrl()}/api/v1/turn/credentials');
    final req = await client.postUrl(uri);
    req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_apiAuthToken');
    req.headers.contentType = ContentType.json;
    req.write('{}');
    final resp = await req.close();
    if (resp.statusCode != 200) return null;
    final body = await resp.transform(utf8.decoder).join();
    final data = jsonDecode(body) as Map<String, dynamic>;
    return [
      {
        'urls': data['uris'],
        'username': data['username'],
        'credential': data['password'],
      }
    ];
  } catch (_) {
    return null;
  } finally {
    client.close();
  }
}

/// Signaling client provider
final signalingClientProvider = Provider<SignalingClient>((ref) {
  return SignalingClient(_signalingUrl);
});

/// WebRTC platform provider
final webrtcPlatformProvider = Provider<WebRTCPlatform>((ref) {
  return WebRTCMethodChannel();
});

/// Audio platform provider
final audioPlatformProvider = Provider<AudioPlatform>((ref) {
  return AudioMethodChannel();
});

/// Call history service provider
final callHistoryServiceProvider = Provider<CallHistoryService>((ref) {
  final service = CallHistoryService();
  // Initialize on first access
  service.initialize().run();
  return service;
});

/// Call manager provider
final callManagerProvider =
    StateNotifierProvider<CallManager, CallManagerState>((ref) {
  final signaling = ref.watch(signalingClientProvider);
  final webrtc = ref.watch(webrtcPlatformProvider);
  return CallManager(signaling, webrtc, fetchTurnServers: _fetchTurnServers);
});

/// Call history persistence listener
/// Watches call manager state and persists ended calls
final callHistoryPersistenceProvider = Provider<void>((ref) {
  final historyService = ref.watch(callHistoryServiceProvider);

  // Track previous history length to detect new entries
  int previousHistoryLength = 0;

  ref.listen<CallManagerState>(
    callManagerProvider,
    (previous, next) {
      // Check if a new call was added to history
      if (next.callHistory.length > previousHistoryLength) {
        final newCall = next.callHistory.last;

        // Persist the call
        historyService.saveCall(newCall).run().then((result) {
          result.fold(
            (error) => print('Failed to save call to history: $error'),
            (_) => print('Call saved to history: ${newCall.callAttemptId}'),
          );
        });

        previousHistoryLength = next.callHistory.length;
      }
    },
  );
});

/// Current call session provider
final currentCallProvider = Provider<CallSession?>((ref) {
  // Initialize history persistence listener
  ref.watch(callHistoryPersistenceProvider);
  return ref.watch(callManagerProvider).currentCall;
});

/// Is call active provider
final isCallActiveProvider = Provider<bool>((ref) {
  return ref.watch(callManagerProvider).hasActiveCall;
});

/// Can accept call provider
final canAcceptCallProvider = Provider<bool>((ref) {
  return ref.watch(callManagerProvider).canAcceptCall;
});

/// Audio muted state provider (local state for UI)
final audioMutedProvider = StateProvider<bool>((ref) => false);

/// Speaker enabled state provider (local state for UI)
final speakerEnabledProvider = StateProvider<bool>((ref) => false);

/// Camera enabled state provider (mirrors call session isVideoEnabled)
final cameraEnabledProvider = StateProvider<bool>((ref) => true);

/// Camera facing front (true) or back (false)
final cameraFacingFrontProvider = StateProvider<bool>((ref) => true);
