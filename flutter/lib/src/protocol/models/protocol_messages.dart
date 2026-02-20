import 'package:freezed_annotation/freezed_annotation.dart';
import 'protocol_enums.dart';

part 'protocol_messages.freezed.dart';
part 'protocol_messages.g.dart';

// ============================================================================
// BASE MODELS
// ============================================================================

/// Media Capabilities
/// Describes what media tracks a peer can send/receive
/// Format: { canSend: ["audio"] | ["audio", "video"], canReceive: [...] }
@freezed
class MediaCapabilities with _$MediaCapabilities {
  const factory MediaCapabilities({
    required List<String> canSend,
    required List<String> canReceive,
  }) = _MediaCapabilities;

  factory MediaCapabilities.fromJson(Map<String, dynamic> json) =>
      _$MediaCapabilitiesFromJson(json);
}

/// WebRTC Session Description
@freezed
class RTCSessionDescriptionInit with _$RTCSessionDescriptionInit {
  const factory RTCSessionDescriptionInit({
    required String type,
    String? sdp,
  }) = _RTCSessionDescriptionInit;

  factory RTCSessionDescriptionInit.fromJson(Map<String, dynamic> json) =>
      _$RTCSessionDescriptionInitFromJson(json);
}

/// WebRTC ICE Candidate
@freezed
class RTCIceCandidate with _$RTCIceCandidate {
  const factory RTCIceCandidate({
    required String candidate,
    int? sdpMLineIndex,
    String? sdpMid,
  }) = _RTCIceCandidate;

  factory RTCIceCandidate.fromJson(Map<String, dynamic> json) =>
      _$RTCIceCandidateFromJson(json);
}

// ============================================================================
// CALL LIFECYCLE MESSAGE PAYLOADS
// ============================================================================

@freezed
class CallInitiatePayload with _$CallInitiatePayload {
  const factory CallInitiatePayload({
    required String callAttemptId,
    required String handle,
    String? sourceId,
    required CallType callType,
    required MediaCapabilities mediaCapabilities,
    int? timestamp,
  }) = _CallInitiatePayload;

  factory CallInitiatePayload.fromJson(Map<String, dynamic> json) =>
      _$CallInitiatePayloadFromJson(json);
}

@freezed
class CallAcceptPayload with _$CallAcceptPayload {
  const factory CallAcceptPayload({
    required String callAttemptId,
    required DeviceType deviceType,
    required String deviceId,
    MediaCapabilities? mediaCapabilities,
    int? timestamp,
  }) = _CallAcceptPayload;

  factory CallAcceptPayload.fromJson(Map<String, dynamic> json) =>
      _$CallAcceptPayloadFromJson(json);
}

@freezed
class CallRejectPayload with _$CallRejectPayload {
  const factory CallRejectPayload({
    required String callAttemptId,
    required DeviceType deviceType,
    String? reason,
    int? timestamp,
  }) = _CallRejectPayload;

  factory CallRejectPayload.fromJson(Map<String, dynamic> json) =>
      _$CallRejectPayloadFromJson(json);
}

@freezed
class CallEndPayload with _$CallEndPayload {
  const factory CallEndPayload({
    required String callAttemptId,
    required CallInitiator initiator,
    CallEndReason? reason,
    int? timestamp,
  }) = _CallEndPayload;

  factory CallEndPayload.fromJson(Map<String, dynamic> json) =>
      _$CallEndPayloadFromJson(json);
}

@freezed
class CallFailedPayload with _$CallFailedPayload {
  const factory CallFailedPayload({
    required String callAttemptId,
    required String reason,
    int? timestamp,
  }) = _CallFailedPayload;

  factory CallFailedPayload.fromJson(Map<String, dynamic> json) =>
      _$CallFailedPayloadFromJson(json);
}

@freezed
class CallIncomingPayload with _$CallIncomingPayload {
  const factory CallIncomingPayload({
    required String callAttemptId,
    required String sourceId,
    required CallType callType,
    required int timestamp,
  }) = _CallIncomingPayload;

  factory CallIncomingPayload.fromJson(Map<String, dynamic> json) =>
      _$CallIncomingPayloadFromJson(json);
}

@freezed
class CallAcceptedPayload with _$CallAcceptedPayload {
  const factory CallAcceptedPayload({
    required String callAttemptId,
    required DeviceType acceptingDevice,
    required int timestamp,
  }) = _CallAcceptedPayload;

  factory CallAcceptedPayload.fromJson(Map<String, dynamic> json) =>
      _$CallAcceptedPayloadFromJson(json);
}

@freezed
class CallCancelledPayload with _$CallCancelledPayload {
  const factory CallCancelledPayload({
    required String callAttemptId,
    required String reason,
    required int timestamp,
  }) = _CallCancelledPayload;

  factory CallCancelledPayload.fromJson(Map<String, dynamic> json) =>
      _$CallCancelledPayloadFromJson(json);
}

@freezed
class CallEndedPayload with _$CallEndedPayload {
  const factory CallEndedPayload({
    required String callAttemptId,
    required int duration,
    CallEndReason? reason,
    required int timestamp,
  }) = _CallEndedPayload;

  factory CallEndedPayload.fromJson(Map<String, dynamic> json) =>
      _$CallEndedPayloadFromJson(json);
}

@freezed
class CallBusyPayload with _$CallBusyPayload {
  const factory CallBusyPayload({
    required String callAttemptId,
    required String reason,
    required int timestamp,
  }) = _CallBusyPayload;

  factory CallBusyPayload.fromJson(Map<String, dynamic> json) =>
      _$CallBusyPayloadFromJson(json);
}

@freezed
class CallUnavailablePayload with _$CallUnavailablePayload {
  const factory CallUnavailablePayload({
    required String callAttemptId,
    required String reason,
    required int timestamp,
  }) = _CallUnavailablePayload;

  factory CallUnavailablePayload.fromJson(Map<String, dynamic> json) =>
      _$CallUnavailablePayloadFromJson(json);
}

@freezed
class CallTimeoutPayload with _$CallTimeoutPayload {
  const factory CallTimeoutPayload({
    required String callAttemptId,
    required int timeoutDuration,
    required int timestamp,
  }) = _CallTimeoutPayload;

  factory CallTimeoutPayload.fromJson(Map<String, dynamic> json) =>
      _$CallTimeoutPayloadFromJson(json);
}

// ============================================================================
// WEBRTC SIGNALING MESSAGE PAYLOADS
// ============================================================================

@freezed
class WebRTCOfferPayload with _$WebRTCOfferPayload {
  const factory WebRTCOfferPayload({
    required String callAttemptId,
    required RTCSessionDescriptionInit offer,
    int? timestamp,
  }) = _WebRTCOfferPayload;

  factory WebRTCOfferPayload.fromJson(Map<String, dynamic> json) =>
      _$WebRTCOfferPayloadFromJson(json);
}

@freezed
class WebRTCAnswerPayload with _$WebRTCAnswerPayload {
  const factory WebRTCAnswerPayload({
    required String callAttemptId,
    required RTCSessionDescriptionInit answer,
    int? timestamp,
  }) = _WebRTCAnswerPayload;

  factory WebRTCAnswerPayload.fromJson(Map<String, dynamic> json) =>
      _$WebRTCAnswerPayloadFromJson(json);
}

@freezed
class WebRTCIceCandidatePayload with _$WebRTCIceCandidatePayload {
  const factory WebRTCIceCandidatePayload({
    required String callAttemptId,
    required RTCIceCandidate candidate,
    int? timestamp,
  }) = _WebRTCIceCandidatePayload;

  factory WebRTCIceCandidatePayload.fromJson(Map<String, dynamic> json) =>
      _$WebRTCIceCandidatePayloadFromJson(json);
}

// ============================================================================
// DEVICE MANAGEMENT MESSAGE PAYLOADS
// ============================================================================

@freezed
class DeviceConnectPayload with _$DeviceConnectPayload {
  const factory DeviceConnectPayload({
    required DeviceType deviceType,
    required String deviceId,
    String? pushToken,
    String? protocolVersion,
    int? timestamp,
  }) = _DeviceConnectPayload;

  factory DeviceConnectPayload.fromJson(Map<String, dynamic> json) =>
      _$DeviceConnectPayloadFromJson(json);
}

@freezed
class DeviceDisconnectPayload with _$DeviceDisconnectPayload {
  const factory DeviceDisconnectPayload({
    required String deviceId,
    int? timestamp,
  }) = _DeviceDisconnectPayload;

  factory DeviceDisconnectPayload.fromJson(Map<String, dynamic> json) =>
      _$DeviceDisconnectPayloadFromJson(json);
}

@freezed
class DeviceStatusPayload with _$DeviceStatusPayload {
  const factory DeviceStatusPayload({
    required String deviceId,
    required DeviceStatus status,
    int? timestamp,
  }) = _DeviceStatusPayload;

  factory DeviceStatusPayload.fromJson(Map<String, dynamic> json) =>
      _$DeviceStatusPayloadFromJson(json);
}

@freezed
class DeviceConnectedPayload with _$DeviceConnectedPayload {
  const factory DeviceConnectedPayload({
    required String deviceId,
    required int timestamp,
  }) = _DeviceConnectedPayload;

  factory DeviceConnectedPayload.fromJson(Map<String, dynamic> json) =>
      _$DeviceConnectedPayloadFromJson(json);
}

@freezed
class DeviceDisconnectedPayload with _$DeviceDisconnectedPayload {
  const factory DeviceDisconnectedPayload({
    required String deviceId,
    required int timestamp,
  }) = _DeviceDisconnectedPayload;

  factory DeviceDisconnectedPayload.fromJson(Map<String, dynamic> json) =>
      _$DeviceDisconnectedPayloadFromJson(json);
}

@freezed
class DeviceStatusUpdatedPayload with _$DeviceStatusUpdatedPayload {
  const factory DeviceStatusUpdatedPayload({
    required String deviceId,
    required DeviceStatus status,
    required int timestamp,
  }) = _DeviceStatusUpdatedPayload;

  factory DeviceStatusUpdatedPayload.fromJson(Map<String, dynamic> json) =>
      _$DeviceStatusUpdatedPayloadFromJson(json);
}

// ============================================================================
// MEDIA CONTROL MESSAGE PAYLOADS
// ============================================================================

@freezed
class MediaTogglePayload with _$MediaTogglePayload {
  const factory MediaTogglePayload({
    required String callAttemptId,
    required MediaToggleAction action,
    required bool success,
    int? timestamp,
  }) = _MediaTogglePayload;

  factory MediaTogglePayload.fromJson(Map<String, dynamic> json) =>
      _$MediaTogglePayloadFromJson(json);
}

@freezed
class CallEscalatePayload with _$CallEscalatePayload {
  const factory CallEscalatePayload({
    required String callAttemptId,
    required CallInitiator requestedBy,
    required MediaCapabilities mediaCapabilities,
    int? timestamp,
  }) = _CallEscalatePayload;

  factory CallEscalatePayload.fromJson(Map<String, dynamic> json) =>
      _$CallEscalatePayloadFromJson(json);
}

@freezed
class CallDowngradePayload with _$CallDowngradePayload {
  const factory CallDowngradePayload({
    required String callAttemptId,
    required CallInitiator requestedBy,
    String? reason,
    int? timestamp,
  }) = _CallDowngradePayload;

  factory CallDowngradePayload.fromJson(Map<String, dynamic> json) =>
      _$CallDowngradePayloadFromJson(json);
}

@freezed
class EscalationAcceptedPayload with _$EscalationAcceptedPayload {
  const factory EscalationAcceptedPayload({
    required String callAttemptId,
    required CallInitiator acceptedBy,
    required MediaCapabilities mediaCapabilities,
    int? timestamp,
  }) = _EscalationAcceptedPayload;

  factory EscalationAcceptedPayload.fromJson(Map<String, dynamic> json) =>
      _$EscalationAcceptedPayloadFromJson(json);
}

@freezed
class EscalationRejectedPayload with _$EscalationRejectedPayload {
  const factory EscalationRejectedPayload({
    required String callAttemptId,
    required CallInitiator rejectedBy,
    String? reason,
    int? timestamp,
  }) = _EscalationRejectedPayload;

  factory EscalationRejectedPayload.fromJson(Map<String, dynamic> json) =>
      _$EscalationRejectedPayloadFromJson(json);
}

// ============================================================================
// SYSTEM MESSAGE PAYLOADS
// ============================================================================

@freezed
class ErrorPayload with _$ErrorPayload {
  const factory ErrorPayload({
    required String code,
    required String message,
    required int timestamp,
  }) = _ErrorPayload;

  factory ErrorPayload.fromJson(Map<String, dynamic> json) =>
      _$ErrorPayloadFromJson(json);
}

@freezed
class ServerShutdownPayload with _$ServerShutdownPayload {
  const factory ServerShutdownPayload({
    required String message,
    required int gracePeriod,
    int? timestamp,
  }) = _ServerShutdownPayload;

  factory ServerShutdownPayload.fromJson(Map<String, dynamic> json) =>
      _$ServerShutdownPayloadFromJson(json);
}
