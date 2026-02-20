import 'package:flutter_webrtc/flutter_webrtc.dart' as fwrtc;
import 'package:fpdart/fpdart.dart';
import '../protocol/protocol.dart';
import 'webrtc_platform.dart';

const _stunServer = {'urls': 'stun:stun.l.google.com:19302'};

/// WebRTC platform implementation using flutter_webrtc directly.
/// Manages peer connections, local/remote media streams, and video renderers.
class WebRTCMethodChannel implements WebRTCPlatform {
  final Map<String, fwrtc.RTCPeerConnection> _connections = {};
  fwrtc.MediaStream? _localStream;
  fwrtc.MediaStream? _remoteStream;

  final fwrtc.RTCVideoRenderer _localRenderer = fwrtc.RTCVideoRenderer();
  final fwrtc.RTCVideoRenderer _remoteRenderer = fwrtc.RTCVideoRenderer();
  bool _renderersInitialized = false;

  void Function(String, RTCIceCandidate)? _iceCandidateCallback;
  void Function(String, String)? _connectionStateCallback;

  @override
  fwrtc.RTCVideoRenderer? get localRenderer =>
      _renderersInitialized ? _localRenderer : null;

  @override
  fwrtc.RTCVideoRenderer? get remoteRenderer =>
      _renderersInitialized ? _remoteRenderer : null;

  @override
  Task<Unit> initializePeerConnection(
    String callAttemptId, {
    CallType callType = CallType.voice,
    List<Map<String, dynamic>>? iceServers,
  }) {
    return Task(() async {
      // Initialize video renderers for video calls
      if (callType == CallType.video && !_renderersInitialized) {
        await _localRenderer.initialize();
        await _remoteRenderer.initialize();
        _renderersInitialized = true;
      }

      // Acquire local media
      final constraints = callType == CallType.video
          ? {
              'audio': true,
              'video': {'facingMode': 'user'},
            }
          : {'audio': true, 'video': false};

      _localStream =
          await fwrtc.navigator.mediaDevices.getUserMedia(constraints);

      if (_renderersInitialized) {
        _localRenderer.srcObject = _localStream;
      }

      // Build ICE config: always include STUN, append TURN servers if provided
      final iceConfig = {
        'iceServers': [_stunServer, ...?iceServers],
      };

      // Create peer connection
      final pc = await fwrtc.createPeerConnection(iceConfig);
      _connections[callAttemptId] = pc;

      // Add local tracks
      for (final track in _localStream!.getTracks()) {
        await pc.addTrack(track, _localStream!);
      }

      // ICE candidates → relay to CallManager
      pc.onIceCandidate = (candidate) {
        if (candidate.candidate != null) {
          _iceCandidateCallback?.call(
            callAttemptId,
            RTCIceCandidate(
              candidate: candidate.candidate!,
              sdpMLineIndex: candidate.sdpMLineIndex,
              sdpMid: candidate.sdpMid,
            ),
          );
        }
      };

      // Connection state changes
      pc.onConnectionState = (state) {
        _connectionStateCallback?.call(callAttemptId, state.name);
      };

      // Remote tracks → attach to renderer
      pc.onTrack = (event) {
        if (event.streams.isNotEmpty) {
          _remoteStream = event.streams[0];
          if (_renderersInitialized) {
            _remoteRenderer.srcObject = _remoteStream;
          }
        }
      };

      return unit;
    });
  }

  @override
  Task<RTCSessionDescriptionInit> createOffer(String callAttemptId) {
    return Task(() async {
      final pc = _connections[callAttemptId]!;
      final offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return RTCSessionDescriptionInit(type: offer.type!, sdp: offer.sdp);
    });
  }

  @override
  Task<RTCSessionDescriptionInit> createAnswer(String callAttemptId) {
    return Task(() async {
      final pc = _connections[callAttemptId]!;
      final answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return RTCSessionDescriptionInit(type: answer.type!, sdp: answer.sdp);
    });
  }

  @override
  Task<Unit> setLocalDescription(
    String callAttemptId,
    RTCSessionDescriptionInit description,
  ) {
    return Task(() async {
      final pc = _connections[callAttemptId]!;
      await pc.setLocalDescription(
        fwrtc.RTCSessionDescription(description.sdp, description.type),
      );
      return unit;
    });
  }

  @override
  Task<Unit> setRemoteDescription(
    String callAttemptId,
    RTCSessionDescriptionInit description,
  ) {
    return Task(() async {
      final pc = _connections[callAttemptId]!;
      await pc.setRemoteDescription(
        fwrtc.RTCSessionDescription(description.sdp, description.type),
      );
      return unit;
    });
  }

  @override
  Task<Unit> addIceCandidate(
    String callAttemptId,
    RTCIceCandidate candidate,
  ) {
    return Task(() async {
      final pc = _connections[callAttemptId]!;
      await pc.addCandidate(fwrtc.RTCIceCandidate(
        candidate.candidate,
        candidate.sdpMid,
        candidate.sdpMLineIndex,
      ));
      return unit;
    });
  }

  @override
  Task<Unit> closePeerConnection(String callAttemptId) {
    return Task(() async {
      final pc = _connections.remove(callAttemptId);
      await pc?.close();

      for (final track in _localStream?.getTracks() ?? []) {
        await track.stop();
      }
      await _localStream?.dispose();
      _localStream = null;

      await _remoteStream?.dispose();
      _remoteStream = null;

      if (_renderersInitialized) {
        _localRenderer.srcObject = null;
        _remoteRenderer.srcObject = null;
        _renderersInitialized = false;
      }

      return unit;
    });
  }

  @override
  Task<Unit> setAudioEnabled(String callAttemptId, bool enabled) {
    return Task(() async {
      for (final track in _localStream?.getAudioTracks() ?? []) {
        track.enabled = enabled;
      }
      return unit;
    });
  }

  @override
  Task<Unit> setVideoEnabled(String callAttemptId, bool enabled) {
    return Task(() async {
      for (final track in _localStream?.getVideoTracks() ?? []) {
        track.enabled = enabled;
      }
      return unit;
    });
  }

  @override
  Task<Unit> flipCamera(String callAttemptId) {
    return Task(() async {
      final videoTrack = _localStream?.getVideoTracks().firstOrNull;
      if (videoTrack != null) {
        await fwrtc.Helper.switchCamera(videoTrack);
      }
      return unit;
    });
  }

  @override
  Task<MediaCapabilities> getMediaCapabilities() {
    return Task(() async {
      return const MediaCapabilities(
        canSendAudio: true,
        canSendVideo: true,
        canReceiveAudio: true,
        canReceiveVideo: true,
      );
    });
  }

  @override
  void onIceCandidate(
    void Function(String callAttemptId, RTCIceCandidate) callback,
  ) {
    _iceCandidateCallback = callback;
  }

  @override
  void onConnectionStateChange(
    void Function(String callAttemptId, String state) callback,
  ) {
    _connectionStateCallback = callback;
  }

  @override
  void dispose() {
    for (final pc in _connections.values) {
      pc.close();
    }
    _connections.clear();
    for (final track in _localStream?.getTracks() ?? []) {
      track.stop();
    }
    _localStream?.dispose();
    _remoteStream?.dispose();
    if (_renderersInitialized) {
      _localRenderer.dispose();
      _remoteRenderer.dispose();
    }
    _iceCandidateCallback = null;
    _connectionStateCallback = null;
  }
}
