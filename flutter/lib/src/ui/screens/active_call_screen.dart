import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../call/call_state.dart';
import '../../protocol/protocol.dart';
import '../providers/call_providers.dart';

/// Active call screen - displays during an active call
/// Pure function of CallSession state to widgets
class ActiveCallScreen extends ConsumerStatefulWidget {
  const ActiveCallScreen({super.key});

  @override
  ConsumerState<ActiveCallScreen> createState() => _ActiveCallScreenState();
}

class _ActiveCallScreenState extends ConsumerState<ActiveCallScreen> {
  Timer? _timer;
  Duration _callDuration = Duration.zero;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final session = ref.read(currentCallProvider);
      if (session?.isActive == true) {
        setState(() {
          _callDuration = session?.duration ?? Duration.zero;
        });
      } else {
        timer.cancel();
      }
    });
  }

  String _formatDuration(Duration duration) {
    final minutes = duration.inMinutes.toString().padLeft(2, '0');
    final seconds = (duration.inSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(currentCallProvider);
    final webrtc = ref.read(webrtcPlatformProvider);
    final audio = ref.read(audioPlatformProvider);
    final isMuted = ref.watch(audioMutedProvider);
    final isSpeakerOn = ref.watch(speakerEnabledProvider);

    if (session == null || !session.isActive) {
      return const SizedBox.shrink();
    }

    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      body: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const SizedBox(height: 60),
            // Call info
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Call state indicator
                  if (session.state == CallState.connecting)
                    Column(
                      children: [
                        const CircularProgressIndicator(
                          color: Colors.white,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Connecting...',
                          style: TextStyle(
                            color: Colors.grey[400],
                            fontSize: 16,
                          ),
                        ),
                        const SizedBox(height: 32),
                      ],
                    ),
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
                  // Call duration or state
                  Text(
                    session.state == CallState.connected
                        ? _formatDuration(_callDuration)
                        : session.state.value,
                    style: TextStyle(
                      color: Colors.grey[400],
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Call type indicator
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.grey[800],
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          session.callType == CallType.video
                              ? Icons.videocam
                              : Icons.phone,
                          size: 16,
                          color: Colors.grey[400],
                        ),
                        const SizedBox(width: 6),
                        Text(
                          session.callType == CallType.video ? 'Video' : 'Voice',
                          style: TextStyle(
                            color: Colors.grey[400],
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Control buttons
            Padding(
              padding: const EdgeInsets.all(40),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Audio controls row
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      // Mute button
                      _ControlButton(
                        icon: isMuted ? Icons.mic_off : Icons.mic,
                        label: isMuted ? 'Unmute' : 'Mute',
                        isActive: isMuted,
                        onPressed: () {
                          final newState = !isMuted;
                          ref.read(audioMutedProvider.notifier).state =
                              newState;
                          webrtc
                              .setAudioEnabled(session.callAttemptId, !newState)
                              .run();
                        },
                      ),
                      // Speaker button
                      _ControlButton(
                        icon: isSpeakerOn
                            ? Icons.volume_up
                            : Icons.volume_down,
                        label: isSpeakerOn ? 'Speaker' : 'Earpiece',
                        isActive: isSpeakerOn,
                        onPressed: () {
                          final newState = !isSpeakerOn;
                          ref.read(speakerEnabledProvider.notifier).state =
                              newState;
                          audio.setSpeakerMode(newState).run();
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  // End call button
                  GestureDetector(
                    onTap: () {
                      ref
                          .read(callManagerProvider.notifier)
                          .endCall(reason: CallEndReason.normal)
                          .run();
                    },
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: const BoxDecoration(
                        color: Colors.red,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.call_end,
                        color: Colors.white,
                        size: 32,
                      ),
                    ),
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

/// Reusable control button widget
class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onPressed;

  const _ControlButton({
    required this.icon,
    required this.label,
    required this.isActive,
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
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: isActive ? Colors.white : Colors.grey[800],
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              color: isActive ? const Color(0xFF1A1A1A) : Colors.white,
              size: 28,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}
