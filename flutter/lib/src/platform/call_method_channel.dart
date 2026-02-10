import 'package:flutter/services.dart';
import 'package:fpdart/fpdart.dart';
import 'call_platform.dart';

/// MethodChannel implementation of CallPlatform
/// Phase 3: Full integration with CallKit (iOS) and ConnectionService (Android)
class CallMethodChannel implements CallPlatform {
  static const MethodChannel _channel = MethodChannel('com.callsafe.call');

  void Function(CallEvent)? _eventCallback;

  CallMethodChannel() {
    _setupMethodCallHandler();
  }

  void _setupMethodCallHandler() {
    _channel.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'onCallAnswered':
          final callAttemptId = call.arguments['callAttemptId'] as String;
          _eventCallback?.call(CallAnsweredEvent(callAttemptId));
          break;

        case 'onCallRejected':
          final callAttemptId = call.arguments['callAttemptId'] as String;
          _eventCallback?.call(CallRejectedEvent(callAttemptId));
          break;

        case 'onCallDisconnected':
          final callAttemptId = call.arguments['callAttemptId'] as String;
          _eventCallback?.call(CallDisconnectedEvent(callAttemptId));
          break;

        case 'onMuteChanged':
          final callAttemptId = call.arguments['callAttemptId'] as String;
          final muted = call.arguments['muted'] as bool;
          _eventCallback?.call(CallMuteChangedEvent(callAttemptId, muted));
          break;

        case 'onSpeakerChanged':
          final callAttemptId = call.arguments['callAttemptId'] as String;
          final speaker = call.arguments['speaker'] as bool;
          _eventCallback?.call(CallSpeakerChangedEvent(callAttemptId, speaker));
          break;
      }
    });
  }

  @override
  Task<Unit> showIncomingCall({
    required String callAttemptId,
    required String callerName,
    required bool isVideo,
  }) {
    return Task(() async {
      await _channel.invokeMethod('showIncomingCall', {
        'callAttemptId': callAttemptId,
        'callerName': callerName,
        'isVideo': isVideo,
      });
      return unit;
    });
  }

  @override
  Task<Unit> startOutgoingCall({
    required String callAttemptId,
    required String recipientName,
    required bool isVideo,
  }) {
    return Task(() async {
      await _channel.invokeMethod('startOutgoingCall', {
        'callAttemptId': callAttemptId,
        'recipientName': recipientName,
        'isVideo': isVideo,
      });
      return unit;
    });
  }

  @override
  Task<Unit> endCall(String callAttemptId) {
    return Task(() async {
      await _channel.invokeMethod('endCall', {
        'callAttemptId': callAttemptId,
      });
      return unit;
    });
  }

  @override
  Task<Unit> setCallActive(String callAttemptId) {
    return Task(() async {
      await _channel.invokeMethod('setCallActive', {
        'callAttemptId': callAttemptId,
      });
      return unit;
    });
  }

  @override
  Task<Unit> startForegroundService({
    required String callAttemptId,
    required String callerName,
  }) {
    return Task(() async {
      await _channel.invokeMethod('startForegroundService', {
        'callAttemptId': callAttemptId,
        'callerName': callerName,
      });
      return unit;
    });
  }

  @override
  Task<Unit> stopForegroundService() {
    return Task(() async {
      await _channel.invokeMethod('stopForegroundService');
      return unit;
    });
  }

  @override
  void onCallEvent(void Function(CallEvent event) callback) {
    _eventCallback = callback;
  }

  @override
  void dispose() {
    _eventCallback = null;
  }
}
