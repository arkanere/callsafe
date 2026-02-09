/**
 * CallSafe WebRTC Protocol Specification
 * Version: 1.0.0
 *
 * This file defines the complete protocol for WebSocket communication between
 * clients (web embed, web dashboard, mobile apps) and the signaling server.
 *
 * All components must implement this protocol specification to ensure compatibility.
 */

export const PROTOCOL_VERSION = '1.0.0';

// ============================================================================
// MESSAGE TYPE CONSTANTS
// ============================================================================

/**
 * Call Lifecycle Messages
 * These messages manage the complete lifecycle of a call from initiation to termination.
 */
export const CallLifecycleMessages = {
  // Client to Server
  CALL_INITIATE: 'call:initiate',      // Customer initiates a call
  CALL_ACCEPT: 'call:accept',          // Agent accepts incoming call
  CALL_REJECT: 'call:reject',          // Agent rejects incoming call
  CALL_END: 'call:end',                // Either party ends active call
  CALL_FAILED: 'call:failed',          // Report call failure

  // Server to Client
  CALL_INCOMING: 'call:incoming',      // Notify agent of incoming call
  CALL_ACCEPTED: 'call:accepted',      // Confirm call was accepted
  CALL_CANCELLED: 'call:cancelled',    // Call was cancelled
  CALL_ENDED: 'call:ended',            // Call has ended
  CALL_BUSY: 'call:busy',              // All agents busy
  CALL_UNAVAILABLE: 'call:unavailable', // No agents available
  CALL_TIMEOUT: 'call:timeout',        // Call timed out
} as const;

/**
 * WebRTC Signaling Messages
 * These messages handle WebRTC peer connection negotiation (SDP and ICE).
 */
export const WebRTCMessages = {
  WEBRTC_OFFER: 'webrtc:offer',              // SDP offer
  WEBRTC_ANSWER: 'webrtc:answer',            // SDP answer
  WEBRTC_ICE_CANDIDATE: 'webrtc:ice-candidate', // ICE candidate
} as const;

/**
 * Device Management Messages
 * These messages handle device registration and availability status.
 */
export const DeviceMessages = {
  // Client to Server
  DEVICE_CONNECT: 'device:connect',          // Register device
  DEVICE_DISCONNECT: 'device:disconnect',    // Unregister device
  DEVICE_STATUS: 'device:status',            // Update availability status

  // Server to Client
  DEVICE_CONNECTED: 'device:connected',      // Device registration confirmed
  DEVICE_DISCONNECTED: 'device:disconnected', // Device logout confirmed
  DEVICE_STATUS_UPDATED: 'device:status-updated', // Status change confirmed
} as const;

/**
 * Media Control Messages (Video Extension)
 * These messages handle mid-call media changes for video calling.
 */
export const MediaMessages = {
  MEDIA_TOGGLE: 'media:toggle',              // Toggle camera/microphone
  CALL_ESCALATE: 'call:escalate',            // Request voice-to-video escalation
  CALL_DOWNGRADE: 'call:downgrade',          // Request video-to-voice downgrade
  ESCALATION_ACCEPTED: 'escalation:accepted', // Peer accepted escalation
  ESCALATION_REJECTED: 'escalation:rejected', // Peer rejected escalation
} as const;

/**
 * System Messages
 * Socket.IO system events and server notifications.
 */
export const SystemMessages = {
  CONNECT: 'connect',                    // Socket.IO connection established
  DISCONNECT: 'disconnect',              // Socket.IO disconnected
  ERROR: 'error',                        // Error notification
  SERVER_SHUTDOWN: 'server:shutdown',    // Server shutting down
} as const;

/**
 * All message types combined for easy access
 */
export const MessageTypes = {
  ...CallLifecycleMessages,
  ...WebRTCMessages,
  ...DeviceMessages,
  ...MediaMessages,
  ...SystemMessages,
} as const;

// ============================================================================
// ENUMS AND TYPE DEFINITIONS
// ============================================================================

/**
 * Call Types
 */
export enum CallType {
  VOICE = 'voice',
  VIDEO = 'video',
}

/**
 * Device Types
 */
export enum DeviceType {
  WEB = 'web',
  MOBILE = 'mobile',
}

/**
 * Device Status
 */
export enum DeviceStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
}

/**
 * Call States
 * Defines all possible states a call can be in.
 */
export enum CallState {
  // Voice and Video Common States
  INITIATED = 'initiated',               // Call has been initiated
  RINGING = 'ringing',                   // Ringing on agent devices
  CONNECTING = 'connecting',             // WebRTC connection in progress
  CONNECTED = 'connected',               // Call is active
  ENDED = 'ended',                       // Call has ended
  FAILED = 'failed',                     // Call failed
  CANCELLED = 'cancelled',               // Call was cancelled
  BUSY = 'busy',                         // All agents busy
  UNAVAILABLE = 'unavailable',           // No agents available
  TIMEOUT = 'timeout',                   // Call timed out

  // Video-Specific States
  CAMERA_PERMISSION_DENIED = 'camera_permission_denied',
  VIDEO_PAUSED_BY_USER = 'video_paused_by_user',
  VIDEO_PAUSED_BANDWIDTH = 'video_paused_bandwidth',
  ESCALATION_PENDING = 'escalation_pending', // Waiting for peer to accept video
}

/**
 * Call End Reasons
 */
export enum CallEndReason {
  NORMAL = 'normal',                     // Normal call termination
  CUSTOMER_HANGUP = 'customer_hangup',   // Customer ended call
  BUSINESS_HANGUP = 'business_hangup',   // Business ended call
  CONNECTION_FAILED = 'connection_failed', // WebRTC connection failed
  TIMEOUT = 'timeout',                   // Call timed out
  REJECTED = 'rejected',                 // Call was rejected
}

/**
 * Call Initiator
 */
export enum CallInitiator {
  CUSTOMER = 'customer',
  BUSINESS = 'business',
}

/**
 * Media Track Types
 */
export enum MediaTrackType {
  AUDIO = 'audio',
  VIDEO = 'video',
}

/**
 * Media Toggle Actions
 */
export enum MediaToggleAction {
  ENABLE_CAMERA = 'enable_camera',
  DISABLE_CAMERA = 'disable_camera',
  ENABLE_MICROPHONE = 'enable_microphone',
  DISABLE_MICROPHONE = 'disable_microphone',
  FLIP_CAMERA = 'flip_camera',
}

// ============================================================================
// MESSAGE PAYLOAD INTERFACES
// ============================================================================

/**
 * Base interface for all messages
 */
interface BaseMessage {
  timestamp?: number;
}

/**
 * Media Capabilities
 * Describes what media tracks a peer can send/receive
 */
export interface MediaCapabilities {
  canSendAudio: boolean;
  canSendVideo: boolean;
  canReceiveAudio: boolean;
  canReceiveVideo: boolean;
}

// ----------------------------------------------------------------------------
// Call Lifecycle Message Payloads
// ----------------------------------------------------------------------------

export interface CallInitiatePayload extends BaseMessage {
  callAttemptId: string;
  handle: string;
  sourceId?: string;
  callType: CallType;                    // NEW: voice or video
  mediaCapabilities: MediaCapabilities;  // NEW: peer's media capabilities
}

export interface CallAcceptPayload extends BaseMessage {
  callAttemptId: string;
  deviceType: DeviceType;
  deviceId: string;
  mediaCapabilities?: MediaCapabilities; // NEW: accepting peer's capabilities
}

export interface CallRejectPayload extends BaseMessage {
  callAttemptId: string;
  deviceType: DeviceType;
  reason?: string;
}

export interface CallEndPayload extends BaseMessage {
  callAttemptId: string;
  initiator: CallInitiator;
  reason?: CallEndReason;
}

export interface CallFailedPayload extends BaseMessage {
  callAttemptId: string;
  reason: string;
}

export interface CallIncomingPayload extends BaseMessage {
  callAttemptId: string;
  sourceId: string;
  callType: CallType;                    // NEW: indicates if video call
  timestamp: number;
}

export interface CallAcceptedPayload extends BaseMessage {
  callAttemptId: string;
  acceptingDevice: DeviceType;
  timestamp: number;
}

export interface CallCancelledPayload extends BaseMessage {
  callAttemptId: string;
  reason: string;
  timestamp: number;
}

export interface CallEndedPayload extends BaseMessage {
  callAttemptId: string;
  duration: number;
  reason?: CallEndReason;
  timestamp: number;
}

export interface CallBusyPayload extends BaseMessage {
  callAttemptId: string;
  reason: string;
  timestamp: number;
}

export interface CallUnavailablePayload extends BaseMessage {
  callAttemptId: string;
  reason: string;
  timestamp: number;
}

export interface CallTimeoutPayload extends BaseMessage {
  callAttemptId: string;
  timeoutDuration: number;
  timestamp: number;
}

// ----------------------------------------------------------------------------
// WebRTC Signaling Message Payloads
// ----------------------------------------------------------------------------

// WebRTC types for cross-platform compatibility
export interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface RTCIceCandidate {
  candidate: string;
  sdpMLineIndex?: number | null;
  sdpMid?: string | null;
}

export interface WebRTCOfferPayload extends BaseMessage {
  callAttemptId: string;
  offer: RTCSessionDescriptionInit;
  timestamp?: number;
}

export interface WebRTCAnswerPayload extends BaseMessage {
  callAttemptId: string;
  answer: RTCSessionDescriptionInit;
  timestamp?: number;
}

export interface WebRTCIceCandidatePayload extends BaseMessage {
  callAttemptId: string;
  candidate: RTCIceCandidate;
  timestamp?: number;
}

// ----------------------------------------------------------------------------
// Device Management Message Payloads
// ----------------------------------------------------------------------------

export interface DeviceConnectPayload extends BaseMessage {
  deviceType: DeviceType;
  deviceId: string;
  pushToken?: string;  // For mobile devices (FCM token)
  protocolVersion?: string; // NEW: Protocol version negotiation
}

export interface DeviceDisconnectPayload extends BaseMessage {
  deviceId: string;
}

export interface DeviceStatusPayload extends BaseMessage {
  deviceId: string;
  status: DeviceStatus;
}

export interface DeviceConnectedPayload extends BaseMessage {
  deviceId: string;
  timestamp: number;
}

export interface DeviceDisconnectedPayload extends BaseMessage {
  deviceId: string;
  timestamp: number;
}

export interface DeviceStatusUpdatedPayload extends BaseMessage {
  deviceId: string;
  status: DeviceStatus;
  timestamp: number;
}

// ----------------------------------------------------------------------------
// Media Control Message Payloads (Video Extension)
// ----------------------------------------------------------------------------

export interface MediaTogglePayload extends BaseMessage {
  callAttemptId: string;
  action: MediaToggleAction;
  success: boolean;
}

export interface CallEscalatePayload extends BaseMessage {
  callAttemptId: string;
  requestedBy: CallInitiator;
  mediaCapabilities: MediaCapabilities;
}

export interface CallDowngradePayload extends BaseMessage {
  callAttemptId: string;
  requestedBy: CallInitiator;
  reason?: string;
}

export interface EscalationAcceptedPayload extends BaseMessage {
  callAttemptId: string;
  acceptedBy: CallInitiator;
  mediaCapabilities: MediaCapabilities;
}

export interface EscalationRejectedPayload extends BaseMessage {
  callAttemptId: string;
  rejectedBy: CallInitiator;
  reason?: string;
}

// ----------------------------------------------------------------------------
// System Message Payloads
// ----------------------------------------------------------------------------

export interface ErrorPayload extends BaseMessage {
  code: string;
  message: string;
  timestamp: number;
}

export interface ServerShutdownPayload extends BaseMessage {
  message: string;
  gracePeriod: number; // milliseconds
}

// ============================================================================
// STATE MACHINE DEFINITION
// ============================================================================

/**
 * Valid state transitions
 * Maps current state -> allowed next states
 */
export const StateTransitions: Record<CallState, CallState[]> = {
  [CallState.INITIATED]: [
    CallState.RINGING,
    CallState.BUSY,
    CallState.UNAVAILABLE,
    CallState.CANCELLED,
    CallState.FAILED,
  ],
  [CallState.RINGING]: [
    CallState.CONNECTING,
    CallState.TIMEOUT,
    CallState.CANCELLED,
    CallState.FAILED,
  ],
  [CallState.CONNECTING]: [
    CallState.CONNECTED,
    CallState.CAMERA_PERMISSION_DENIED,
    CallState.FAILED,
    CallState.CANCELLED,
  ],
  [CallState.CONNECTED]: [
    CallState.ENDED,
    CallState.FAILED,
    CallState.ESCALATION_PENDING,
    CallState.VIDEO_PAUSED_BY_USER,
    CallState.VIDEO_PAUSED_BANDWIDTH,
  ],
  [CallState.ESCALATION_PENDING]: [
    CallState.CONNECTED,  // Escalation accepted
    CallState.ENDED,
    CallState.FAILED,
  ],
  [CallState.VIDEO_PAUSED_BY_USER]: [
    CallState.CONNECTED,  // Video resumed
    CallState.ENDED,
    CallState.FAILED,
  ],
  [CallState.VIDEO_PAUSED_BANDWIDTH]: [
    CallState.CONNECTED,  // Bandwidth recovered
    CallState.ENDED,
    CallState.FAILED,
  ],
  [CallState.CAMERA_PERMISSION_DENIED]: [
    CallState.CONNECTED,  // Fallback to voice-only
    CallState.ENDED,
    CallState.FAILED,
  ],
  // Terminal states
  [CallState.ENDED]: [],
  [CallState.FAILED]: [],
  [CallState.CANCELLED]: [],
  [CallState.BUSY]: [],
  [CallState.UNAVAILABLE]: [],
  [CallState.TIMEOUT]: [],
};

/**
 * Check if a state transition is valid
 */
export function isValidStateTransition(
  currentState: CallState,
  nextState: CallState
): boolean {
  const allowedStates = StateTransitions[currentState];
  return allowedStates.includes(nextState);
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Field validators
 */
export const Validators = {
  uuid: (value: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  handle: (value: string): boolean => {
    return typeof value === 'string' && value.length > 0 && value.length <= 255;
  },

  deviceId: (value: string): boolean => {
    return typeof value === 'string' && value.length > 0;
  },

  callType: (value: string): boolean => {
    return Object.values(CallType).includes(value as CallType);
  },

  deviceType: (value: string): boolean => {
    return Object.values(DeviceType).includes(value as DeviceType);
  },

  deviceStatus: (value: string): boolean => {
    return Object.values(DeviceStatus).includes(value as DeviceStatus);
  },

  callInitiator: (value: string): boolean => {
    return Object.values(CallInitiator).includes(value as CallInitiator);
  },

  mediaToggleAction: (value: string): boolean => {
    return Object.values(MediaToggleAction).includes(value as MediaToggleAction);
  },

  protocolVersion: (value: string): boolean => {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    return versionRegex.test(value);
  },
};

/**
 * Message validation rules
 * Defines required and optional fields for each message type
 */
export const MessageSchemas = {
  [MessageTypes.CALL_INITIATE]: {
    required: ['callAttemptId', 'handle', 'callType', 'mediaCapabilities'],
    optional: ['sourceId', 'timestamp'],
    validators: {
      callAttemptId: Validators.uuid,
      handle: Validators.handle,
      callType: Validators.callType,
    },
  },
  [MessageTypes.CALL_ACCEPT]: {
    required: ['callAttemptId', 'deviceType', 'deviceId'],
    optional: ['mediaCapabilities', 'timestamp'],
    validators: {
      callAttemptId: Validators.uuid,
      deviceType: Validators.deviceType,
      deviceId: Validators.deviceId,
    },
  },
  [MessageTypes.CALL_REJECT]: {
    required: ['callAttemptId', 'deviceType'],
    optional: ['reason', 'timestamp'],
    validators: {
      callAttemptId: Validators.uuid,
      deviceType: Validators.deviceType,
    },
  },
  [MessageTypes.CALL_END]: {
    required: ['callAttemptId', 'initiator'],
    optional: ['reason', 'timestamp'],
    validators: {
      callAttemptId: Validators.uuid,
      initiator: Validators.callInitiator,
    },
  },
  [MessageTypes.DEVICE_CONNECT]: {
    required: ['deviceType', 'deviceId'],
    optional: ['pushToken', 'protocolVersion', 'timestamp'],
    validators: {
      deviceType: Validators.deviceType,
      deviceId: Validators.deviceId,
      protocolVersion: Validators.protocolVersion,
    },
  },
  [MessageTypes.DEVICE_STATUS]: {
    required: ['deviceId', 'status'],
    optional: ['timestamp'],
    validators: {
      deviceId: Validators.deviceId,
      status: Validators.deviceStatus,
    },
  },
  [MessageTypes.MEDIA_TOGGLE]: {
    required: ['callAttemptId', 'action', 'success'],
    optional: ['timestamp'],
    validators: {
      callAttemptId: Validators.uuid,
      action: Validators.mediaToggleAction,
    },
  },
  [MessageTypes.CALL_ESCALATE]: {
    required: ['callAttemptId', 'requestedBy', 'mediaCapabilities'],
    optional: ['timestamp'],
    validators: {
      callAttemptId: Validators.uuid,
      requestedBy: Validators.callInitiator,
    },
  },
  [MessageTypes.CALL_DOWNGRADE]: {
    required: ['callAttemptId', 'requestedBy'],
    optional: ['reason', 'timestamp'],
    validators: {
      callAttemptId: Validators.uuid,
      requestedBy: Validators.callInitiator,
    },
  },
} as const;

/**
 * Validate a message payload against its schema
 */
export function validateMessage(
  messageType: string,
  payload: any
): { valid: boolean; errors: string[] } {
  const schema = MessageSchemas[messageType as keyof typeof MessageSchemas];

  if (!schema) {
    return { valid: false, errors: [`Unknown message type: ${messageType}`] };
  }

  const errors: string[] = [];

  // Check required fields
  for (const field of schema.required) {
    if (!(field in payload)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate field values
  if (schema.validators) {
    for (const [field, validator] of Object.entries(schema.validators)) {
      if (field in payload && !validator(payload[field])) {
        errors.push(`Invalid value for field: ${field}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// PROTOCOL VERSION NEGOTIATION
// ============================================================================

/**
 * Parse and compare protocol versions
 */
export function parseVersion(version?: string): { major: number; minor: number; patch: number } | null {
  if (!version) return null;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
  };
}

/**
 * Check if client version is compatible with server version
 * Compatible if major versions match
 */
export function isVersionCompatible(clientVersion?: string, serverVersion?: string): boolean {
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);

  if (!client || !server) return false;

  return client.major === server.major;
}

/**
 * Get the negotiated protocol version (use lower version for compatibility)
 */
export function getNegotiatedVersion(clientVersion?: string, serverVersion?: string): string | null {
  if (!clientVersion || !serverVersion) return null;
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);

  if (!client || !server) return null;
  if (client.major !== server.major) return null;

  // Use the lower minor version for compatibility
  if (client.minor < server.minor) {
    return clientVersion;
  } else if (server.minor < client.minor) {
    return serverVersion;
  }

  // Same minor version, use lower patch version
  return client.patch <= server.patch ? clientVersion : serverVersion;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PROTOCOL_VERSION,
  MessageTypes,
  CallType,
  DeviceType,
  DeviceStatus,
  CallState,
  CallEndReason,
  CallInitiator,
  MediaTrackType,
  MediaToggleAction,
  StateTransitions,
  isValidStateTransition,
  Validators,
  MessageSchemas,
  validateMessage,
  parseVersion,
  isVersionCompatible,
  getNegotiatedVersion,
};
