export interface CallState {
  currentCall: {
    callAttemptId: string;
    sourceId: string;
    state: 'incoming' | 'connected' | 'ended';
    startTime: number;
    duration: number;
  } | null;
  webrtc: {
    peerConnection: RTCPeerConnection | null;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    connectionState: RTCPeerConnectionState;
  };
  ui: {
    status: 'available' | 'unavailable' | 'busy' | 'ringing';
    showIncomingCallModal: boolean;
    showCallControls: boolean;
    isMuted: boolean;
  };
  callHistory: CallRecord[];
}

export interface CustomerCallState {
  callAttemptId: string | null;
  state: 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';
  webrtc: {
    peerConnection: RTCPeerConnection | null;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
  };
  ui: {
    showCallButton: boolean;
    showCallControls: boolean;
    statusMessage: string;
    isMuted: boolean;
  };
  handle: string;
  sourceId: string;
}

export interface CallRecord {
  callAttemptId: string;
  sourceId: string;
  startTime: number;
  endTime: number;
  duration: number;
  device: 'web' | 'android';
  status: 'completed' | 'missed' | 'failed' | 'timeout' | 'cancelled';
}