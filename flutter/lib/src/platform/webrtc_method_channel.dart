import 'package:flutter/services.dart';
import 'package:fpdart/fpdart.dart';
import '../protocol/protocol.dart';
import 'webrtc_platform.dart';

/// MethodChannel implementation of WebRTCPlatform
/// Phase 1: Pure channel plumbing - routes calls to native Android/iOS
/// Phase 2: Native side will integrate actual WebRTC implementation
class WebRTCMethodChannel implements WebRTCPlatform {
  static const MethodChannel _channel = MethodChannel('com.callsafe.webrtc');

  void Function(String, RTCIceCandidate)? _iceCandidateCallback;
  void Function(String, String)? _connectionStateCallback;

  @override
  Task<Unit> initializePeerConnection(String callAttemptId) {
    return Task(() async {
      await _channel.invokeMethod('initializePeerConnection', {
        'callAttemptId': callAttemptId,
      });
      return unit;
    });
  }

  @override
  Task<RTCSessionDescriptionInit> createOffer(String callAttemptId) {
    return Task(() async {
      final result = await _channel.invokeMethod<Map<Object?, Object?>>(
        'createOffer',
        {'callAttemptId': callAttemptId},
      );

      return RTCSessionDescriptionInit(
        type: result!['type'] as String,
        sdp: result['sdp'] as String,
      );
    });
  }

  @override
  Task<RTCSessionDescriptionInit> createAnswer(String callAttemptId) {
    return Task(() async {
      final result = await _channel.invokeMethod<Map<Object?, Object?>>(
        'createAnswer',
        {'callAttemptId': callAttemptId},
      );

      return RTCSessionDescriptionInit(
        type: result!['type'] as String,
        sdp: result['sdp'] as String,
      );
    });
  }

  @override
  Task<Unit> setLocalDescription(
    String callAttemptId,
    RTCSessionDescriptionInit description,
  ) {
    return Task(() async {
      await _channel.invokeMethod('setLocalDescription', {
        'callAttemptId': callAttemptId,
        'description': {
          'type': description.type,
          'sdp': description.sdp,
        },
      });
      return unit;
    });
  }

  @override
  Task<Unit> setRemoteDescription(
    String callAttemptId,
    RTCSessionDescriptionInit description,
  ) {
    return Task(() async {
      await _channel.invokeMethod('setRemoteDescription', {
        'callAttemptId': callAttemptId,
        'description': {
          'type': description.type,
          'sdp': description.sdp,
        },
      });
      return unit;
    });
  }

  @override
  Task<Unit> addIceCandidate(
    String callAttemptId,
    RTCIceCandidate candidate,
  ) {
    return Task(() async {
      await _channel.invokeMethod('addIceCandidate', {
        'callAttemptId': callAttemptId,
        'candidate': {
          'candidate': candidate.candidate,
          'sdpMLineIndex': candidate.sdpMLineIndex,
          'sdpMid': candidate.sdpMid,
        },
      });
      return unit;
    });
  }

  @override
  Task<Unit> closePeerConnection(String callAttemptId) {
    return Task(() async {
      await _channel.invokeMethod('closePeerConnection', {
        'callAttemptId': callAttemptId,
      });
      return unit;
    });
  }

  @override
  Task<Unit> setAudioEnabled(String callAttemptId, bool enabled) {
    return Task(() async {
      await _channel.invokeMethod('setAudioEnabled', {
        'callAttemptId': callAttemptId,
        'enabled': enabled,
      });
      return unit;
    });
  }

  @override
  Task<Unit> setVideoEnabled(String callAttemptId, bool enabled) {
    return Task(() async {
      await _channel.invokeMethod('setVideoEnabled', {
        'callAttemptId': callAttemptId,
        'enabled': enabled,
      });
      return unit;
    });
  }

  @override
  Task<Unit> flipCamera(String callAttemptId) {
    return Task(() async {
      await _channel.invokeMethod('flipCamera', {
        'callAttemptId': callAttemptId,
      });
      return unit;
    });
  }

  @override
  Task<MediaCapabilities> getMediaCapabilities() {
    return Task(() async {
      final result = await _channel.invokeMethod<Map<Object?, Object?>>(
        'getMediaCapabilities',
      );

      return MediaCapabilities(
        canSendAudio: result!['canSendAudio'] as bool,
        canSendVideo: result['canSendVideo'] as bool,
        canReceiveAudio: result['canReceiveAudio'] as bool,
        canReceiveVideo: result['canReceiveVideo'] as bool,
      );
    });
  }

  @override
  void onIceCandidate(
    void Function(String callAttemptId, RTCIceCandidate) callback,
  ) {
    _iceCandidateCallback = callback;
    // Event channel integration will come in Phase 2
  }

  @override
  void onConnectionStateChange(
    void Function(String callAttemptId, String state) callback,
  ) {
    _connectionStateCallback = callback;
    // Event channel integration will come in Phase 2
  }

  @override
  void dispose() {
    _iceCandidateCallback = null;
    _connectionStateCallback = null;
  }
}
