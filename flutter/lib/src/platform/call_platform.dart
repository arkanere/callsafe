import 'package:fpdart/fpdart.dart';

/// Platform channel contract for call management
/// Handles CallKit/ConnectionService integration
abstract class CallPlatform {
  /// Show incoming call in system UI
  Task<Unit> showIncomingCall({
    required String callAttemptId,
    required String callerName,
    required bool isVideo,
  });

  /// Start outgoing call in system UI
  Task<Unit> startOutgoingCall({
    required String callAttemptId,
    required String recipientName,
    required bool isVideo,
  });

  /// End call and remove from system UI
  Task<Unit> endCall(String callAttemptId);

  /// Update call to active/connected state
  Task<Unit> setCallActive(String callAttemptId);

  /// Start foreground service (Android only, no-op on iOS)
  Task<Unit> startForegroundService({
    required String callAttemptId,
    required String callerName,
  });

  /// Stop foreground service (Android only, no-op on iOS)
  Task<Unit> stopForegroundService();

  /// Listen to system call events (answer, reject, disconnect, mute, speaker)
  void onCallEvent(
    void Function(CallEvent event) callback,
  );

  /// Dispose platform resources
  void dispose();
}

/// Call events from system UI
sealed class CallEvent {
  final String callAttemptId;
  const CallEvent(this.callAttemptId);
}

class CallAnsweredEvent extends CallEvent {
  const CallAnsweredEvent(super.callAttemptId);
}

class CallRejectedEvent extends CallEvent {
  const CallRejectedEvent(super.callAttemptId);
}

class CallDisconnectedEvent extends CallEvent {
  const CallDisconnectedEvent(super.callAttemptId);
}

class CallMuteChangedEvent extends CallEvent {
  final bool muted;
  const CallMuteChangedEvent(super.callAttemptId, this.muted);
}

class CallSpeakerChangedEvent extends CallEvent {
  final bool speaker;
  const CallSpeakerChangedEvent(super.callAttemptId, this.speaker);
}

/// Mock implementation for testing
class MockCallPlatform implements CallPlatform {
  void Function(CallEvent)? _eventCallback;

  @override
  Task<Unit> showIncomingCall({
    required String callAttemptId,
    required String callerName,
    required bool isVideo,
  }) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> startOutgoingCall({
    required String callAttemptId,
    required String recipientName,
    required bool isVideo,
  }) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> endCall(String callAttemptId) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> setCallActive(String callAttemptId) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> startForegroundService({
    required String callAttemptId,
    required String callerName,
  }) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> stopForegroundService() {
    return Task(() async => unit);
  }

  @override
  void onCallEvent(void Function(CallEvent event) callback) {
    _eventCallback = callback;
  }

  @override
  void dispose() {
    _eventCallback = null;
  }

  /// Simulate call event (for testing)
  void simulateCallEvent(CallEvent event) {
    _eventCallback?.call(event);
  }
}
