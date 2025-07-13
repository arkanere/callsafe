export interface CustomerEvents {
  customer_connect: () => void;
  call_ended: () => void;
  connection_failed: (reason: string) => void;
  reconnect_attempt: (attempt: number) => void;
}

export interface AgentEvents {
  agent_online: () => void;
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

export type AllSocketEvents = CustomerEvents & 
  AgentEvents & 
  ServerEvents & 
  ErrorEvents & 
  MonitoringEvents & 
  WebRTCSignalingEvents;