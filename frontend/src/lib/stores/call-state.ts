import { writable } from 'svelte/store';
import type { CallState, CustomerCallState } from '../types/call-state';

console.log('[CALL STATE STORE] Initializing call state stores');

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
console.log('[CALL STATE STORE] Initial call state:', initialCallState);

export const callState = writable<CallState>(initialCallState);
console.log('[CALL STATE STORE] Call state store created');

// Add debug logging for call state updates
callState.subscribe((state) => {
  console.log('[CALL STATE STORE] Call state updated:', state);
});

const initialCustomerCallState: CustomerCallState = {
  callAttemptId: null,
  state: 'idle',
  webrtc: {
    peerConnection: null,
    localStream: null,
    remoteStream: null
  },
  ui: {
    showCallButton: true,
    showCallControls: false,
    statusMessage: '',
    isMuted: false
  },
  handle: '',
  sourceId: ''
};
console.log('[CALL STATE STORE] Initial customer call state:', initialCustomerCallState);

export const customerCallState = writable<CustomerCallState>(initialCustomerCallState);
console.log('[CALL STATE STORE] Customer call state store created');

// Add debug logging for customer call state updates
customerCallState.subscribe((state) => {
  console.log('[CALL STATE STORE] Customer call state updated:', state);
});

console.log('[CALL STATE STORE] All stores initialized successfully');