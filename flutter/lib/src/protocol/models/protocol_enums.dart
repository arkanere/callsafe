/// Protocol Enums
/// Defines all enum types used in the CallSafe protocol

/// Call Types
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

/// Device Types
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

/// Device Status
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

/// Call States
/// Defines all possible states a call can be in.
enum CallState {
  // Voice and Video Common States
  initiated('initiated'),
  ringing('ringing'),
  connecting('connecting'),
  connected('connected'),
  ended('ended'),
  failed('failed'),
  cancelled('cancelled'),
  busy('busy'),
  unavailable('unavailable'),
  timeout('timeout'),

  // Video-Specific States
  cameraPermissionDenied('camera_permission_denied'),
  videoPausedByUser('video_paused_by_user'),
  videoPausedBandwidth('video_paused_bandwidth'),
  escalationPending('escalation_pending');

  const CallState(this.value);
  final String value;

  static CallState fromString(String value) {
    return CallState.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallState: $value'),
    );
  }
}

/// Call End Reasons
enum CallEndReason {
  normal('normal'),
  customerHangup('customer_hangup'),
  businessHangup('business_hangup'),
  connectionFailed('connection_failed'),
  timeout('timeout'),
  rejected('rejected');

  const CallEndReason(this.value);
  final String value;

  static CallEndReason fromString(String value) {
    return CallEndReason.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallEndReason: $value'),
    );
  }
}

/// Call Initiator
enum CallInitiator {
  customer('customer'),
  business('business');

  const CallInitiator(this.value);
  final String value;

  static CallInitiator fromString(String value) {
    return CallInitiator.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid CallInitiator: $value'),
    );
  }
}

/// Media Track Types
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

/// Media Toggle Actions
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
