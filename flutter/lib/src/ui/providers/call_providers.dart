import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../call/call_manager.dart';
import '../../call/call_state.dart';
import '../../signaling/signaling_client.dart';
import '../../platform/webrtc_platform.dart';
import '../../platform/audio_platform.dart';
import '../../storage/call_history_service.dart';

/// Signaling client provider
final signalingClientProvider = Provider<SignalingClient>((ref) {
  // Using mock for Phase 1
  return MockSignalingClient();
});

/// WebRTC platform provider
final webrtcPlatformProvider = Provider<WebRTCPlatform>((ref) {
  // Using mock for Phase 1
  return MockWebRTCPlatform();
});

/// Audio platform provider
final audioPlatformProvider = Provider<AudioPlatform>((ref) {
  // Using mock for Phase 1
  return MockAudioPlatform();
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
  return CallManager(signaling, webrtc);
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
