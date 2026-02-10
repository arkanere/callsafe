import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../call/call_state.dart';
import '../../protocol/protocol.dart';
import '../providers/call_providers.dart';
import '../providers/permissions_providers.dart';

/// Show permission denied dialog with option to open settings
void _showPermissionDeniedDialog(
  BuildContext context,
  dynamic permissionsService,
  bool isVideo,
) {
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Permission Required'),
      content: Text(
        isVideo
            ? 'CallSafe needs access to your microphone and camera to make video calls. Please grant permissions in Settings.'
            : 'CallSafe needs access to your microphone to make calls. Please grant permission in Settings.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () {
            Navigator.of(context).pop();
            openAppSettings();
          },
          child: const Text('Open Settings'),
        ),
      ],
    ),
  );
}

/// Incoming call screen - displays when receiving a call
/// Pure function of CallSession state to widgets
class IncomingCallScreen extends ConsumerWidget {
  const IncomingCallScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(currentCallProvider);
    final audio = ref.read(audioPlatformProvider);

    if (session == null || session.state != CallState.ringing) {
      return const SizedBox.shrink();
    }

    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      body: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const SizedBox(height: 60),
            // Caller info
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Avatar
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.grey[800],
                    ),
                    child: Icon(
                      Icons.person,
                      size: 60,
                      color: Colors.grey[400],
                    ),
                  ),
                  const SizedBox(height: 24),
                  // Caller name/handle
                  Text(
                    session.handle,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Call type label
                  Text(
                    session.callType == CallType.video
                        ? 'Incoming Video Call'
                        : 'Incoming Call',
                    style: TextStyle(
                      color: Colors.grey[400],
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
            ),
            // Action buttons
            Padding(
              padding: const EdgeInsets.all(40),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  // Reject button
                  _ActionButton(
                    icon: Icons.call_end,
                    label: 'Decline',
                    backgroundColor: Colors.red,
                    onPressed: () {
                      audio.stopRinging().run();
                      ref
                          .read(callManagerProvider.notifier)
                          .rejectCall(reason: 'User declined')
                          .run();
                    },
                  ),
                  // Accept button
                  _ActionButton(
                    icon: Icons.call,
                    label: 'Accept',
                    backgroundColor: Colors.green,
                    onPressed: () async {
                      audio.stopRinging().run();

                      // Request permissions before accepting call
                      final permissionsService =
                          ref.read(permissionsServiceProvider);
                      final isVideo = session.callType == CallType.video;

                      bool permissionsGranted;
                      if (isVideo) {
                        // Video call needs both mic and camera
                        permissionsGranted = await permissionsService
                            .requestVideoCallPermissions()
                            .run();
                      } else {
                        // Voice call needs only mic
                        permissionsGranted = await permissionsService
                            .requestMicrophonePermission()
                            .run();
                      }

                      if (!permissionsGranted) {
                        // Show error and guide user to settings
                        if (context.mounted) {
                          _showPermissionDeniedDialog(
                            context,
                            permissionsService,
                            isVideo,
                          );
                        }
                        return;
                      }

                      // Permissions granted, accept call
                      ref.read(callManagerProvider.notifier).acceptCall().run();
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Reusable action button widget
class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color backgroundColor;
  final VoidCallback onPressed;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.backgroundColor,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onPressed,
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: backgroundColor,
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              color: Colors.white,
              size: 32,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
          ),
        ),
      ],
    );
  }
}
