import 'dart:async';
import 'package:flutter/services.dart';
import 'package:fpdart/fpdart.dart';
import 'push_platform.dart';

/// MethodChannel implementation of PushPlatform
/// Phase 3: Full integration with FCM/APNs event streams
class PushMethodChannel implements PushPlatform {
  static const MethodChannel _channel = MethodChannel('com.callsafe.push');
  static const EventChannel _eventChannel =
      EventChannel('com.callsafe.push.events');

  void Function(Map<String, dynamic>)? _notificationCallback;
  void Function(String)? _tokenRefreshCallback;
  StreamSubscription<dynamic>? _eventSubscription;

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
    _setupEventChannel();
  }

  @override
  void onTokenRefresh(void Function(String token) callback) {
    _tokenRefreshCallback = callback;
    _setupEventChannel();
  }

  @override
  Task<Map<String, dynamic>?> getInitialMessage() {
    return Task(() async {
      final result =
          await _channel.invokeMethod<Map<dynamic, dynamic>>('getInitialMessage');
      if (result == null) return null;
      return result.map((key, value) => MapEntry(key.toString(), value));
    });
  }

  void _setupEventChannel() {
    if (_eventSubscription != null) return;
    _eventSubscription = _eventChannel.receiveBroadcastStream().listen(
      (dynamic event) {
        if (event is Map) {
          final type = event['type'] as String?;

          if (type == 'message') {
            // Incoming FCM/APNs message
            final data = event['data'] as Map<dynamic, dynamic>?;
            if (data != null) {
              // Convert to Map<String, dynamic>
              final stringMap = <String, dynamic>{};
              data.forEach((key, value) {
                if (key is String) {
                  stringMap[key] = value;
                }
              });
              _notificationCallback?.call(stringMap);
            }
          } else if (type == 'tokenRefresh') {
            // Surface to the app: it re-registers by reconnecting with the
            // new pushToken on device:connect.
            final token = event['token'] as String?;
            if (token != null) {
              _tokenRefreshCallback?.call(token);
            }
          }
        }
      },
      onError: (dynamic error) {
        // Log error but don't crash
        print('[PushMethodChannel] Event stream error: $error');
      },
    );
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
    _eventSubscription?.cancel();
    _eventSubscription = null;
    _notificationCallback = null;
    _tokenRefreshCallback = null;
  }
}
