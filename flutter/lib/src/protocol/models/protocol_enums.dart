/// CallSafe WebRTC Signaling Protocol Enums
/// Version: 2.0.0
///
/// AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
/// To regenerate: node protocol/generate-dart.js

/// CallType
enum CallType {
  voice('voice'),
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
  web('web'),
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
  available('available'),
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
  customer('customer'),
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
  audio('audio'),
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
  enableCamera('enable_camera'),
  disableCamera('disable_camera'),
  enableMicrophone('enable_microphone'),
  disableMicrophone('disable_microphone'),
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
  initiated('initiated'),
  ringing('ringing'),
  connecting('connecting'),
  connected('connected'),
  escalationPending('escalation_pending'),
  ended('ended'),
  failed('failed'),
  cancelled('cancelled'),
  busy('busy'),
  unavailable('unavailable'),
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
  normal('normal'),
  customerHangup('customer_hangup'),
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
  mediaPermissionDenied('media_permission_denied'),
  connectionFailed('connection_failed'),
  peerDisconnected('peer_disconnected'),
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
  cancelledByCaller('cancelled_by_caller'),
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
  noDevicesAvailable('no_devices_available'),
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
  ringing('ringing'),
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
  declined('declined'),
  timeout('timeout'),
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
  invalidJson('invalid_json'),
  invalidMessage('invalid_message'),
  validationError('validation_error'),
  unknownMessageType('unknown_message_type'),
  notAuthenticated('not_authenticated'),
  authFailed('auth_failed'),
  tokenExpired('token_expired'),
  deviceMismatch('device_mismatch'),
  protocolIncompatible('protocol_incompatible'),
  rateLimited('rate_limited'),
  notAuthorized('not_authorized'),
  callNotFound('call_not_found'),
  invalidState('invalid_state'),
  notCallParticipant('not_call_participant'),
  duplicateCallId('duplicate_call_id'),
  peerNotConnected('peer_not_connected'),
  deviceNotFound('device_not_found'),
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
