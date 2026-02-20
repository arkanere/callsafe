import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' as fwrtc;
import '../../call/call_state.dart';
import '../../protocol/protocol.dart';
import '../providers/call_providers.dart';

/// Active call screen — pure function of CallSession state to widgets.
/// Video calls: remote video full screen, local preview in corner.
/// Voice calls: avatar + duration layout unchanged.
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

    if (session == null || !session.isActive) {
      return const SizedBox.shrink();
    }

    return session.callType == CallType.video
        ? _buildVideoCallLayout(context, session)
        : _buildVoiceCallLayout(context, session);
  }

  Widget _buildVideoCallLayout(BuildContext context, CallSession session) {
    final webrtc = ref.read(webrtcPlatformProvider);
    final audio = ref.read(audioPlatformProvider);
    final isMuted = ref.watch(audioMutedProvider);
    final isSpeakerOn = ref.watch(speakerEnabledProvider);
    final isCameraOn = ref.watch(cameraEnabledProvider);
    final isFacingFront = ref.watch(cameraFacingFrontProvider);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Remote video — full screen background
          Positioned.fill(
            child: webrtc.remoteRenderer != null
                ? fwrtc.RTCVideoView(
                    webrtc.remoteRenderer!,
                    objectFit: fwrtc
                        .RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                  )
                : const ColoredBox(
                    color: Color(0xFF1A1A1A),
                    child: Center(
                      child: Icon(
                        Icons.videocam_off,
                        color: Colors.white38,
                        size: 64,
                      ),
                    ),
                  ),
          ),

          // Local video preview — top-right corner
          if (webrtc.localRenderer != null && isCameraOn)
            Positioned(
              top: 48,
              right: 16,
              width: 100,
              height: 140,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: fwrtc.RTCVideoView(
                  webrtc.localRenderer!,
                  mirror: isFacingFront,
                  objectFit: fwrtc
                      .RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                ),
              ),
            ),

          // Status overlay — top left
          Positioned(
            top: 0,
            left: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.handle,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        shadows: [
                          Shadow(blurRadius: 4, color: Colors.black54)
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      session.state == CallState.connected
                          ? _formatDuration(_callDuration)
                          : session.state.value,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 14,
                        shadows: [
                          Shadow(blurRadius: 4, color: Colors.black54)
                        ],
                      ),
                    ),
                    if (session.state == CallState.connecting)
                      const Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),

          // Controls — bottom gradient overlay
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(vertical: 24, horizontal: 32),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Colors.black87, Colors.transparent],
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Video + audio controls row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _ControlButton(
                          icon: isMuted ? Icons.mic_off : Icons.mic,
                          label: isMuted ? 'Unmute' : 'Mute',
                          isActive: isMuted,
                          onPressed: () {
                            final next = !isMuted;
                            ref.read(audioMutedProvider.notifier).state = next;
                            webrtc
                                .setAudioEnabled(session.callAttemptId, !next)
                                .run();
                          },
                        ),
                        _ControlButton(
                          icon: isCameraOn
                              ? Icons.videocam
                              : Icons.videocam_off,
                          label: isCameraOn ? 'Camera' : 'Camera Off',
                          isActive: !isCameraOn,
                          onPressed: () {
                            ref.read(cameraEnabledProvider.notifier).state =
                                !isCameraOn;
                            ref
                                .read(callManagerProvider.notifier)
                                .toggleCamera()
                                .run();
                          },
                        ),
                        _ControlButton(
                          icon: Icons.flip_camera_ios,
                          label: isFacingFront ? 'Rear' : 'Front',
                          isActive: false,
                          onPressed: () {
                            ref
                                .read(cameraFacingFrontProvider.notifier)
                                .state = !isFacingFront;
                            ref
                                .read(callManagerProvider.notifier)
                                .flipCamera()
                                .run();
                          },
                        ),
                        _ControlButton(
                          icon: isSpeakerOn
                              ? Icons.volume_up
                              : Icons.volume_down,
                          label: isSpeakerOn ? 'Speaker' : 'Earpiece',
                          isActive: isSpeakerOn,
                          onPressed: () {
                            final next = !isSpeakerOn;
                            ref.read(speakerEnabledProvider.notifier).state =
                                next;
                            audio.setSpeakerMode(next).run();
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    // End call
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
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVoiceCallLayout(BuildContext context, CallSession session) {
    final webrtc = ref.read(webrtcPlatformProvider);
    final audio = ref.read(audioPlatformProvider);
    final isMuted = ref.watch(audioMutedProvider);
    final isSpeakerOn = ref.watch(speakerEnabledProvider);

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
                  if (session.state == CallState.connecting)
                    Column(
                      children: [
                        const CircularProgressIndicator(color: Colors.white),
                        const SizedBox(height: 16),
                        Text(
                          'Connecting...',
                          style:
                              TextStyle(color: Colors.grey[400], fontSize: 16),
                        ),
                        const SizedBox(height: 32),
                      ],
                    ),
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
                  Text(
                    session.handle,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    session.state == CallState.connected
                        ? _formatDuration(_callDuration)
                        : session.state.value,
                    style: TextStyle(color: Colors.grey[400], fontSize: 16),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.grey[800],
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.phone, size: 16, color: Colors.grey[400]),
                        const SizedBox(width: 6),
                        Text(
                          'Voice',
                          style: TextStyle(
                              color: Colors.grey[400], fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Controls
            Padding(
              padding: const EdgeInsets.all(40),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _ControlButton(
                        icon: isMuted ? Icons.mic_off : Icons.mic,
                        label: isMuted ? 'Unmute' : 'Mute',
                        isActive: isMuted,
                        onPressed: () {
                          final next = !isMuted;
                          ref.read(audioMutedProvider.notifier).state = next;
                          webrtc
                              .setAudioEnabled(session.callAttemptId, !next)
                              .run();
                        },
                      ),
                      _ControlButton(
                        icon: isSpeakerOn
                            ? Icons.volume_up
                            : Icons.volume_down,
                        label: isSpeakerOn ? 'Speaker' : 'Earpiece',
                        isActive: isSpeakerOn,
                        onPressed: () {
                          final next = !isSpeakerOn;
                          ref.read(speakerEnabledProvider.notifier).state =
                              next;
                          audio.setSpeakerMode(next).run();
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
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
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: isActive ? Colors.white : Colors.grey[800],
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              color: isActive ? const Color(0xFF1A1A1A) : Colors.white,
              size: 24,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(color: Colors.white, fontSize: 11),
        ),
      ],
    );
  }
}
