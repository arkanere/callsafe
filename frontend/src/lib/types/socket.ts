export interface CustomerEvents {
  call_ended: () => void;
  connection_failed: (reason: string) => void;
  reconnect_attempt: (attempt: number) => void;
}

export interface AgentEvents {
  agent_offline: () => void;
  accept_call: (callId: string) => void;
  decline_call: (callId: string) => void;
}

export interface ServerEvents {
  new_incoming_call: (data: { callId: string; customerInfo?: any }) => void;
  call_accepted: (data: { callId: string; agentInfo?: any }) => void;
  call_routed: (data: { callId: string; customerInfo?: any }) => void;
  call_ended: (callId: string) => void;
  no_agents_available: () => void;
  call_timeout: (callId: string) => void;
  call_no_longer_available: (data: { callId: string; handle?: string }) => void;
  agent_registered: (data: { agentId: string; handle?: string; sourceId?: string }) => void;
  call_request_cancelled: (data: { handle: string; reason: string }) => void;
  handle_not_found: () => void;
  missed_call: (data: { callId: string; sourceId?: string; reason?: string }) => void;
}

export interface ErrorEvents {
  network_error: (error: string) => void;
  turn_server_failed: (error: string) => void;
  call_disconnected: (reason: string) => void;
}

export interface MonitoringEvents {
  connection_success: (data: { callId: string; duration: number }) => void;
  connection_failure: (data: { callId: string; reason: string }) => void;
  call_quality_report: (data: { callId: string; quality: 'good' | 'poor' | 'failed' }) => void;
}

export interface WebRTCSignalingEvents {
  offer: (data: { callId: string; offer: RTCSessionDescriptionInit }) => void;
  answer: (data: { callId: string; answer: RTCSessionDescriptionInit }) => void;
  ice_candidate: (data: { callId: string; candidate: RTCIceCandidateInit }) => void;
}

// Multi-device coordination events
export interface MultiDeviceEvents {
  // Device status events
  device_registered: (data: { handle: string; deviceType: 'android' | 'web'; online: boolean; fcmToken?: string }) => void;
  device_status_changed: (data: { handle: string; deviceType: 'android' | 'web'; online: boolean }) => void;
  handle_busy_state_changed: (data: { handle: string; busy: boolean; callId?: string; acceptedBy?: 'android' | 'web' }) => void;
  
  // Multi-device call coordination
  call_accepted_elsewhere: (data: { callId: string; handle: string; acceptedBy: 'android' | 'web'; deviceId?: string }) => void;
  call_ended_elsewhere: (data: { callId: string; handle: string; endedBy: 'android' | 'web'; reason?: string }) => void;
  
  // Device synchronization
  sync_handle_state: (data: { 
    handle: string; 
    devices: {
      android?: { online: boolean; fcmToken?: string; socketConnected?: boolean };
      web?: { online: boolean; socketConnected?: boolean };
    };
    callState: {
      status: 'available' | 'busy' | 'ringing';
      currentCallId?: string;
      acceptedBy?: 'android' | 'web';
    };
  }) => void;
}

export type AllSocketEvents = CustomerEvents & 
  AgentEvents & 
  ServerEvents & 
  ErrorEvents & 
  MonitoringEvents & 
  WebRTCSignalingEvents &
  MultiDeviceEvents;