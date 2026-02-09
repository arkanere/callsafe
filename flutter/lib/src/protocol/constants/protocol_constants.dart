/// CallSafe WebRTC Protocol Specification
/// Version: 1.0.0
///
/// This file defines the complete protocol for WebSocket communication between
/// clients (web embed, web dashboard, mobile apps) and the signaling server.
///
/// All components must implement this protocol specification to ensure compatibility.

const String protocolVersion = '1.0.0';

// ============================================================================
// MESSAGE TYPE CONSTANTS
// ============================================================================

/// Call Lifecycle Messages
/// These messages manage the complete lifecycle of a call from initiation to termination.
class CallLifecycleMessages {
  // Client to Server
  static const String callInitiate = 'call:initiate';
  static const String callAccept = 'call:accept';
  static const String callReject = 'call:reject';
  static const String callEnd = 'call:end';
  static const String callFailed = 'call:failed';

  // Server to Client
  static const String callIncoming = 'call:incoming';
  static const String callAccepted = 'call:accepted';
  static const String callCancelled = 'call:cancelled';
  static const String callEnded = 'call:ended';
  static const String callBusy = 'call:busy';
  static const String callUnavailable = 'call:unavailable';
  static const String callTimeout = 'call:timeout';
}

/// WebRTC Signaling Messages
/// These messages handle WebRTC peer connection negotiation (SDP and ICE).
class WebRTCMessages {
  static const String webrtcOffer = 'webrtc:offer';
  static const String webrtcAnswer = 'webrtc:answer';
  static const String webrtcIceCandidate = 'webrtc:ice-candidate';
}

/// Device Management Messages
/// These messages handle device registration and availability status.
class DeviceMessages {
  // Client to Server
  static const String deviceConnect = 'device:connect';
  static const String deviceDisconnect = 'device:disconnect';
  static const String deviceStatus = 'device:status';

  // Server to Client
  static const String deviceConnected = 'device:connected';
  static const String deviceDisconnected = 'device:disconnected';
  static const String deviceStatusUpdated = 'device:status-updated';
}

/// Media Control Messages (Video Extension)
/// These messages handle mid-call media changes for video calling.
class MediaMessages {
  static const String mediaToggle = 'media:toggle';
  static const String callEscalate = 'call:escalate';
  static const String callDowngrade = 'call:downgrade';
  static const String escalationAccepted = 'escalation:accepted';
  static const String escalationRejected = 'escalation:rejected';
}

/// System Messages
/// Socket.IO system events and server notifications.
class SystemMessages {
  static const String connect = 'connect';
  static const String disconnect = 'disconnect';
  static const String error = 'error';
  static const String serverShutdown = 'server:shutdown';
}

/// All message types combined for easy access
class MessageTypes {
  // Call Lifecycle
  static const String callInitiate = CallLifecycleMessages.callInitiate;
  static const String callAccept = CallLifecycleMessages.callAccept;
  static const String callReject = CallLifecycleMessages.callReject;
  static const String callEnd = CallLifecycleMessages.callEnd;
  static const String callFailed = CallLifecycleMessages.callFailed;
  static const String callIncoming = CallLifecycleMessages.callIncoming;
  static const String callAccepted = CallLifecycleMessages.callAccepted;
  static const String callCancelled = CallLifecycleMessages.callCancelled;
  static const String callEnded = CallLifecycleMessages.callEnded;
  static const String callBusy = CallLifecycleMessages.callBusy;
  static const String callUnavailable = CallLifecycleMessages.callUnavailable;
  static const String callTimeout = CallLifecycleMessages.callTimeout;

  // WebRTC
  static const String webrtcOffer = WebRTCMessages.webrtcOffer;
  static const String webrtcAnswer = WebRTCMessages.webrtcAnswer;
  static const String webrtcIceCandidate = WebRTCMessages.webrtcIceCandidate;

  // Device
  static const String deviceConnect = DeviceMessages.deviceConnect;
  static const String deviceDisconnect = DeviceMessages.deviceDisconnect;
  static const String deviceStatus = DeviceMessages.deviceStatus;
  static const String deviceConnected = DeviceMessages.deviceConnected;
  static const String deviceDisconnected = DeviceMessages.deviceDisconnected;
  static const String deviceStatusUpdated = DeviceMessages.deviceStatusUpdated;

  // Media
  static const String mediaToggle = MediaMessages.mediaToggle;
  static const String callEscalate = MediaMessages.callEscalate;
  static const String callDowngrade = MediaMessages.callDowngrade;
  static const String escalationAccepted = MediaMessages.escalationAccepted;
  static const String escalationRejected = MediaMessages.escalationRejected;

  // System
  static const String connect = SystemMessages.connect;
  static const String disconnect = SystemMessages.disconnect;
  static const String error = SystemMessages.error;
  static const String serverShutdown = SystemMessages.serverShutdown;
}
