// Event types for Socket.IO communication with signaling server

export interface CallIncomingEvent {
  callAttemptId: string;
  sourceId: string;
  timestamp: number;
}

export interface CallAcceptedEvent {
  callAttemptId: string;
  timestamp: number;
}

export interface CallEndedEvent {
  callAttemptId: string;
  timestamp: number;
  duration: number;
}

export interface CallFailedEvent {
  callAttemptId: string;
  reason: 'connection_timeout' | 'connection_failed' | 'no_devices' | 'unknown';
  timestamp: number;
}

export interface CallBusyEvent {
  callAttemptId: string;
  timestamp: number;
}

export interface CallUnavailableEvent {
  callAttemptId: string;
  timestamp: number;
}

export interface CallTimeoutEvent {
  callAttemptId: string;
  timestamp: number;
}

export interface CallCancelledEvent {
  callAttemptId: string;
  reason: 'customer_cancelled' | 'other_device_accepted' | 'timeout';
  timestamp: number;
}

export interface WebRTCOfferEvent {
  callAttemptId: string;
  offer: RTCSessionDescription;
  timestamp: number;
}

export interface WebRTCAnswerEvent {
  callAttemptId: string;
  answer: RTCSessionDescription;
  timestamp: number;
}

export interface WebRTCIceCandidateEvent {
  callAttemptId: string;
  candidate: RTCIceCandidate;
  timestamp: number;
}