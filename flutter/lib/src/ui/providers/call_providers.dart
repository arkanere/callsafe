import 'dart:convert';
import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../auth/auth_service.dart';
import '../../call/call_manager.dart';
import '../../call/call_state.dart';
import '../../protocol/protocol.dart';
import '../../signaling/signaling_client.dart';
import '../../platform/platform.dart';
import '../../storage/call_history_service.dart';
import 'permissions_providers.dart';

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

// SvelteKit dashboard origin (login + socket-token endpoints) —
// injected via --dart-define=DASHBOARD_BASE_URL=https://...
// Distinct from API_BASE_URL, which is the Elixir signaling server.
const _dashboardBaseUrl = String.fromEnvironment(
  'DASHBOARD_BASE_URL',
  defaultValue: 'http://localhost:5173',
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
        'urls': data['urls'],
        'username': data['username'],
        'credential': data['credential'],
      }
    ];
  } catch (_) {
    return null;
  } finally {
    client.close();
  }
}

/// Auth service provider (login, deviceId, socket-token exchange)
final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(_dashboardBaseUrl);
});

/// Whether the user is logged in. null = not yet determined (startup).
final authStateProvider = StateProvider<bool?>((ref) => null);

/// Push platform provider (FCM via native channel)
final pushPlatformProvider = Provider<PushPlatform>((ref) {
  final platform = PushMethodChannel();
  ref.onDispose(platform.dispose);
  return platform;
});

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

/// App startup: determine auth state and, when logged in, register the
/// device (push permission + FCM token + signaling connect). Safe to
/// re-run (invalidate) after login; SignalingClient.connect is a no-op
/// while already connected.
final appStartupProvider = FutureProvider<void>((ref) async {
  final auth = ref.watch(authServiceProvider);

  final loggedIn = await auth.isLoggedIn();
  ref.read(authStateProvider.notifier).state = loggedIn;
  if (!loggedIn) return;

  final push = ref.watch(pushPlatformProvider);
  final callManager = ref.read(callManagerProvider.notifier);
  final deviceId = await auth.getDeviceId();

  // Android 13+ needs the runtime POST_NOTIFICATIONS permission for the
  // full-screen incoming-call notification (FCM wake path).
  await ref
      .read(permissionsServiceProvider)
      .requestNotificationPermission()
      .run();
  await push.requestPermissions().run();

  String? pushToken;
  try {
    final token = await push.getToken().run();
    if (token.isNotEmpty) pushToken = token;
  } catch (_) {
    // No FCM available (e.g. emulator without Play services) — connect anyway.
  }

  Future<void> connect() => callManager
      .initialize(
        deviceType: DeviceType.mobile,
        deviceId: deviceId,
        getToken: auth.fetchSocketToken,
        pushToken: pushToken,
      )
      .run();

  // FCM wake path: a data push means a call is ringing. Ensure the socket is
  // connected; the server re-delivers call:incoming to newly connected
  // devices while the call rings, which drives the UI. The push payload
  // itself never drives UI directly.
  push.onNotification((data) {
    if (data['callAttemptId'] != null) {
      connect();
    }
  });

  // On token rotation, reconnect so device:connect carries the new pushToken.
  push.onTokenRefresh((newToken) async {
    pushToken = newToken;
    await ref.read(signalingClientProvider).disconnect().run();
    await connect();
  });

  // If the app was cold-started by a call push, this is redundant with the
  // connect below (the server re-delivers on connect) — just drain the flag.
  await push.getInitialMessage().run();

  await connect();
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
