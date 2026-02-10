import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/permissions_service.dart';

/// Provider for PermissionsService
final permissionsServiceProvider = Provider<PermissionsService>((ref) {
  return PermissionsService();
});

/// Check microphone permission status
final microphonePermissionProvider = FutureProvider<bool>((ref) async {
  final service = ref.read(permissionsServiceProvider);
  return service.checkMicrophonePermission().run();
});

/// Check camera permission status
final cameraPermissionProvider = FutureProvider<bool>((ref) async {
  final service = ref.read(permissionsServiceProvider);
  return service.checkCameraPermission().run();
});

/// Check if microphone is permanently denied
final microphonePermanentlyDeniedProvider = FutureProvider<bool>((ref) async {
  final service = ref.read(permissionsServiceProvider);
  return service.isMicrophonePermanentlyDenied().run();
});

/// Check if camera is permanently denied
final cameraPermanentlyDeniedProvider = FutureProvider<bool>((ref) async {
  final service = ref.read(permissionsServiceProvider);
  return service.isCameraPermanentlyDenied().run();
});
