/// CallSafe WebRTC Signaling Protocol Enums
/// Version: 2.0.0
///
/// AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
/// To regenerate: node protocol/generate-dart.js

import 'package:json_annotation/json_annotation.dart';

/// CallType
enum CallType {
  @JsonValue('voice')
  voice('voice'),
  @JsonValue('video')
  video('video');

  const CallType(this.value);
  final String value;

  static CallType fromString(String value) {
    return CallType.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallType: $value'),
    );
  }
}

/// DeviceType
enum DeviceType {
  @JsonValue('web')
  web('web'),
  @JsonValue('mobile')
  mobile('mobile');

  const DeviceType(this.value);
  final String value;

  static DeviceType fromString(String value) {
    return DeviceType.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid DeviceType: $value'),
    );
  }
}

/// DeviceStatus
enum DeviceStatus {
  @JsonValue('available')
  available('available'),
  @JsonValue('unavailable')
  unavailable('unavailable');

  const DeviceStatus(this.value);
  final String value;

  static DeviceStatus fromString(String value) {
    return DeviceStatus.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid DeviceStatus: $value'),
    );
  }
}

/// Role
enum Role {
  @JsonValue('customer')
  customer('customer'),
  @JsonValue('business')
  business('business');

  const Role(this.value);
  final String value;

  static Role fromString(String value) {
    return Role.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid Role: $value'),
    );
  }
}

/// MediaTrackType
enum MediaTrackType {
  @JsonValue('audio')
  audio('audio'),
  @JsonValue('video')
  video('video');

  const MediaTrackType(this.value);
  final String value;

  static MediaTrackType fromString(String value) {
    return MediaTrackType.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid MediaTrackType: $value'),
    );
  }
}

/// MediaToggleAction
enum MediaToggleAction {
  @JsonValue('enable_camera')
  enableCamera('enable_camera'),
  @JsonValue('disable_camera')
  disableCamera('disable_camera'),
  @JsonValue('enable_microphone')
  enableMicrophone('enable_microphone'),
  @JsonValue('disable_microphone')
  disableMicrophone('disable_microphone'),
  @JsonValue('flip_camera')
  flipCamera('flip_camera');

  const MediaToggleAction(this.value);
  final String value;

  static MediaToggleAction fromString(String value) {
    return MediaToggleAction.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid MediaToggleAction: $value'),
    );
  }
}

/// CallState
enum CallState {
  @JsonValue('initiated')
  initiated('initiated'),
  @JsonValue('ringing')
  ringing('ringing'),
  @JsonValue('connecting')
  connecting('connecting'),
  @JsonValue('connected')
  connected('connected'),
  @JsonValue('escalation_pending')
  escalationPending('escalation_pending'),
  @JsonValue('ended')
  ended('ended'),
  @JsonValue('failed')
  failed('failed'),
  @JsonValue('cancelled')
  cancelled('cancelled'),
  @JsonValue('busy')
  busy('busy'),
  @JsonValue('unavailable')
  unavailable('unavailable'),
  @JsonValue('timeout')
  timeout('timeout');

  const CallState(this.value);
  final String value;

  static CallState fromString(String value) {
    return CallState.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallState: $value'),
    );
  }
}

/// CallEndReason
enum CallEndReason {
  @JsonValue('normal')
  normal('normal'),
  @JsonValue('customer_hangup')
  customerHangup('customer_hangup'),
  @JsonValue('business_hangup')
  businessHangup('business_hangup');

  const CallEndReason(this.value);
  final String value;

  static CallEndReason fromString(String value) {
    return CallEndReason.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallEndReason: $value'),
    );
  }
}

/// CallFailReason
enum CallFailReason {
  @JsonValue('media_permission_denied')
  mediaPermissionDenied('media_permission_denied'),
  @JsonValue('connection_failed')
  connectionFailed('connection_failed'),
  @JsonValue('peer_disconnected')
  peerDisconnected('peer_disconnected'),
  @JsonValue('internal_error')
  internalError('internal_error');

  const CallFailReason(this.value);
  final String value;

  static CallFailReason fromString(String value) {
    return CallFailReason.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallFailReason: $value'),
    );
  }
}

/// CallCancelReason
enum CallCancelReason {
  @JsonValue('cancelled_by_caller')
  cancelledByCaller('cancelled_by_caller'),
  @JsonValue('answered_elsewhere')
  answeredElsewhere('answered_elsewhere');

  const CallCancelReason(this.value);
  final String value;

  static CallCancelReason fromString(String value) {
    return CallCancelReason.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallCancelReason: $value'),
    );
  }
}

/// CallUnavailableReason
enum CallUnavailableReason {
  @JsonValue('no_devices_available')
  noDevicesAvailable('no_devices_available'),
  @JsonValue('all_devices_rejected')
  allDevicesRejected('all_devices_rejected');

  const CallUnavailableReason(this.value);
  final String value;

  static CallUnavailableReason fromString(String value) {
    return CallUnavailableReason.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallUnavailableReason: $value'),
    );
  }
}

/// CallBusyReason
enum CallBusyReason {
  @JsonValue('all_devices_busy')
  allDevicesBusy('all_devices_busy');

  const CallBusyReason(this.value);
  final String value;

  static CallBusyReason fromString(String value) {
    return CallBusyReason.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallBusyReason: $value'),
    );
  }
}

/// TimeoutPhase
enum TimeoutPhase {
  @JsonValue('ringing')
  ringing('ringing'),
  @JsonValue('connecting')
  connecting('connecting');

  const TimeoutPhase(this.value);
  final String value;

  static TimeoutPhase fromString(String value) {
    return TimeoutPhase.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid TimeoutPhase: $value'),
    );
  }
}

/// EscalationRejectReason
enum EscalationRejectReason {
  @JsonValue('declined')
  declined('declined'),
  @JsonValue('timeout')
  timeout('timeout'),
  @JsonValue('unsupported')
  unsupported('unsupported');

  const EscalationRejectReason(this.value);
  final String value;

  static EscalationRejectReason fromString(String value) {
    return EscalationRejectReason.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid EscalationRejectReason: $value'),
    );
  }
}

/// ErrorCode
enum ErrorCode {
  @JsonValue('invalid_json')
  invalidJson('invalid_json'),
  @JsonValue('invalid_message')
  invalidMessage('invalid_message'),
  @JsonValue('validation_error')
  validationError('validation_error'),
  @JsonValue('unknown_message_type')
  unknownMessageType('unknown_message_type'),
  @JsonValue('not_authenticated')
  notAuthenticated('not_authenticated'),
  @JsonValue('auth_failed')
  authFailed('auth_failed'),
  @JsonValue('token_expired')
  tokenExpired('token_expired'),
  @JsonValue('device_mismatch')
  deviceMismatch('device_mismatch'),
  @JsonValue('protocol_incompatible')
  protocolIncompatible('protocol_incompatible'),
  @JsonValue('rate_limited')
  rateLimited('rate_limited'),
  @JsonValue('not_authorized')
  notAuthorized('not_authorized'),
  @JsonValue('call_not_found')
  callNotFound('call_not_found'),
  @JsonValue('invalid_state')
  invalidState('invalid_state'),
  @JsonValue('not_call_participant')
  notCallParticipant('not_call_participant'),
  @JsonValue('duplicate_call_id')
  duplicateCallId('duplicate_call_id'),
  @JsonValue('peer_not_connected')
  peerNotConnected('peer_not_connected'),
  @JsonValue('device_not_found')
  deviceNotFound('device_not_found'),
  @JsonValue('server_error')
  serverError('server_error');

  const ErrorCode(this.value);
  final String value;

  static ErrorCode fromString(String value) {
    return ErrorCode.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid ErrorCode: $value'),
    );
  }
}
