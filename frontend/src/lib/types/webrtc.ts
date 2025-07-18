export interface CallState {
  status: 'idle' | 'connecting' | 'connected' | 'ended' | 'failed';
  callId?: string;
  isCustomer: boolean;
  isMuted: boolean;
  error?: string;
  sourceId?: string;
}

export interface ConnectionConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize?: number;
}

export interface CallQuality {
  level: 'good' | 'poor' | 'failed';
  details?: {
    packetsLost?: number;
    jitter?: number;
    roundTripTime?: number;
  };
}

export interface MediaConstraints {
  audio: boolean | MediaTrackConstraints;
  video: boolean | MediaTrackConstraints;
}

export interface CallMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  connectionAttempts: number;
  quality: CallQuality;
  disconnectReason?: string;
}

export interface AgentInfo {
  id: string;
  name?: string;
  status: 'available' | 'busy' | 'offline';
}

export interface CustomerInfo {
  callId: string;
  joinTime: number;
}