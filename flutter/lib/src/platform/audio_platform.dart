import 'package:fpdart/fpdart.dart';

/// Audio session category
enum AudioCategory {
  playback,
  record,
  playAndRecord,
  multiRoute,
}

/// Audio session mode
enum AudioMode {
  defaultMode,
  voiceChat,
  videoChat,
  gameChat,
}

/// Platform channel contract for audio management
/// Handles system audio sessions, CallKit integration, and ringtones
abstract class AudioPlatform {
  /// Configure audio session
  Task<Unit> configureAudioSession({
    required AudioCategory category,
    required AudioMode mode,
  });

  /// Start ringing (incoming call)
  Task<Unit> startRinging();

  /// Stop ringing
  Task<Unit> stopRinging();

  /// Start ringback tone (outgoing call)
  Task<Unit> startRingback();

  /// Stop ringback tone
  Task<Unit> stopRingback();

  /// Request microphone permissions
  Task<bool> requestMicrophonePermission();

  /// Request camera permissions
  Task<bool> requestCameraPermission();

  /// Set speaker mode
  Task<Unit> setSpeakerMode(bool enabled);

  /// Report incoming call to CallKit (iOS only)
  Task<Unit> reportIncomingCall({
    required String callId,
    required String handle,
    required bool hasVideo,
  });

  /// Report call ended to CallKit
  Task<Unit> reportCallEnded(String callId);

  /// Dispose platform resources
  void dispose();
}

/// Mock implementation for testing (Phase 2)
class MockAudioPlatform implements AudioPlatform {
  bool _isRinging = false;
  bool _isRingback = false;
  bool _speakerEnabled = false;

  @override
  Task<Unit> configureAudioSession({
    required AudioCategory category,
    required AudioMode mode,
  }) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> startRinging() {
    return Task(() async {
      _isRinging = true;
      return unit;
    });
  }

  @override
  Task<Unit> stopRinging() {
    return Task(() async {
      _isRinging = false;
      return unit;
    });
  }

  @override
  Task<Unit> startRingback() {
    return Task(() async {
      _isRingback = true;
      return unit;
    });
  }

  @override
  Task<Unit> stopRingback() {
    return Task(() async {
      _isRingback = false;
      return unit;
    });
  }

  @override
  Task<bool> requestMicrophonePermission() {
    return Task(() async => true);
  }

  @override
  Task<bool> requestCameraPermission() {
    return Task(() async => true);
  }

  @override
  Task<Unit> setSpeakerMode(bool enabled) {
    return Task(() async {
      _speakerEnabled = enabled;
      return unit;
    });
  }

  @override
  Task<Unit> reportIncomingCall({
    required String callId,
    required String handle,
    required bool hasVideo,
  }) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> reportCallEnded(String callId) {
    return Task(() async => unit);
  }

  @override
  void dispose() {
    _isRinging = false;
    _isRingback = false;
    _speakerEnabled = false;
  }

  // Test helpers
  bool get isRinging => _isRinging;
  bool get isRingback => _isRingback;
  bool get isSpeakerEnabled => _speakerEnabled;
}
