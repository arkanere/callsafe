/**
 * CallSafe WebRTC Signaling Protocol
 * Version: 2.0.0
 *
 * AUTO-GENERATED from protocol.json — DO NOT EDIT MANUALLY.
 * protocol.json is the canonical specification; to regenerate this file:
 *   node generate-ts.js
 *
 * Normative prose (transport, auth, routing, flows) lives in README.md.
 */

export const PROTOCOL_VERSION = '2.0.0';

// ============================================================================
// TRANSPORT
// ============================================================================

/**
 * Every protocol message is a single WebSocket text frame containing one JSON object with a required string field "type"; all other payload fields are flat siblings of "type".
 * Timestamps: ms since Unix epoch. Durations: ms.
 */
export const Transport = {
  HEARTBEAT_INTERVAL_MS: 25000,
  SERVER_IDLE_CLOSE_MS: 60000,
} as const;

/** Server-side timer defaults (ms). Servers may override via configuration. */
export const Timers = {
  RINGING_TIMEOUT_MS: 30000,
  CONNECTING_TIMEOUT_MS: 30000,
  ESCALATION_TIMEOUT_MS: 30000,
  RECONNECT_GRACE_MS: 30000,
  TERMINAL_RETENTION_MS: 60000,
} as const;

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export const MessageTypes = {
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  SERVER_SHUTDOWN: 'server:shutdown',
  DEVICE_CONNECT: 'device:connect',
  DEVICE_CONNECTED: 'device:connected',
  DEVICE_DISCONNECT: 'device:disconnect',
  DEVICE_DISCONNECTED: 'device:disconnected',
  DEVICE_STATUS: 'device:status',
  DEVICE_STATUS_UPDATED: 'device:status-updated',
  CALL_INITIATE: 'call:initiate',
  CALL_INITIATED: 'call:initiated',
  CALL_INCOMING: 'call:incoming',
  CALL_CANCEL: 'call:cancel',
  CALL_CANCELLED: 'call:cancelled',
  CALL_ACCEPT: 'call:accept',
  CALL_ACCEPTED: 'call:accepted',
  CALL_REJECT: 'call:reject',
  CALL_UNAVAILABLE: 'call:unavailable',
  CALL_BUSY: 'call:busy',
  CALL_END: 'call:end',
  CALL_ENDED: 'call:ended',
  CALL_FAILED: 'call:failed',
  CALL_TIMEOUT: 'call:timeout',
  CALL_RECONNECT: 'call:reconnect',
  CALL_RECONNECTED: 'call:reconnected',
  WEBRTC_OFFER: 'webrtc:offer',
  WEBRTC_ANSWER: 'webrtc:answer',
  WEBRTC_ICE_CANDIDATE: 'webrtc:ice-candidate',
  MEDIA_TOGGLE: 'media:toggle',
  CALL_ESCALATE: 'call:escalate',
  ESCALATION_REQUESTED: 'escalation:requested',
  ESCALATION_ACCEPT: 'escalation:accept',
  ESCALATION_REJECT: 'escalation:reject',
  ESCALATION_ACCEPTED: 'escalation:accepted',
  ESCALATION_REJECTED: 'escalation:rejected',
  CALL_DOWNGRADE: 'call:downgrade',
  CALL_DOWNGRADED: 'call:downgraded',
} as const;

export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];

// ============================================================================
// ENUMS
// ============================================================================

export const CallType = {
  VOICE: 'voice',
  VIDEO: 'video',
} as const;
export type CallType = 'voice' | 'video';

export const DeviceType = {
  WEB: 'web',
  MOBILE: 'mobile',
} as const;
export type DeviceType = 'web' | 'mobile';

export const DeviceStatus = {
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
} as const;
export type DeviceStatus = 'available' | 'unavailable';

export const Role = {
  CUSTOMER: 'customer',
  BUSINESS: 'business',
} as const;
export type Role = 'customer' | 'business';

export const MediaTrackType = {
  AUDIO: 'audio',
  VIDEO: 'video',
} as const;
export type MediaTrackType = 'audio' | 'video';

export const MediaToggleAction = {
  ENABLE_CAMERA: 'enable_camera',
  DISABLE_CAMERA: 'disable_camera',
  ENABLE_MICROPHONE: 'enable_microphone',
  DISABLE_MICROPHONE: 'disable_microphone',
  FLIP_CAMERA: 'flip_camera',
} as const;
export type MediaToggleAction = 'enable_camera' | 'disable_camera' | 'enable_microphone' | 'disable_microphone' | 'flip_camera';

export const CallState = {
  INITIATED: 'initiated',
  RINGING: 'ringing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ESCALATION_PENDING: 'escalation_pending',
  ENDED: 'ended',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  BUSY: 'busy',
  UNAVAILABLE: 'unavailable',
  TIMEOUT: 'timeout',
} as const;
export type CallState = 'initiated' | 'ringing' | 'connecting' | 'connected' | 'escalation_pending' | 'ended' | 'failed' | 'cancelled' | 'busy' | 'unavailable' | 'timeout';

export const CallEndReason = {
  NORMAL: 'normal',
  CUSTOMER_HANGUP: 'customer_hangup',
  BUSINESS_HANGUP: 'business_hangup',
} as const;
export type CallEndReason = 'normal' | 'customer_hangup' | 'business_hangup';

export const CallFailReason = {
  MEDIA_PERMISSION_DENIED: 'media_permission_denied',
  CONNECTION_FAILED: 'connection_failed',
  PEER_DISCONNECTED: 'peer_disconnected',
  INTERNAL_ERROR: 'internal_error',
} as const;
export type CallFailReason = 'media_permission_denied' | 'connection_failed' | 'peer_disconnected' | 'internal_error';

export const CallCancelReason = {
  CANCELLED_BY_CALLER: 'cancelled_by_caller',
  ANSWERED_ELSEWHERE: 'answered_elsewhere',
} as const;
export type CallCancelReason = 'cancelled_by_caller' | 'answered_elsewhere';

export const CallUnavailableReason = {
  NO_DEVICES_AVAILABLE: 'no_devices_available',
  ALL_DEVICES_REJECTED: 'all_devices_rejected',
} as const;
export type CallUnavailableReason = 'no_devices_available' | 'all_devices_rejected';

export const CallBusyReason = {
  ALL_DEVICES_BUSY: 'all_devices_busy',
} as const;
export type CallBusyReason = 'all_devices_busy';

export const TimeoutPhase = {
  RINGING: 'ringing',
  CONNECTING: 'connecting',
} as const;
export type TimeoutPhase = 'ringing' | 'connecting';

export const EscalationRejectReason = {
  DECLINED: 'declined',
  TIMEOUT: 'timeout',
  UNSUPPORTED: 'unsupported',
} as const;
export type EscalationRejectReason = 'declined' | 'timeout' | 'unsupported';

export const ErrorCode = {
  INVALID_JSON: 'invalid_json',
  INVALID_MESSAGE: 'invalid_message',
  VALIDATION_ERROR: 'validation_error',
  UNKNOWN_MESSAGE_TYPE: 'unknown_message_type',
  NOT_AUTHENTICATED: 'not_authenticated',
  AUTH_FAILED: 'auth_failed',
  TOKEN_EXPIRED: 'token_expired',
  DEVICE_MISMATCH: 'device_mismatch',
  PROTOCOL_INCOMPATIBLE: 'protocol_incompatible',
  RATE_LIMITED: 'rate_limited',
  NOT_AUTHORIZED: 'not_authorized',
  CALL_NOT_FOUND: 'call_not_found',
  INVALID_STATE: 'invalid_state',
  NOT_CALL_PARTICIPANT: 'not_call_participant',
  DUPLICATE_CALL_ID: 'duplicate_call_id',
  PEER_NOT_CONNECTED: 'peer_not_connected',
  DEVICE_NOT_FOUND: 'device_not_found',
  SERVER_ERROR: 'server_error',
} as const;
export type ErrorCode = 'invalid_json' | 'invalid_message' | 'validation_error' | 'unknown_message_type' | 'not_authenticated' | 'auth_failed' | 'token_expired' | 'device_mismatch' | 'protocol_incompatible' | 'rate_limited' | 'not_authorized' | 'call_not_found' | 'invalid_state' | 'not_call_participant' | 'duplicate_call_id' | 'peer_not_connected' | 'device_not_found' | 'server_error';

// ============================================================================
// STRUCTURED TYPES
// ============================================================================

/** What media tracks a peer can send and receive. */
export interface MediaCapabilities {
  canSend: MediaTrackType[];
  canReceive: MediaTrackType[];
}

/** Mirrors the W3C RTCSessionDescriptionInit; clients pass their native object through unchanged. The server relays it verbatim. */
export interface SessionDescription {
  type: string;
  sdp?: string;
}

/** Mirrors the W3C RTCIceCandidateInit. An empty-string candidate signals end-of-candidates. The server relays it verbatim. */
export interface IceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

// ============================================================================
// MESSAGE PAYLOAD INTERFACES
// ============================================================================

/**
 * `ping` — Application-level heartbeat. Server replies with pong.
 */
export interface PingPayload {
  type: 'ping';
  timestamp?: number;
}

/**
 * `pong` — Heartbeat reply.
 * Audience: sender of the ping
 */
export interface PongPayload {
  type: 'pong';
  timestamp?: number;
}

/**
 * `error` — Reports a rejected message or server-side failure. The offending message was NOT processed.
 * Audience: the connection whose message caused the error
 */
export interface ErrorPayload {
  type: 'error';
  code: ErrorCode;
  message: string;
  relatedType?: string;
  callAttemptId?: string;
  timestamp: number;
}

/**
 * `server:shutdown` — Server is shutting down; clients should reconnect (with backoff) after the socket closes.
 * Audience: all connected devices (broadcast)
 */
export interface ServerShutdownPayload {
  type: 'server:shutdown';
  message: string;
  gracePeriod: number;
  timestamp: number;
}

/**
 * `device:connect` — Authenticates and registers this connection as a device. MUST be the first message (ping excepted). Re-connecting with an existing deviceId supersedes the previous connection.
 */
export interface DeviceConnectPayload {
  type: 'device:connect';
  deviceType: DeviceType;
  deviceId: string;
  token: string;
  protocolVersion: string;
  pushToken?: string;
  timestamp?: number;
}

/**
 * `device:connected` — Confirms registration. protocolVersion is the negotiated version all further traffic follows.
 * Audience: sender
 */
export interface DeviceConnectedPayload {
  type: 'device:connected';
  deviceId: string;
  role: Role;
  protocolVersion: string;
  timestamp: number;
}

/**
 * `device:disconnect` — Explicitly unregisters this device (logout). Identity comes from the connection; no fields needed. The server confirms with device:disconnected, then the client may close the socket.
 */
export interface DeviceDisconnectPayload {
  type: 'device:disconnect';
  timestamp?: number;
}

/**
 * `device:disconnected` — Confirms explicit unregistration.
 * Audience: sender
 */
export interface DeviceDisconnectedPayload {
  type: 'device:disconnected';
  deviceId: string;
  timestamp: number;
}

/**
 * `device:status` — Sets this device's availability for receiving calls. Devices register as available by default.
 */
export interface DeviceStatusPayload {
  type: 'device:status';
  status: DeviceStatus;
  timestamp?: number;
}

/**
 * `device:status-updated` — Confirms the availability change.
 * Audience: sender
 */
export interface DeviceStatusUpdatedPayload {
  type: 'device:status-updated';
  deviceId: string;
  status: DeviceStatus;
  timestamp: number;
}

/**
 * `call:initiate` — Places a call to a business. callAttemptId is a client-generated UUIDv4 and must be globally unique (reuse => error duplicate_call_id). handle must match the token's business scope.
 */
export interface CallInitiatePayload {
  type: 'call:initiate';
  callAttemptId: string;
  handle: string;
  callType: CallType;
  mediaCapabilities: MediaCapabilities;
  timestamp?: number;
}

/**
 * `call:initiated` — Acknowledges call:initiate: the call now exists and is ringing on devicesNotified devices.
 * Audience: caller
 */
export interface CallInitiatedPayload {
  type: 'call:initiated';
  callAttemptId: string;
  devicesNotified: number;
  timestamp: number;
}

/**
 * `call:incoming` — Notifies a business device of a ringing call.
 * Audience: every available business device (WebSocket if connected; FCM data push for offline mobile devices). Also re-delivered to a business device that connects while the call is still ringing.
 */
export interface CallIncomingPayload {
  type: 'call:incoming';
  callAttemptId: string;
  sourceId: string;
  callType: CallType;
  mediaCapabilities: MediaCapabilities;
  timestamp: number;
}

/**
 * `call:cancel` — Caller abandons the call before it is accepted. After acceptance use call:end.
 */
export interface CallCancelPayload {
  type: 'call:cancel';
  callAttemptId: string;
  timestamp?: number;
}

/**
 * `call:cancelled` — The ringing call no longer needs this device's attention.
 * Audience: reason=cancelled_by_caller: all ringing devices and the caller (as ack); reason=answered_elsewhere: every ringing device except the accepting one
 */
export interface CallCancelledPayload {
  type: 'call:cancelled';
  callAttemptId: string;
  reason: CallCancelReason;
  timestamp: number;
}

/**
 * `call:accept` — Accepts a ringing call. First accept wins; the sender must belong to the call's business. Identity comes from the connection.
 */
export interface CallAcceptPayload {
  type: 'call:accept';
  callAttemptId: string;
  mediaCapabilities?: MediaCapabilities;
  timestamp?: number;
}

/**
 * `call:accepted` — The call was accepted; the caller must now send webrtc:offer.
 * Audience: caller and accepting device
 */
export interface CallAcceptedPayload {
  type: 'call:accepted';
  callAttemptId: string;
  acceptingDeviceId: string;
  mediaCapabilities?: MediaCapabilities;
  timestamp: number;
}

/**
 * `call:reject` — Declines a ringing call on this device only. The call keeps ringing elsewhere; when every notified device has rejected, the caller receives call:unavailable (reason=all_devices_rejected). No per-reject message is sent to the caller.
 */
export interface CallRejectPayload {
  type: 'call:reject';
  callAttemptId: string;
  reason?: string;
  timestamp?: number;
}

/**
 * `call:unavailable` — The call cannot be answered: no devices were available at initiate, or all devices rejected. Terminal.
 * Audience: caller
 */
export interface CallUnavailablePayload {
  type: 'call:unavailable';
  callAttemptId: string;
  reason: CallUnavailableReason;
  timestamp: number;
}

/**
 * `call:busy` — All otherwise-available devices are engaged in active calls. Terminal.
 * Audience: caller
 */
export interface CallBusyPayload {
  type: 'call:busy';
  callAttemptId: string;
  reason: CallBusyReason;
  timestamp: number;
}

/**
 * `call:end` — Either participant hangs up an accepted call. The server derives who ended it from the sender's role.
 */
export interface CallEndPayload {
  type: 'call:end';
  callAttemptId: string;
  timestamp?: number;
}

/**
 * `call:ended` — The call is over. duration is connected time in ms (0 if never connected).
 * Audience: both participants (the ender receives it as ack)
 */
export interface CallEndedPayload {
  type: 'call:ended';
  callAttemptId: string;
  duration: number;
  reason: CallEndReason;
  endedBy: Role;
  timestamp: number;
}

/**
 * `call:failed` — c2s: a participant reports an unrecoverable local failure (media permission denied, ICE failure after exhausting restarts). s2c: the server declares the call failed (relayed client report, reconnect grace expiry, or internal error). Terminal.
 * Audience: s2c: both participants (or the caller, if the call had no callee yet)
 */
export interface CallFailedPayload {
  type: 'call:failed';
  callAttemptId: string;
  reason: CallFailReason;
  timestamp?: number;
}

/**
 * `call:timeout` — A server timer expired before the call progressed. Terminal.
 * Audience: phase=ringing: caller and all ringing devices; phase=connecting: both participants
 */
export interface CallTimeoutPayload {
  type: 'call:timeout';
  callAttemptId: string;
  phase: TimeoutPhase;
  timeoutDuration: number;
  timestamp: number;
}

/**
 * `call:reconnect` — After re-authenticating (device:connect) within reconnect_grace, a participant re-attaches to its in-flight call. The server re-binds signaling delivery to the new connection.
 */
export interface CallReconnectPayload {
  type: 'call:reconnect';
  callAttemptId: string;
  timestamp?: number;
}

/**
 * `call:reconnected` — Re-attachment succeeded; callState tells the client where the call currently stands.
 * Audience: sender
 */
export interface CallReconnectedPayload {
  type: 'call:reconnected';
  callAttemptId: string;
  callState: CallState;
  callType: CallType;
  timestamp: number;
}

/**
 * `webrtc:offer` — SDP offer, relayed verbatim by the server. Initial negotiation: only the caller offers, after receiving call:accepted. Renegotiation: only the participant whose escalation/downgrade request was granted offers. This rule prevents glare.
 * Audience: s2c: the other participant
 */
export interface WebrtcOfferPayload {
  type: 'webrtc:offer';
  callAttemptId: string;
  offer: SessionDescription;
  timestamp?: number;
}

/**
 * `webrtc:answer` — SDP answer, relayed verbatim. Relaying the first answer moves the call to connected.
 * Audience: s2c: the other participant
 */
export interface WebrtcAnswerPayload {
  type: 'webrtc:answer';
  callAttemptId: string;
  answer: SessionDescription;
  timestamp?: number;
}

/**
 * `webrtc:ice-candidate` — ICE candidate, relayed verbatim in either direction. Clients MUST buffer candidates that arrive before the remote description is set, and tolerate duplicates.
 * Audience: s2c: the other participant
 */
export interface WebrtcIceCandidatePayload {
  type: 'webrtc:ice-candidate';
  callAttemptId: string;
  candidate: IceCandidate;
  timestamp?: number;
}

/**
 * `media:toggle` — Informs the peer of a local media state change (mute, camera off, camera flip). Purely informational; does not change call state.
 * Audience: s2c: the other participant
 */
export interface MediaTogglePayload {
  type: 'media:toggle';
  callAttemptId: string;
  action: MediaToggleAction;
  timestamp?: number;
}

/**
 * `call:escalate` — Requests voice-to-video escalation (voice calls only). The peer receives escalation:requested and must answer with escalation:accept or escalation:reject within escalation_timeout.
 */
export interface CallEscalatePayload {
  type: 'call:escalate';
  callAttemptId: string;
  mediaCapabilities: MediaCapabilities;
  timestamp?: number;
}

/**
 * `escalation:requested` — The peer asked to upgrade the call to video.
 * Audience: the other participant
 */
export interface EscalationRequestedPayload {
  type: 'escalation:requested';
  callAttemptId: string;
  requestedBy: Role;
  mediaCapabilities: MediaCapabilities;
  timestamp: number;
}

/**
 * `escalation:accept` — Accepts the pending escalation. The call's callType becomes video; the original requester then renegotiates via webrtc:offer.
 */
export interface EscalationAcceptPayload {
  type: 'escalation:accept';
  callAttemptId: string;
  mediaCapabilities: MediaCapabilities;
  timestamp?: number;
}

/**
 * `escalation:reject` — Declines the pending escalation. The call reverts to connected as a voice call.
 */
export interface EscalationRejectPayload {
  type: 'escalation:reject';
  callAttemptId: string;
  reason?: string;
  timestamp?: number;
}

/**
 * `escalation:accepted` — Escalation granted; the call is now a video call. The requester must renegotiate via webrtc:offer.
 * Audience: both participants
 */
export interface EscalationAcceptedPayload {
  type: 'escalation:accepted';
  callAttemptId: string;
  mediaCapabilities: MediaCapabilities;
  timestamp: number;
}

/**
 * `escalation:rejected` — Escalation declined or timed out; the call remains a voice call.
 * Audience: the requester
 */
export interface EscalationRejectedPayload {
  type: 'escalation:rejected';
  callAttemptId: string;
  reason: EscalationRejectReason;
  timestamp: number;
}

/**
 * `call:downgrade` — Unilaterally downgrades a video call to voice (no peer consent required). Both participants receive call:downgraded; the requester then renegotiates via webrtc:offer.
 */
export interface CallDowngradePayload {
  type: 'call:downgrade';
  callAttemptId: string;
  reason?: string;
  timestamp?: number;
}

/**
 * `call:downgraded` — The call is now a voice call.
 * Audience: both participants
 */
export interface CallDowngradedPayload {
  type: 'call:downgraded';
  callAttemptId: string;
  requestedBy: Role;
  timestamp: number;
}

// ============================================================================
// MESSAGE METADATA
// ============================================================================

export type MessageDirection = 'c2s' | 's2c' | 'both';

export interface MessageMeta {
  direction: MessageDirection;
  /** false only for messages permitted before device:connect succeeds */
  requiresAuth: boolean;
  /** connection role allowed to send (c2s only); undefined = any participant */
  senderRole?: Role;
  /** call states in which the server accepts this message (call-scoped c2s only) */
  validStates?: CallState[];
}

export const MessageMetadata: Record<MessageType, MessageMeta> = {
  'ping': { direction: 'c2s', requiresAuth: false },
  'pong': { direction: 's2c', requiresAuth: false },
  'error': { direction: 's2c', requiresAuth: false },
  'server:shutdown': { direction: 's2c', requiresAuth: false },
  'device:connect': { direction: 'c2s', requiresAuth: false },
  'device:connected': { direction: 's2c', requiresAuth: false },
  'device:disconnect': { direction: 'c2s', requiresAuth: true },
  'device:disconnected': { direction: 's2c', requiresAuth: false },
  'device:status': { direction: 'c2s', requiresAuth: true, senderRole: 'business' },
  'device:status-updated': { direction: 's2c', requiresAuth: false },
  'call:initiate': { direction: 'c2s', requiresAuth: true, senderRole: 'customer' },
  'call:initiated': { direction: 's2c', requiresAuth: false },
  'call:incoming': { direction: 's2c', requiresAuth: false },
  'call:cancel': { direction: 'c2s', requiresAuth: true, senderRole: 'customer', validStates: ['initiated', 'ringing'] },
  'call:cancelled': { direction: 's2c', requiresAuth: false },
  'call:accept': { direction: 'c2s', requiresAuth: true, senderRole: 'business', validStates: ['ringing'] },
  'call:accepted': { direction: 's2c', requiresAuth: false },
  'call:reject': { direction: 'c2s', requiresAuth: true, senderRole: 'business', validStates: ['ringing'] },
  'call:unavailable': { direction: 's2c', requiresAuth: false },
  'call:busy': { direction: 's2c', requiresAuth: false },
  'call:end': { direction: 'c2s', requiresAuth: true, validStates: ['connecting', 'connected', 'escalation_pending'] },
  'call:ended': { direction: 's2c', requiresAuth: false },
  'call:failed': { direction: 'both', requiresAuth: true, validStates: ['connecting', 'connected', 'escalation_pending'] },
  'call:timeout': { direction: 's2c', requiresAuth: false },
  'call:reconnect': { direction: 'c2s', requiresAuth: true, validStates: ['connecting', 'connected', 'escalation_pending'] },
  'call:reconnected': { direction: 's2c', requiresAuth: false },
  'webrtc:offer': { direction: 'both', requiresAuth: true, validStates: ['connecting', 'connected'] },
  'webrtc:answer': { direction: 'both', requiresAuth: true, validStates: ['connecting', 'connected'] },
  'webrtc:ice-candidate': { direction: 'both', requiresAuth: true, validStates: ['connecting', 'connected'] },
  'media:toggle': { direction: 'both', requiresAuth: true, validStates: ['connected', 'escalation_pending'] },
  'call:escalate': { direction: 'c2s', requiresAuth: true, validStates: ['connected'] },
  'escalation:requested': { direction: 's2c', requiresAuth: false },
  'escalation:accept': { direction: 'c2s', requiresAuth: true, validStates: ['escalation_pending'] },
  'escalation:reject': { direction: 'c2s', requiresAuth: true, validStates: ['escalation_pending'] },
  'escalation:accepted': { direction: 's2c', requiresAuth: false },
  'escalation:rejected': { direction: 's2c', requiresAuth: false },
  'call:downgrade': { direction: 'c2s', requiresAuth: true, validStates: ['connected'] },
  'call:downgraded': { direction: 's2c', requiresAuth: false },
};

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

export interface FieldSpec {
  /** type token: 'uuid' | 'string' | 'number' | 'boolean' | 'string|null' |
   *  'number|null' | 'enum:<Name>' | 'object:<Name>' | 'array<enum:<Name>>' */
  type: string;
  required: boolean;
}

export interface MessageSchema {
  required: string[];
  optional: string[];
  fields: Record<string, FieldSpec>;
}

export const MessageSchemas: Record<MessageType, MessageSchema> = {
  'ping': {
    required: [],
    optional: ['timestamp'],
    fields: {
      timestamp: { type: 'number', required: false },
    },
  },
  'pong': {
    required: [],
    optional: ['timestamp'],
    fields: {
      timestamp: { type: 'number', required: false },
    },
  },
  'error': {
    required: ['code', 'message', 'timestamp'],
    optional: ['relatedType', 'callAttemptId'],
    fields: {
      code: { type: 'enum:ErrorCode', required: true },
      message: { type: 'string', required: true },
      relatedType: { type: 'string', required: false },
      callAttemptId: { type: 'uuid', required: false },
      timestamp: { type: 'number', required: true },
    },
  },
  'server:shutdown': {
    required: ['message', 'gracePeriod', 'timestamp'],
    optional: [],
    fields: {
      message: { type: 'string', required: true },
      gracePeriod: { type: 'number', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'device:connect': {
    required: ['deviceType', 'deviceId', 'token', 'protocolVersion'],
    optional: ['pushToken', 'timestamp'],
    fields: {
      deviceType: { type: 'enum:DeviceType', required: true },
      deviceId: { type: 'string', required: true },
      token: { type: 'string', required: true },
      protocolVersion: { type: 'string', required: true },
      pushToken: { type: 'string', required: false },
      timestamp: { type: 'number', required: false },
    },
  },
  'device:connected': {
    required: ['deviceId', 'role', 'protocolVersion', 'timestamp'],
    optional: [],
    fields: {
      deviceId: { type: 'string', required: true },
      role: { type: 'enum:Role', required: true },
      protocolVersion: { type: 'string', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'device:disconnect': {
    required: [],
    optional: ['timestamp'],
    fields: {
      timestamp: { type: 'number', required: false },
    },
  },
  'device:disconnected': {
    required: ['deviceId', 'timestamp'],
    optional: [],
    fields: {
      deviceId: { type: 'string', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'device:status': {
    required: ['status'],
    optional: ['timestamp'],
    fields: {
      status: { type: 'enum:DeviceStatus', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'device:status-updated': {
    required: ['deviceId', 'status', 'timestamp'],
    optional: [],
    fields: {
      deviceId: { type: 'string', required: true },
      status: { type: 'enum:DeviceStatus', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:initiate': {
    required: ['callAttemptId', 'handle', 'callType', 'mediaCapabilities'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      handle: { type: 'string', required: true },
      callType: { type: 'enum:CallType', required: true },
      mediaCapabilities: { type: 'object:MediaCapabilities', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:initiated': {
    required: ['callAttemptId', 'devicesNotified', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      devicesNotified: { type: 'number', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:incoming': {
    required: ['callAttemptId', 'sourceId', 'callType', 'mediaCapabilities', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      sourceId: { type: 'string', required: true },
      callType: { type: 'enum:CallType', required: true },
      mediaCapabilities: { type: 'object:MediaCapabilities', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:cancel': {
    required: ['callAttemptId'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:cancelled': {
    required: ['callAttemptId', 'reason', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      reason: { type: 'enum:CallCancelReason', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:accept': {
    required: ['callAttemptId'],
    optional: ['mediaCapabilities', 'timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      mediaCapabilities: { type: 'object:MediaCapabilities', required: false },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:accepted': {
    required: ['callAttemptId', 'acceptingDeviceId', 'timestamp'],
    optional: ['mediaCapabilities'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      acceptingDeviceId: { type: 'string', required: true },
      mediaCapabilities: { type: 'object:MediaCapabilities', required: false },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:reject': {
    required: ['callAttemptId'],
    optional: ['reason', 'timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      reason: { type: 'string', required: false },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:unavailable': {
    required: ['callAttemptId', 'reason', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      reason: { type: 'enum:CallUnavailableReason', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:busy': {
    required: ['callAttemptId', 'reason', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      reason: { type: 'enum:CallBusyReason', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:end': {
    required: ['callAttemptId'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:ended': {
    required: ['callAttemptId', 'duration', 'reason', 'endedBy', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      duration: { type: 'number', required: true },
      reason: { type: 'enum:CallEndReason', required: true },
      endedBy: { type: 'enum:Role', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:failed': {
    required: ['callAttemptId', 'reason'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      reason: { type: 'enum:CallFailReason', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:timeout': {
    required: ['callAttemptId', 'phase', 'timeoutDuration', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      phase: { type: 'enum:TimeoutPhase', required: true },
      timeoutDuration: { type: 'number', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:reconnect': {
    required: ['callAttemptId'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:reconnected': {
    required: ['callAttemptId', 'callState', 'callType', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      callState: { type: 'enum:CallState', required: true },
      callType: { type: 'enum:CallType', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'webrtc:offer': {
    required: ['callAttemptId', 'offer'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      offer: { type: 'object:SessionDescription', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'webrtc:answer': {
    required: ['callAttemptId', 'answer'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      answer: { type: 'object:SessionDescription', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'webrtc:ice-candidate': {
    required: ['callAttemptId', 'candidate'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      candidate: { type: 'object:IceCandidate', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'media:toggle': {
    required: ['callAttemptId', 'action'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      action: { type: 'enum:MediaToggleAction', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:escalate': {
    required: ['callAttemptId', 'mediaCapabilities'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      mediaCapabilities: { type: 'object:MediaCapabilities', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'escalation:requested': {
    required: ['callAttemptId', 'requestedBy', 'mediaCapabilities', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      requestedBy: { type: 'enum:Role', required: true },
      mediaCapabilities: { type: 'object:MediaCapabilities', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'escalation:accept': {
    required: ['callAttemptId', 'mediaCapabilities'],
    optional: ['timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      mediaCapabilities: { type: 'object:MediaCapabilities', required: true },
      timestamp: { type: 'number', required: false },
    },
  },
  'escalation:reject': {
    required: ['callAttemptId'],
    optional: ['reason', 'timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      reason: { type: 'string', required: false },
      timestamp: { type: 'number', required: false },
    },
  },
  'escalation:accepted': {
    required: ['callAttemptId', 'mediaCapabilities', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      mediaCapabilities: { type: 'object:MediaCapabilities', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'escalation:rejected': {
    required: ['callAttemptId', 'reason', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      reason: { type: 'enum:EscalationRejectReason', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
  'call:downgrade': {
    required: ['callAttemptId'],
    optional: ['reason', 'timestamp'],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      reason: { type: 'string', required: false },
      timestamp: { type: 'number', required: false },
    },
  },
  'call:downgraded': {
    required: ['callAttemptId', 'requestedBy', 'timestamp'],
    optional: [],
    fields: {
      callAttemptId: { type: 'uuid', required: true },
      requestedBy: { type: 'enum:Role', required: true },
      timestamp: { type: 'number', required: true },
    },
  },
};

// ============================================================================
// STATE MACHINE
// ============================================================================

export const InitialCallState: CallState = 'initiated';

export const TerminalCallStates: CallState[] = ['ended', 'failed', 'cancelled', 'busy', 'unavailable', 'timeout'];

/** current state -> allowed next states */
export const StateTransitions: Record<CallState, CallState[]> = {
  initiated: ['ringing', 'unavailable', 'busy', 'cancelled', 'failed'],
  ringing: ['connecting', 'cancelled', 'unavailable', 'timeout', 'failed'],
  connecting: ['connected', 'ended', 'timeout', 'failed'],
  connected: ['ended', 'escalation_pending', 'failed'],
  escalation_pending: ['connected', 'ended', 'failed'],
  ended: [],
  failed: [],
  cancelled: [],
  busy: [],
  unavailable: [],
  timeout: [],
};

/** current state -> { next state, triggering event } (documentation of WHY each transition fires) */
export const TransitionTriggers: Record<CallState, { to: CallState; on: string }[]> = {
  initiated: [
    { to: 'ringing', on: "call:incoming dispatched to at least one device" },
    { to: 'unavailable', on: "no available devices for the business" },
    { to: 'busy', on: "all available devices engaged in active calls" },
    { to: 'cancelled', on: "call:cancel from caller" },
    { to: 'failed', on: "internal error" },
  ],
  ringing: [
    { to: 'connecting', on: "call:accept from a business device" },
    { to: 'cancelled', on: "call:cancel from caller" },
    { to: 'unavailable', on: "every notified device sent call:reject" },
    { to: 'timeout', on: "ringing_timeout expired" },
    { to: 'failed', on: "caller disconnected beyond reconnect_grace, or internal error" },
  ],
  connecting: [
    { to: 'connected', on: "webrtc:answer relayed to the caller" },
    { to: 'ended', on: "call:end from either participant" },
    { to: 'timeout', on: "connecting_timeout expired" },
    { to: 'failed', on: "call:failed from a participant, or participant disconnected beyond reconnect_grace" },
  ],
  connected: [
    { to: 'ended', on: "call:end from either participant" },
    { to: 'escalation_pending', on: "call:escalate from a participant (voice calls only)" },
    { to: 'failed', on: "call:failed from a participant, or participant disconnected beyond reconnect_grace" },
  ],
  escalation_pending: [
    { to: 'connected', on: "escalation:accept, escalation:reject, or escalation_timeout expired" },
    { to: 'ended', on: "call:end from either participant" },
    { to: 'failed', on: "call:failed from a participant, or participant disconnected beyond reconnect_grace" },
  ],
  ended: [],
  failed: [],
  cancelled: [],
  busy: [],
  unavailable: [],
  timeout: [],
};

export function isValidStateTransition(current: CallState, next: CallState): boolean {
  return (StateTransitions[current] ?? []).includes(next);
}

export function isTerminalState(state: CallState): boolean {
  return TerminalCallStates.includes(state);
}

// ============================================================================
// MESSAGE VALIDATION
// ============================================================================

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EnumValues: Record<string, readonly string[]> = {
  CallType: Object.values(CallType),
  DeviceType: Object.values(DeviceType),
  DeviceStatus: Object.values(DeviceStatus),
  Role: Object.values(Role),
  MediaTrackType: Object.values(MediaTrackType),
  MediaToggleAction: Object.values(MediaToggleAction),
  CallState: Object.values(CallState),
  CallEndReason: Object.values(CallEndReason),
  CallFailReason: Object.values(CallFailReason),
  CallCancelReason: Object.values(CallCancelReason),
  CallUnavailableReason: Object.values(CallUnavailableReason),
  CallBusyReason: Object.values(CallBusyReason),
  TimeoutPhase: Object.values(TimeoutPhase),
  EscalationRejectReason: Object.values(EscalationRejectReason),
  ErrorCode: Object.values(ErrorCode),
};

function validateStructured(name: string, value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`${name} must be an object`];
  }
  const objectSchemas: Record<string, Record<string, FieldSpec>> = {
    MediaCapabilities: {
      canSend: { type: 'array<enum:MediaTrackType>', required: true },
      canReceive: { type: 'array<enum:MediaTrackType>', required: true },
    },
    SessionDescription: {
      type: { type: 'string', required: true },
      sdp: { type: 'string', required: false },
    },
    IceCandidate: {
      candidate: { type: 'string', required: true },
      sdpMid: { type: 'string|null', required: true },
      sdpMLineIndex: { type: 'number|null', required: true },
      usernameFragment: { type: 'string|null', required: false },
    },
  };
  const schema = objectSchemas[name];
  if (!schema) return [`Unknown structured type: ${name}`];
  const errors: string[] = [];
  const obj = value as Record<string, unknown>;
  for (const [field, spec] of Object.entries(schema)) {
    if (!(field in obj)) {
      if (spec.required) errors.push(`${name}.${field} is required`);
      continue;
    }
    errors.push(...validateFieldValue(`${name}.${field}`, spec.type, obj[field]));
  }
  return errors;
}

function validateFieldValue(label: string, typeToken: string, value: unknown): string[] {
  if (typeToken === 'uuid') {
    return typeof value === 'string' && UUID_V4_REGEX.test(value)
      ? []
      : [`${label} must be a UUIDv4 string`];
  }
  if (typeToken === 'string') {
    return typeof value === 'string' ? [] : [`${label} must be a string`];
  }
  if (typeToken === 'number') {
    return typeof value === 'number' ? [] : [`${label} must be a number`];
  }
  if (typeToken === 'boolean') {
    return typeof value === 'boolean' ? [] : [`${label} must be a boolean`];
  }
  if (typeToken === 'string|null') {
    return typeof value === 'string' || value === null
      ? []
      : [`${label} must be a string or null`];
  }
  if (typeToken === 'number|null') {
    return typeof value === 'number' || value === null
      ? []
      : [`${label} must be a number or null`];
  }
  if (typeToken.startsWith('enum:')) {
    const enumName = typeToken.slice(5);
    const allowed = EnumValues[enumName] ?? [];
    return typeof value === 'string' && allowed.includes(value)
      ? []
      : [`${label} must be one of: ${allowed.join(', ')}`];
  }
  if (typeToken.startsWith('object:')) {
    return validateStructured(typeToken.slice(7), value);
  }
  const arrayMatch = typeToken.match(/^array<enum:(\w+)>$/);
  if (arrayMatch) {
    const allowed = EnumValues[arrayMatch[1]!] ?? [];
    if (!Array.isArray(value)) return [`${label} must be an array`];
    const bad = value.filter((v) => typeof v !== 'string' || !allowed.includes(v));
    return bad.length === 0
      ? []
      : [`${label} entries must be one of: ${allowed.join(', ')}`];
  }
  return [`${label}: unknown type token ${typeToken}`];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a message payload (excluding the 'type' field itself) against its schema.
 * Unknown fields are ignored for forward compatibility.
 */
export function validateMessage(
  messageType: string,
  payload: Record<string, unknown>
): ValidationResult {
  const schema = MessageSchemas[messageType as MessageType];
  if (!schema) {
    return { valid: false, errors: [`Unknown message type: ${messageType}`] };
  }

  const errors: string[] = [];
  for (const field of schema.required) {
    if (!(field in payload)) errors.push(`Missing required field: ${field}`);
  }
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (field in payload) {
      errors.push(...validateFieldValue(field, spec.type, payload[field]));
    }
  }
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// PROTOCOL VERSION NEGOTIATION
// ============================================================================

export function parseVersion(
  version?: string
): { major: number; minor: number; patch: number } | null {
  if (!version) return null;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
  };
}

/** Compatible when major versions match. */
export function isVersionCompatible(clientVersion?: string, serverVersion?: string): boolean {
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);
  if (!client || !server) return false;
  return client.major === server.major;
}

/** The negotiated version is the lower of two compatible versions. */
export function getNegotiatedVersion(
  clientVersion?: string,
  serverVersion?: string
): string | null {
  const client = parseVersion(clientVersion);
  const server = parseVersion(serverVersion);
  if (!client || !server || client.major !== server.major) return null;
  if (client.minor !== server.minor) {
    return client.minor < server.minor ? clientVersion! : serverVersion!;
  }
  return client.patch <= server.patch ? clientVersion! : serverVersion!;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  PROTOCOL_VERSION,
  Transport,
  Timers,
  MessageTypes,
  MessageMetadata,
  MessageSchemas,
  CallType,
  DeviceType,
  DeviceStatus,
  Role,
  MediaTrackType,
  MediaToggleAction,
  CallState,
  CallEndReason,
  CallFailReason,
  CallCancelReason,
  CallUnavailableReason,
  CallBusyReason,
  TimeoutPhase,
  EscalationRejectReason,
  ErrorCode,
  InitialCallState,
  TerminalCallStates,
  StateTransitions,
  TransitionTriggers,
  isValidStateTransition,
  isTerminalState,
  validateMessage,
  parseVersion,
  isVersionCompatible,
  getNegotiatedVersion,
};
