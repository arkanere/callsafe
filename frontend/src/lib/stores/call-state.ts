import { writable } from 'svelte/store';
import type { CallState, CustomerCallState } from '../types/call-state';

const initialCallState: CallState = {
  currentCall: null,
  webrtc: {
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    connectionState: 'new'
  },
  ui: {
    status: 'unavailable',
    showIncomingCallModal: false,
    showCallControls: false,
    isMuted: false
  },
  callHistory: []
};

export const callState = writable<CallState>(initialCallState);

if (import.meta.env.DEV) {
  callState.subscribe((state) => {
    console.log('[CALL STATE STORE] Call state updated:', state);
  });
}

const initialCustomerCallState: CustomerCallState = {
  callAttemptId: null,
  state: 'idle',
  callType: 'voice',
  webrtc: {
    peerConnection: null,
    localStream: null,
    remoteStream: null
  },
  ui: {
    showCallButton: true,
    showCallControls: false,
    statusMessage: '',
    isMuted: false,
    isVideoEnabled: true
  },
  handle: '',
  sourceId: ''
};

export const customerCallState = writable<CustomerCallState>(initialCustomerCallState);

if (import.meta.env.DEV) {
  customerCallState.subscribe((state) => {
    console.log('[CALL STATE STORE] Customer call state updated:', state);
  });
}
