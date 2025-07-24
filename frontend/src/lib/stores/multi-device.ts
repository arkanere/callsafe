import { writable, derived, get } from 'svelte/store';
import type { 
  HandleDeviceState, 
  HandleStateUpdate, 
  MultiDeviceCoordinator,
  AndroidDevice,
  WebDevice 
} from '../types/multi-device.js';

// Global store for all handle states
const handleStates = writable<Map<string, HandleDeviceState>>(new Map());

// Current handle being viewed/managed
export const currentHandle = writable<string>('');

// Derived store for current handle's state
export const currentHandleState = derived(
  [handleStates, currentHandle],
  ([$handleStates, $currentHandle]) => {
    if (!$currentHandle) return null;
    return $handleStates.get($currentHandle) || null;
  }
);

// Derived stores for specific aspects of current handle
export const currentCallState = derived(
  currentHandleState,
  ($state) => $state?.callState || null
);

export const currentDevices = derived(
  currentHandleState,
  ($state) => $state?.devices || { android: undefined, web: undefined }
);

export const isCurrentHandleBusy = derived(
  currentCallState,
  ($callState) => $callState?.status === 'busy' || $callState?.status === 'ringing'
);

export const availableDevices = derived(
  currentDevices,
  ($devices) => {
    const available: ('android' | 'web')[] = [];
    
    // Android available if has FCM token (regardless of socket connection)
    if ($devices.android?.fcmToken) {
      available.push('android');
    }
    
    // Web available if socket connected
    if ($devices.web?.socketConnected) {
      available.push('web');
    }
    
    return available;
  }
);

// Multi-device coordinator implementation
class MultiDeviceCoordinatorImpl implements MultiDeviceCoordinator {
  getHandleState(handle: string): HandleDeviceState | null {
    const states = get(handleStates);
    return states.get(handle) || null;
  }

  updateHandleState(handle: string, update: HandleStateUpdate): void {
    handleStates.update(states => {
      const currentState = states.get(handle);
      let newState: HandleDeviceState;

      if (!currentState) {
        // Create new state if doesn't exist
        newState = {
          handle,
          devices: { android: undefined, web: undefined },
          callState: { status: 'available' },
          lastUpdated: new Date()
        };
      } else {
        newState = { ...currentState };
      }

      switch (update.type) {
        case 'device_update':
          if (update.deviceType === 'android') {
            newState.devices.android = {
              ...newState.devices.android,
              ...update.deviceData,
              lastActivity: new Date()
            } as AndroidDevice;
          } else {
            newState.devices.web = {
              ...newState.devices.web,
              ...update.deviceData,
              lastActivity: new Date()
            } as WebDevice;
          }
          break;

        case 'call_update':
          newState.callState = {
            ...newState.callState,
            ...update.callData
          };
          break;

        case 'full_sync':
          newState = { ...update.state };
          break;
      }

      newState.lastUpdated = new Date();
      states.set(handle, newState);
      return states;
    });
  }

  isHandleBusy(handle: string): boolean {
    const state = this.getHandleState(handle);
    return state?.callState.status === 'busy' || state?.callState.status === 'ringing';
  }

  getAvailableDevices(handle: string): ('android' | 'web')[] {
    const state = this.getHandleState(handle);
    if (!state) return [];

    const available: ('android' | 'web')[] = [];
    
    // Android available if has FCM token
    if (state.devices.android?.fcmToken) {
      available.push('android');
    }
    
    // Web available if socket connected
    if (state.devices.web?.socketConnected) {
      available.push('web');
    }
    
    return available;
  }

  canAcceptCall(handle: string, deviceType: 'android' | 'web'): boolean {
    const state = this.getHandleState(handle);
    if (!state || state.callState.status !== 'ringing') return false;

    const availableDevices = this.getAvailableDevices(handle);
    return availableDevices.includes(deviceType);
  }

  // Helper method to register device
  registerDevice(handle: string, deviceType: 'android' | 'web', data: { fcmToken?: string; socketConnected?: boolean }): void {
    console.log(`📱 Registering ${deviceType} device for handle:`, handle, data);
    
    this.updateHandleState(handle, {
      type: 'device_update',
      deviceType,
      deviceData: {
        online: true,
        ...data
      }
    });
  }

  // Helper method to mark device offline
  unregisterDevice(handle: string, deviceType: 'android' | 'web'): void {
    console.log(`📱 Unregistering ${deviceType} device for handle:`, handle);
    
    this.updateHandleState(handle, {
      type: 'device_update',
      deviceType,
      deviceData: {
        online: false,
        socketConnected: false
      }
    });
  }

  // Helper method to update call state
  updateCallState(handle: string, callData: Partial<HandleDeviceState['callState']>): void {
    console.log(`📞 Updating call state for handle:`, handle, callData);
    
    this.updateHandleState(handle, {
      type: 'call_update',
      callData
    });
  }

  // Helper method for full state sync from server
  syncHandleState(state: HandleDeviceState): void {
    console.log('🔄 Syncing full handle state:', state);
    
    this.updateHandleState(state.handle, {
      type: 'full_sync',
      state
    });
  }

  // Debug helper to get all states
  getAllStates(): Map<string, HandleDeviceState> {
    return get(handleStates);
  }
}

// Export singleton coordinator
export const multiDeviceCoordinator = new MultiDeviceCoordinatorImpl();

// Helper functions for components
export const setCurrentHandle = (handle: string) => {
  console.log('🎯 Setting current handle:', handle);
  currentHandle.set(handle);
};

export const clearCurrentHandle = () => {
  currentHandle.set('');
};

// Subscribe to state changes for debugging
if (typeof window !== 'undefined') {
  handleStates.subscribe(states => {
    console.log('🔄 Handle states updated:', Array.from(states.entries()));
  });
}