import 'package:freezed_annotation/freezed_annotation.dart';
import '../protocol/protocol.dart';

part 'call_state.freezed.dart';

/// Call session data
@freezed
class CallSession with _$CallSession {
  const factory CallSession({
    required String callAttemptId,
    required String handle,
    required CallType callType,
    required CallState state,
    String? sourceId,
    MediaCapabilities? localCapabilities,
    MediaCapabilities? remoteCapabilities,
    DateTime? startTime,
    DateTime? connectTime,
    DateTime? endTime,
    CallEndReason? endReason,
    RTCSessionDescriptionInit? localOffer,
    RTCSessionDescriptionInit? remoteOffer,
    RTCSessionDescriptionInit? localAnswer,
    RTCSessionDescriptionInit? remoteAnswer,
    @Default([]) List<RTCIceCandidate> localCandidates,
    @Default([]) List<RTCIceCandidate> remoteCandidates,
    @Default(true) bool isVideoEnabled,
  }) = _CallSession;

  const CallSession._();

  /// Duration of call
  Duration? get duration {
    if (startTime == null) return null;
    final end = endTime ?? DateTime.now();
    return end.difference(startTime!);
  }

  /// Is call active (connected or connecting)
  bool get isActive {
    return state == CallState.connecting ||
        state == CallState.connected ||
        state == CallState.ringing;
  }

  /// Is call ended
  bool get isEnded {
    return state == CallState.ended ||
        state == CallState.failed ||
        state == CallState.cancelled ||
        state == CallState.busy ||
        state == CallState.unavailable ||
        state == CallState.timeout;
  }
}

/// Call manager state
@freezed
class CallManagerState with _$CallManagerState {
  const factory CallManagerState({
    CallSession? currentCall,
    @Default([]) List<CallSession> callHistory,
    @Default(false) bool isAvailable,
    String? deviceId,
    DeviceType? deviceType,
  }) = _CallManagerState;

  const CallManagerState._();

  /// Has active call
  bool get hasActiveCall => currentCall?.isActive ?? false;

  /// Can initiate new call
  bool get canInitiateCall => !hasActiveCall && isAvailable;

  /// Can accept incoming call
  bool get canAcceptCall =>
      currentCall?.state == CallState.ringing && isAvailable;
}
