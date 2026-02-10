import 'package:flutter/services.dart';
import 'package:fpdart/fpdart.dart';
import 'audio_platform.dart';

/// MethodChannel implementation of AudioPlatform
/// Phase 1: Pure channel plumbing - routes calls to native Android/iOS
/// Phase 2: Native side will integrate audio session and CallKit
class AudioMethodChannel implements AudioPlatform {
  static const MethodChannel _channel = MethodChannel('com.callsafe.audio');

  @override
  Task<Unit> configureAudioSession({
    required AudioCategory category,
    required AudioMode mode,
  }) {
    return Task(() async {
      await _channel.invokeMethod('configureAudioSession', {
        'category': category.name,
        'mode': mode.name,
      });
      return unit;
    });
  }

  @override
  Task<Unit> startRinging() {
    return Task(() async {
      await _channel.invokeMethod('startRinging');
      return unit;
    });
  }

  @override
  Task<Unit> stopRinging() {
    return Task(() async {
      await _channel.invokeMethod('stopRinging');
      return unit;
    });
  }

  @override
  Task<Unit> startRingback() {
    return Task(() async {
      await _channel.invokeMethod('startRingback');
      return unit;
    });
  }

  @override
  Task<Unit> stopRingback() {
    return Task(() async {
      await _channel.invokeMethod('stopRingback');
      return unit;
    });
  }

  @override
  Task<bool> requestMicrophonePermission() {
    return Task(() async {
      final result = await _channel.invokeMethod<bool>('requestMicrophonePermission');
      return result ?? false;
    });
  }

  @override
  Task<bool> requestCameraPermission() {
    return Task(() async {
      final result = await _channel.invokeMethod<bool>('requestCameraPermission');
      return result ?? false;
    });
  }

  @override
  Task<Unit> setSpeakerMode(bool enabled) {
    return Task(() async {
      await _channel.invokeMethod('setSpeakerMode', {
        'enabled': enabled,
      });
      return unit;
    });
  }

  @override
  Task<Unit> reportIncomingCall({
    required String callId,
    required String handle,
    required bool hasVideo,
  }) {
    return Task(() async {
      await _channel.invokeMethod('reportIncomingCall', {
        'callId': callId,
        'handle': handle,
        'hasVideo': hasVideo,
      });
      return unit;
    });
  }

  @override
  Task<Unit> reportCallEnded(String callId) {
    return Task(() async {
      await _channel.invokeMethod('reportCallEnded', {
        'callId': callId,
      });
      return unit;
    });
  }

  @override
  void dispose() {
    // No-op for method channel
  }
}
