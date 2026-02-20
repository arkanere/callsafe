import 'package:flutter_webrtc/flutter_webrtc.dart' as fwrtc;
import 'package:fpdart/fpdart.dart';
import '../protocol/protocol.dart';

/// Platform channel contract for WebRTC operations
/// Defines interface between Flutter business logic and native implementations
abstract class WebRTCPlatform {
  /// Local video renderer (non-null only during active video calls)
  fwrtc.RTCVideoRenderer? get localRenderer;

  /// Remote video renderer (non-null only during active video calls)
  fwrtc.RTCVideoRenderer? get remoteRenderer;

  /// Initialize peer connection for call
  Task<Unit> initializePeerConnection(
    String callAttemptId, {
    CallType callType = CallType.voice,
  });

  /// Create WebRTC offer
  Task<RTCSessionDescriptionInit> createOffer(String callAttemptId);

  /// Create WebRTC answer
  Task<RTCSessionDescriptionInit> createAnswer(String callAttemptId);

  /// Set local description
  Task<Unit> setLocalDescription(
    String callAttemptId,
    RTCSessionDescriptionInit description,
  );

  /// Set remote description
  Task<Unit> setRemoteDescription(
    String callAttemptId,
    RTCSessionDescriptionInit description,
  );

  /// Add ICE candidate
  Task<Unit> addIceCandidate(
    String callAttemptId,
    RTCIceCandidate candidate,
  );

  /// Close peer connection
  Task<Unit> closePeerConnection(String callAttemptId);

  /// Enable/disable local audio
  Task<Unit> setAudioEnabled(String callAttemptId, bool enabled);

  /// Enable/disable local video
  Task<Unit> setVideoEnabled(String callAttemptId, bool enabled);

  /// Flip camera (front/back)
  Task<Unit> flipCamera(String callAttemptId);

  /// Get media capabilities
  Task<MediaCapabilities> getMediaCapabilities();

  /// Register callback for ICE candidate events
  void onIceCandidate(void Function(String callAttemptId, RTCIceCandidate) callback);

  /// Register callback for connection state changes
  void onConnectionStateChange(
    void Function(String callAttemptId, String state) callback,
  );

  /// Dispose platform resources
  void dispose();
}

/// Mock implementation for testing (Phase 2)
/// Will be replaced with real platform channel in Phase 3
class MockWebRTCPlatform implements WebRTCPlatform {
  final Map<String, bool> _connections = {};
  void Function(String, RTCIceCandidate)? _iceCandidateCallback;
  void Function(String, String)? _connectionStateCallback;

  @override
  fwrtc.RTCVideoRenderer? get localRenderer => null;

  @override
  fwrtc.RTCVideoRenderer? get remoteRenderer => null;

  @override
  Task<Unit> initializePeerConnection(
    String callAttemptId, {
    CallType callType = CallType.voice,
  }) {
    return Task(() async {
      _connections[callAttemptId] = true;
      Future.delayed(const Duration(milliseconds: 100), () {
        _connectionStateCallback?.call(callAttemptId, 'connected');
      });
      return unit;
    });
  }

  @override
  Task<RTCSessionDescriptionInit> createOffer(String callAttemptId) {
    return Task(() async {
      return const RTCSessionDescriptionInit(
        type: 'offer',
        sdp: 'mock-sdp-offer',
      );
    });
  }

  @override
  Task<RTCSessionDescriptionInit> createAnswer(String callAttemptId) {
    return Task(() async {
      return const RTCSessionDescriptionInit(
        type: 'answer',
        sdp: 'mock-sdp-answer',
      );
    });
  }

  @override
  Task<Unit> setLocalDescription(
    String callAttemptId,
    RTCSessionDescriptionInit description,
  ) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> setRemoteDescription(
    String callAttemptId,
    RTCSessionDescriptionInit description,
  ) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> addIceCandidate(
    String callAttemptId,
    RTCIceCandidate candidate,
  ) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> closePeerConnection(String callAttemptId) {
    return Task(() async {
      _connections.remove(callAttemptId);
      _connectionStateCallback?.call(callAttemptId, 'closed');
      return unit;
    });
  }

  @override
  Task<Unit> setAudioEnabled(String callAttemptId, bool enabled) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> setVideoEnabled(String callAttemptId, bool enabled) {
    return Task(() async => unit);
  }

  @override
  Task<Unit> flipCamera(String callAttemptId) {
    return Task(() async => unit);
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
    // Simulate ICE candidate generation
    Future.delayed(const Duration(milliseconds: 200), () {
      for (final callId in _connections.keys) {
        callback(
          callId,
          const RTCIceCandidate(
            candidate: 'mock-ice-candidate',
            sdpMLineIndex: 0,
            sdpMid: 'audio',
          ),
        );
      }
    });
  }

  @override
  void onConnectionStateChange(
    void Function(String callAttemptId, String state) callback,
  ) {
    _connectionStateCallback = callback;
  }

  @override
  void dispose() {
    _connections.clear();
    _iceCandidateCallback = null;
    _connectionStateCallback = null;
  }
}
