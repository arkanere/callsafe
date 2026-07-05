import 'package:fpdart/fpdart.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:permission_handler/permission_handler.dart' as permission_handler;

/// Service for handling runtime permissions
/// Wraps permission_handler with fpdart Task for consistency
class PermissionsService {
  /// Check if microphone permission is granted
  Task<bool> checkMicrophonePermission() {
    return Task(() async {
      final status = await Permission.microphone.status;
      return status.isGranted;
    });
  }

  /// Check if camera permission is granted
  Task<bool> checkCameraPermission() {
    return Task(() async {
      final status = await Permission.camera.status;
      return status.isGranted;
    });
  }

  /// Request microphone permission
  /// Returns true if granted, false if denied
  Task<bool> requestMicrophonePermission() {
    return Task(() async {
      final status = await Permission.microphone.request();
      return status.isGranted;
    });
  }

  /// Request camera permission
  /// Returns true if granted, false if denied
  Task<bool> requestCameraPermission() {
    return Task(() async {
      final status = await Permission.camera.request();
      return status.isGranted;
    });
  }

  /// Request both microphone and camera permissions for video call
  /// Returns true only if both are granted
  Task<bool> requestVideoCallPermissions() {
    return Task(() async {
      final micStatus = await Permission.microphone.request();
      if (!micStatus.isGranted) {
        return false;
      }

      final cameraStatus = await Permission.camera.request();
      return cameraStatus.isGranted;
    });
  }

  /// Check if microphone permission is permanently denied
  /// (user selected "Don't ask again" on Android or denied multiple times on iOS)
  Task<bool> isMicrophonePermanentlyDenied() {
    return Task(() async {
      final status = await Permission.microphone.status;
      return status.isPermanentlyDenied;
    });
  }

  /// Check if camera permission is permanently denied
  Task<bool> isCameraPermanentlyDenied() {
    return Task(() async {
      final status = await Permission.camera.status;
      return status.isPermanentlyDenied;
    });
  }

  /// Open app settings so user can manually grant permissions
  Task<bool> openAppSettings() {
    return Task(() async {
      return await permission_handler.openAppSettings();
    });
  }

  /// Request notification permission (iOS 10+, Android 13+)
  Task<bool> requestNotificationPermission() {
    return Task(() async {
      final status = await Permission.notification.request();
      return status.isGranted;
    });
  }

  /// Check notification permission status
  Task<bool> checkNotificationPermission() {
    return Task(() async {
      final status = await Permission.notification.status;
      return status.isGranted;
    });
  }
}
