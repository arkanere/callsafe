/// CallSafe WebRTC Signaling Protocol Constants
/// Version: 2.0.0
///
/// AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
/// To regenerate: node protocol/generate-dart.js

const String protocolVersion = '2.0.0';

/// All WebSocket message type strings.
class MessageTypes {
  static const String ping = 'ping';
  static const String pong = 'pong';
  static const String error = 'error';
  static const String serverShutdown = 'server:shutdown';
  static const String deviceConnect = 'device:connect';
  static const String deviceConnected = 'device:connected';
  static const String deviceDisconnect = 'device:disconnect';
  static const String deviceDisconnected = 'device:disconnected';
  static const String deviceStatus = 'device:status';
  static const String deviceStatusUpdated = 'device:status-updated';
  static const String callInitiate = 'call:initiate';
  static const String callInitiated = 'call:initiated';
  static const String callIncoming = 'call:incoming';
  static const String callCancel = 'call:cancel';
  static const String callCancelled = 'call:cancelled';
  static const String callAccept = 'call:accept';
  static const String callAccepted = 'call:accepted';
  static const String callReject = 'call:reject';
  static const String callUnavailable = 'call:unavailable';
  static const String callBusy = 'call:busy';
  static const String callEnd = 'call:end';
  static const String callEnded = 'call:ended';
  static const String callFailed = 'call:failed';
  static const String callTimeout = 'call:timeout';
  static const String callReconnect = 'call:reconnect';
  static const String callReconnected = 'call:reconnected';
  static const String webrtcOffer = 'webrtc:offer';
  static const String webrtcAnswer = 'webrtc:answer';
  static const String webrtcIceCandidate = 'webrtc:ice-candidate';
  static const String mediaToggle = 'media:toggle';
  static const String callEscalate = 'call:escalate';
  static const String escalationRequested = 'escalation:requested';
  static const String escalationAccept = 'escalation:accept';
  static const String escalationReject = 'escalation:reject';
  static const String escalationAccepted = 'escalation:accepted';
  static const String escalationRejected = 'escalation:rejected';
  static const String callDowngrade = 'call:downgrade';
  static const String callDowngraded = 'call:downgraded';
}
