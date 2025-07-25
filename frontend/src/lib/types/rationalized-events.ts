// Rationalized Event System for CallSafe
// This replaces the fragmented event system with a unified, hierarchical approach

// =============================================================================
// CORE CALL LIFECYCLE EVENTS
// =============================================================================

export type CallPhase = 'initializing' | 'routing' | 'ringing' | 'connecting' | 'active' | 'terminated';
export type CallQuality = 'good' | 'poor' | 'unstable' | 'failed';
export type DeviceType = 'web' | 'android';
export type CallInitiator = 'customer' | 'agent' | 'system';

// Hierarchical Call Identifier
export interface CallIdentifier {
  callId: string;           // Server authority - always present
  sessionId?: string;       // Client session tracking  
  handle: string;          // Business routing
  sourceId?: string;       // Analytics/tracking
}

// UI Control State
export interface UIControlState {
  muteAvailable: boolean;
  endCallAvailable: boolean;
  muteState: boolean;
}

// Device Context
export interface DeviceContext {
  deviceType: DeviceType;
  deviceId: string;
  isLocalDevice: boolean;
  acceptedBy?: DeviceType;
}

// Unified Call State
export interface UnifiedCallState {
  identifier: CallIdentifier;
  phase: CallPhase;
  webrtcQuality: CallQuality;
  uiControls: UIControlState;
  deviceContext: DeviceContext;
  startTime: Date;
  duration?: number;
  participants: {
    customer: { connected: boolean; socketId?: string };
    agent: { connected: boolean; socketId?: string; handle?: string };
  };
}

// =============================================================================
// RATIONALIZED EVENT INTERFACES
// =============================================================================

// 1. CALL LIFECYCLE EVENTS (Replaces 8+ fragmented events)
export interface CallStateChangedEvent {
  type: 'call.state_changed';
  callId: string;
  handle: string;
  previous: Partial<UnifiedCallState>;
  current: UnifiedCallState;
  changes: string[];  // ['phase', 'webrtc_quality', 'ui_controls']
  timestamp: Date;
  sourceId?: string;
}

export interface CallTerminatedEvent {
  type: 'call.terminated';
  callId: string;
  handle: string;
  reason: 'user_hangup' | 'timeout' | 'network_error' | 'cancelled' | 'declined' | 'agent_declined';
  initiator: CallInitiator;
  phase: CallPhase;  // Phase when termination occurred
  duration: number;
  deviceContext: DeviceContext;
  sourceId?: string;
}

export interface CallErrorEvent {
  type: 'call.error';
  callId: string;
  handle: string;
  code: string;        // 'WEBRTC_FAILED', 'DEVICE_OFFLINE', 'TIMEOUT'
  severity: 'warning' | 'error' | 'fatal';
  phase: CallPhase;
  recoverable: boolean;
  uiImpact: {
    disableControls: boolean;
    showRetry: boolean;
    allowEndCall: boolean;  // Always allow ending even during errors
  };
  retryStrategy?: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
  };
  context: Record<string, any>;
  sourceId?: string;
}

// 2. UI CONTROL EVENTS (Centralized mute/control handling)
export interface UIControlChangedEvent {
  type: 'ui.control_changed';
  callId: string;
  handle: string;
  controlType: 'mute' | 'end_call';
  newState: boolean | 'triggered';
  source: 'user_action' | 'system' | 'device_switch';
  phase: CallPhase;
  deviceContext: DeviceContext;
  sourceId?: string;
}

export interface UIStateSyncEvent {
  type: 'ui.state_sync';
  callId: string;
  handle: string;
  uiControls: UIControlState;
  syncedDevices: DeviceType[];
  lastUpdate: Date;
  sourceId?: string;
}

// 3. DEVICE COORDINATION EVENTS (Unified multi-device handling)
export interface DeviceCallEvent {
  type: 'device.call_accepted' | 'device.call_ended';
  callId: string;
  handle: string;
  deviceContext: DeviceContext;
  callState: UnifiedCallState;
  sourceId?: string;
}

export interface DeviceStatusEvent {
  type: 'device.status_changed';
  handle: string;
  deviceType: DeviceType;
  status: 'online' | 'offline' | 'busy';
  capabilities: {
    canReceiveCalls: boolean;
    hasActiveCall: boolean;
    fcmToken?: string;
    socketConnected?: boolean;
  };
  lastSeen: Date;
}

export interface DeviceSyncEvent {
  type: 'device.sync_required';
  handle: string;
  reason: 'state_mismatch' | 'reconnection' | 'conflict_resolution';
  devices: {
    [key in DeviceType]?: {
      online: boolean;
      hasActiveCall: boolean;
      fcmToken?: string;
      socketConnected?: boolean;
    };
  };
  callState?: {
    status: 'available' | 'busy' | 'ringing';
    currentCallId?: string;
    acceptedBy?: DeviceType;
  };
}

// 4. WEBRTC STATE EVENTS (Simplified WebRTC tracking)
export interface WebRTCStateEvent {
  type: 'webrtc.state_changed';
  callId: string;
  handle: string;
  previous: CallQuality;
  current: CallQuality;
  stage: 'initializing' | 'signaling' | 'ice_gathering' | 'ice_connecting' | 'connected' | 'failed';
  networkInfo?: {
    candidateType: string;
    connectionType: string;
    roundTripTime?: number;
  };
  sourceId?: string;
}

// 5. ROUTING EVENTS (Business logic routing)
export interface CallRoutingEvent {
  type: 'routing.call_routed' | 'routing.no_agents' | 'routing.handle_busy';
  callId: string;
  handle: string;
  routingDecision: {
    selectedDevices: DeviceType[];
    rejectedDevices: DeviceType[];
    fallbackStrategy: 'fcm' | 'queue' | 'reject';
    estimatedWaitTime?: number;
  };
  availableAgents: {
    total: number;
    online: number;
    busy: number;
  };
  sourceId?: string;
}

// =============================================================================
// UNIFIED EVENT UNION TYPES
// =============================================================================

export type CallLifecycleEvents = 
  | CallStateChangedEvent
  | CallTerminatedEvent
  | CallErrorEvent;

export type UIControlEvents = 
  | UIControlChangedEvent
  | UIStateSyncEvent;

export type DeviceEvents = 
  | DeviceCallEvent
  | DeviceStatusEvent
  | DeviceSyncEvent;

export type WebRTCEvents = 
  | WebRTCStateEvent;

export type RoutingEvents = 
  | CallRoutingEvent;

export type AllRationalizedEvents = 
  | CallLifecycleEvents
  | UIControlEvents
  | DeviceEvents
  | WebRTCEvents
  | RoutingEvents;

// =============================================================================
// BACKWARD COMPATIBILITY LAYER
// =============================================================================

// Maps old events to new rationalized events
export interface LegacyEventMapping {
  // Old event names that will be deprecated
  'call_accepted': CallStateChangedEvent;
  'call_ended': CallTerminatedEvent;
  'call_timeout': CallTerminatedEvent;
  'no_agents_available': CallRoutingEvent;
  'webrtc_connected': WebRTCStateEvent;
  'webrtc_failed': CallErrorEvent;
  'call_request_cancelled': CallTerminatedEvent;
  'device_status_changed': DeviceStatusEvent;
  'call_accepted_elsewhere': DeviceCallEvent;
}

// =============================================================================
// UI CONTROL AVAILABILITY MATRIX
// =============================================================================

export const UI_CONTROL_MATRIX: Record<CallPhase, UIControlState> = {
  'initializing': { muteAvailable: false, endCallAvailable: false, muteState: false },
  'routing': { muteAvailable: false, endCallAvailable: true, muteState: false },
  'ringing': { muteAvailable: false, endCallAvailable: true, muteState: false },
  'connecting': { muteAvailable: true, endCallAvailable: true, muteState: false },  // ✅ BOTH CONTROLS
  'active': { muteAvailable: true, endCallAvailable: true, muteState: false },      // ✅ BOTH CONTROLS
  'terminated': { muteAvailable: false, endCallAvailable: false, muteState: false }
};

// =============================================================================
// EVENT HANDLER TYPE DEFINITIONS
// =============================================================================

export interface RationalizedEventHandlers {
  // Call lifecycle handlers
  'call.state_changed': (event: CallStateChangedEvent) => void;
  'call.terminated': (event: CallTerminatedEvent) => void;
  'call.error': (event: CallErrorEvent) => void;

  // UI control handlers
  'ui.control_changed': (event: UIControlChangedEvent) => void;
  'ui.state_sync': (event: UIStateSyncEvent) => void;

  // Device coordination handlers
  'device.call_accepted': (event: DeviceCallEvent) => void;
  'device.call_ended': (event: DeviceCallEvent) => void;
  'device.status_changed': (event: DeviceStatusEvent) => void;
  'device.sync_required': (event: DeviceSyncEvent) => void;

  // WebRTC handlers
  'webrtc.state_changed': (event: WebRTCStateEvent) => void;

  // Routing handlers
  'routing.call_routed': (event: CallRoutingEvent) => void;
  'routing.no_agents': (event: CallRoutingEvent) => void;
  'routing.handle_busy': (event: CallRoutingEvent) => void;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function createCallIdentifier(
  callId: string, 
  handle: string, 
  sessionId?: string, 
  sourceId?: string
): CallIdentifier {
  return { callId, handle, sessionId, sourceId };
}

export function getUIControlsForPhase(phase: CallPhase): UIControlState {
  return { ...UI_CONTROL_MATRIX[phase] };
}

export function isPhaseWithControls(phase: CallPhase): boolean {
  const controls = UI_CONTROL_MATRIX[phase];
  return controls.muteAvailable || controls.endCallAvailable;
}

export function createDeviceContext(
  deviceType: DeviceType, 
  deviceId: string, 
  isLocal: boolean = true
): DeviceContext {
  return {
    deviceType,
    deviceId,
    isLocalDevice: isLocal
  };
}