import 'package:flutter/services.dart';
import 'package:fpdart/fpdart.dart';
import 'push_platform.dart';

/// MethodChannel implementation of PushPlatform
/// Phase 1: Pure channel plumbing - routes calls to native Android/iOS
/// Phase 2: Native side will integrate FCM/APNs
class PushMethodChannel implements PushPlatform {
  static const MethodChannel _channel = MethodChannel('com.callsafe.push');

  void Function(Map<String, dynamic>)? _notificationCallback;

  @override
  Task<bool> requestPermissions() {
    return Task(() async {
      final result = await _channel.invokeMethod<bool>('requestPermissions');
      return result ?? false;
    });
  }

  @override
  Task<String> getToken() {
    return Task(() async {
      final result = await _channel.invokeMethod<String>('getToken');
      return result ?? '';
    });
  }

  @override
  void onNotification(
    void Function(Map<String, dynamic> data) callback,
  ) {
    _notificationCallback = callback;
    // Event channel integration will come in Phase 2
  }

  @override
  Task<Unit> showIncomingCallNotification({
    required String callAttemptId,
    required String callerName,
    required bool isVideo,
  }) {
    return Task(() async {
      await _channel.invokeMethod('showIncomingCallNotification', {
        'callAttemptId': callAttemptId,
        'callerName': callerName,
        'isVideo': isVideo,
      });
      return unit;
    });
  }

  @override
  Task<Unit> clearNotification(String callAttemptId) {
    return Task(() async {
      await _channel.invokeMethod('clearNotification', {
        'callAttemptId': callAttemptId,
      });
      return unit;
    });
  }

  @override
  void dispose() {
    _notificationCallback = null;
  }
}
