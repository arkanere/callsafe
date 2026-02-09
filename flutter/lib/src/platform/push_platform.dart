import 'package:fpdart/fpdart.dart';

/// Platform channel contract for push notifications
/// Handles FCM/APNs registration and incoming call notifications
abstract class PushPlatform {
  /// Request push notification permissions
  Task<bool> requestPermissions();

  /// Get push notification token (FCM/APNs)
  Task<String> getToken();

  /// Handle incoming push notification
  void onNotification(
    void Function(Map<String, dynamic> data) callback,
  );

  /// Display incoming call notification
  Task<Unit> showIncomingCallNotification({
    required String callAttemptId,
    required String callerName,
    required bool isVideo,
  });

  /// Clear notification
  Task<Unit> clearNotification(String callAttemptId);

  /// Dispose platform resources
  void dispose();
}

/// Mock implementation for testing (Phase 2)
class MockPushPlatform implements PushPlatform {
  void Function(Map<String, dynamic>)? _notificationCallback;
  final String _token = 'mock-push-token';

  @override
  Task<bool> requestPermissions() {
    return Task(() async => true);
  }

  @override
  Task<String> getToken() {
    return Task(() async => _token);
  }

  @override
  void onNotification(
    void Function(Map<String, dynamic> data) callback,
  ) {
    _notificationCallback = callback;
  }

  @override
  Task<Unit> showIncomingCallNotification({
    required String callAttemptId,
    required String callerName,
    required bool isVideo,
  }) {
    return Task(() async {
      // Simulate notification display
      return unit;
    });
  }

  @override
  Task<Unit> clearNotification(String callAttemptId) {
    return Task(() async => unit);
  }

  @override
  void dispose() {
    _notificationCallback = null;
  }

  /// Simulate incoming notification (for testing)
  void simulateIncomingNotification(Map<String, dynamic> data) {
    _notificationCallback?.call(data);
  }
}
