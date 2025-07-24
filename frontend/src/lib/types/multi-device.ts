// Multi-device state management types

export interface AndroidDevice {
  online: boolean;
  fcmToken?: string;
  socketConnected: boolean;
  lastActivity?: Date;
  deviceId?: string;
}

export interface WebDevice {
  online: boolean;
  socketConnected: boolean;
  lastActivity?: Date;
  sessionId?: string;
}

export interface HandleCallState {
  status: 'available' | 'busy' | 'ringing';
  currentCallId?: string;
  acceptedBy?: 'android' | 'web';
  callStartTime?: Date;
  sourceId?: string;
}

export interface HandleDeviceState {
  handle: string;
  devices: {
    android?: AndroidDevice;
    web?: WebDevice;
  };
  callState: HandleCallState;
  lastUpdated: Date;
}

// Device coordination events
export interface DeviceEvent {
  type: 'device_registered' | 'device_status_changed' | 'device_disconnected';
  handle: string;
  deviceType: 'android' | 'web';
  data: {
    online?: boolean;
    fcmToken?: string;
    socketConnected?: boolean;
  };
  timestamp: Date;
}

export interface CallEvent {
  type: 'call_started' | 'call_accepted' | 'call_ended' | 'call_accepted_elsewhere';
  handle: string;
  callId: string;
  deviceType?: 'android' | 'web';
  data: {
    acceptedBy?: 'android' | 'web';
    reason?: string;
    sourceId?: string;
  };
  timestamp: Date;
}

// Handle state update operations
export type HandleStateUpdate = 
  | { type: 'device_update'; deviceType: 'android' | 'web'; deviceData: Partial<AndroidDevice | WebDevice> }
  | { type: 'call_update'; callData: Partial<HandleCallState> }
  | { type: 'full_sync'; state: HandleDeviceState };

// Multi-device coordination utilities
export interface MultiDeviceCoordinator {
  getHandleState(handle: string): HandleDeviceState | null;
  updateHandleState(handle: string, update: HandleStateUpdate): void;
  isHandleBusy(handle: string): boolean;
  getAvailableDevices(handle: string): ('android' | 'web')[];
  canAcceptCall(handle: string, deviceType: 'android' | 'web'): boolean;
}