import { io, type Socket } from 'socket.io-client';
import { browser } from '$app/environment';
import type { RationalizedEventHandlers, AllRationalizedEvents } from './types/rationalized-events.js';
import { multiDeviceCoordinator } from './stores/multi-device.js';

export class SocketManager {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 16000; // Max 16 seconds
  private serverUrl: string;
  private rationalizedHandlers: Map<string, Function[]> = new Map();
  
  // State tracking for reconnection
  private agentState: {
    isAgentOnline: boolean;
    registrationType: 'none' | 'with_handle';
    handle?: string;
    sourceId?: string;
  } = {
    isAgentOnline: false,
    registrationType: 'none'
  };

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || import.meta.env.VITE_SIGNALING_SERVER_URL || 'ws://localhost:3000';
  }

  connect(): Promise<void> {
    console.log('=== SOCKET CONNECT ===');
    console.log('Server URL:', this.serverUrl);
    console.log('Browser environment:', browser);
    
    if (!browser) {
      console.error('❌ Socket.io not available on server');
      return Promise.reject(new Error('Socket.io not available on server'));
    }

    // If already connected, return resolved promise
    if (this.socket && this.isConnected) {
      console.log('✅ Socket already connected, reusing connection');
      return Promise.resolve();
    }

    // Clean up any existing socket before creating new one
    if (this.socket) {
      console.log('🧹 Cleaning up existing socket connection');
      this.socket.disconnect();
      this.socket = null;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 Creating socket connection...');
        this.socket = io(this.serverUrl, {
          autoConnect: true,
          reconnection: false, // We'll handle reconnection manually
          timeout: 10000,
          transports: ['websocket', 'polling']
        });
        console.log('✅ Socket instance created');

        this.setupEventHandlers();

        this.socket.on('connect', () => {
          console.log('🎉 Socket connected successfully!');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000; // Reset delay
          console.log('Connected to signaling server');
          
          // Restore agent state after reconnection
          this.restoreAgentState();
          
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('Connection error:', error);
          this.isConnected = false;
          
          if (this.reconnectAttempts === 0) {
            // First connection attempt failed
            reject(error);
          } else {
            // Subsequent reconnection attempts
            this.handleReconnection();
          }
        });

        this.socket.on('disconnect', (reason) => {
          console.log('Disconnected from signaling server:', reason);
          this.isConnected = false;
          
          // Only auto-reconnect if it wasn't a manual disconnect
          if (reason !== 'io client disconnect') {
            this.handleReconnection();
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.setupRationalizedEventHandlers();
    this.setupMultiDeviceEventHandlers();
  }

  private setupRationalizedEventHandlers(): void {
    if (!this.socket) return;

    console.log('📡 Setting up rationalized event handlers');

    // Core call lifecycle events
    this.socket.on('call.state_changed', (event) => {
      console.log('📞 Call state changed:', event);
      this.triggerRationalizedHandler('call.state_changed', event);
    });

    this.socket.on('call.terminated', (event) => {
      console.log('📞 Call terminated:', event);
      this.triggerRationalizedHandler('call.terminated', event);
    });

    this.socket.on('call.error', (event) => {
      console.log('⚠️ Call error:', event);
      this.triggerRationalizedHandler('call.error', event);
    });

    // UI control events
    this.socket.on('ui.control_changed', (event) => {
      console.log('🎛️ UI control changed:', event);
      this.triggerRationalizedHandler('ui.control_changed', event);
    });

    this.socket.on('ui.state_sync', (event) => {
      console.log('🔄 UI state sync:', event);
      this.triggerRationalizedHandler('ui.state_sync', event);
    });

    // Device coordination events
    this.socket.on('device.call_accepted', (event) => {
      console.log('📱 Device call accepted:', event);
      this.triggerRationalizedHandler('device.call_accepted', event);
    });

    this.socket.on('device.call_ended', (event) => {
      console.log('📱 Device call ended:', event);
      this.triggerRationalizedHandler('device.call_ended', event);
    });

    this.socket.on('device.status_changed', (event) => {
      console.log('📱 Device status changed:', event);
      this.triggerRationalizedHandler('device.status_changed', event);
    });

    this.socket.on('device.sync_required', (event) => {
      console.log('🔄 Device sync required:', event);
      this.triggerRationalizedHandler('device.sync_required', event);
    });

    // WebRTC events
    this.socket.on('webrtc.state_changed', (event) => {
      console.log('🌐 WebRTC state changed:', event);
      this.triggerRationalizedHandler('webrtc.state_changed', event);
    });

    // Routing events
    this.socket.on('routing.call_routed', (event) => {
      console.log('🚦 Call routed:', event);
      this.triggerRationalizedHandler('routing.call_routed', event);
    });

    this.socket.on('routing.no_agents', (event) => {
      console.log('🚫 No agents available:', event);
      this.triggerRationalizedHandler('routing.no_agents', event);
    });

    this.socket.on('routing.handle_busy', (event) => {
      console.log('📞 Handle busy:', event);
      this.triggerRationalizedHandler('routing.handle_busy', event);
    });

    // WebRTC signaling (rationalized events)
    this.socket.on('webrtc.offer', (data) => {
      this.triggerRationalizedHandler('webrtc.offer', data);
    });

    this.socket.on('webrtc.answer', (data) => {
      this.triggerRationalizedHandler('webrtc.answer', data);
    });

    this.socket.on('webrtc.ice_candidate', (data) => {
      this.triggerRationalizedHandler('webrtc.ice_candidate', data);
    });
  }

  private setupMultiDeviceEventHandlers(): void {
    if (!this.socket) return;

    // Device registration and status events
    this.socket.on('device_registered', (data) => {
      console.log('📱 Device registered:', data);
      multiDeviceCoordinator.registerDevice(data.handle, data.deviceType, {
        fcmToken: data.fcmToken,
        socketConnected: data.online
      });
      this.triggerCallback('device_registered', data);
    });

    this.socket.on('device_status_changed', (data) => {
      console.log('📱 Device status changed:', data);
      multiDeviceCoordinator.updateHandleState(data.handle, {
        type: 'device_update',
        deviceType: data.deviceType,
        deviceData: { online: data.online }
      });
      this.triggerCallback('device_status_changed', data);
    });

    // Handle busy state changes
    this.socket.on('handle_busy_state_changed', (data) => {
      console.log('📞 Handle busy state changed:', data);
      multiDeviceCoordinator.updateCallState(data.handle, {
        status: data.busy ? 'busy' : 'available',
        currentCallId: data.callId,
        acceptedBy: data.acceptedBy
      });
      this.triggerCallback('handle_busy_state_changed', data);
    });

    // Multi-device call coordination
    this.socket.on('call_accepted_elsewhere', (data) => {
      console.log('📞 Call accepted elsewhere:', data);
      multiDeviceCoordinator.updateCallState(data.handle, {
        status: 'busy',
        currentCallId: data.callId,
        acceptedBy: data.acceptedBy
      });
      this.triggerCallback('call_accepted_elsewhere', data);
    });

    this.socket.on('call_ended_elsewhere', (data) => {
      console.log('📞 Call ended elsewhere:', data);
      multiDeviceCoordinator.updateCallState(data.handle, {
        status: 'available',
        currentCallId: undefined,
        acceptedBy: undefined
      });
      this.triggerCallback('call_ended_elsewhere', data);
    });

    // Full state synchronization
    this.socket.on('sync_handle_state', (data) => {
      console.log('🔄 Syncing handle state:', data);
      multiDeviceCoordinator.syncHandleState({
        handle: data.handle,
        devices: data.devices,
        callState: data.callState,
        lastUpdated: new Date()
      });
      this.triggerCallback('sync_handle_state', data);
    });
  }

  private triggerRationalizedHandler(event: string, data: any): void {
    const handlers = this.rationalizedHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[SocketManager] Error in rationalized handler for ${event}:`, error);
        }
      });
    }
  }

  private async handleReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.triggerCallback('connection_failed', 'Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    this.triggerCallback('reconnect_attempt', this.reconnectAttempts);
    
    console.log(`Reconnection attempt ${this.reconnectAttempts} in ${this.reconnectDelay}ms`);
    
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
    
    // Exponential backoff with jitter
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2 + Math.random() * 1000,
      this.maxReconnectDelay
    );

    try {
      if (this.socket) {
        this.socket.disconnect();
      }
      await this.connect();
    } catch (error) {
      console.error('Reconnection failed:', error);
      this.handleReconnection(); // Try again
    }
  }

  private restoreAgentState(): void {
    if (!this.agentState.isAgentOnline) {
      console.log('🔄 No agent state to restore (agent was offline)');
      return;
    }

    console.log('🔄 Restoring agent state after reconnection:', this.agentState);
    
    if (this.agentState.registrationType === 'with_handle' && this.agentState.handle) {
      console.log('🔄 Re-registering agent with handle:', this.agentState.handle, 'sourceId:', this.agentState.sourceId);
      this.emit('device.register', { 
        handle: this.agentState.handle, 
        sourceId: this.agentState.sourceId,
        deviceType: 'web'
      });
    }
  }

  // Customer methods
  connectAsCustomerWithHandle(handle: string, sourceId?: string, callAttemptId?: string): void {
    console.log('📤 Emitting call.initiate for handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId);
    this.emit('call.initiate', { handle, sourceId, callAttemptId });
  }

  endCall(data?: { callId?: string; handle?: string; sourceId?: string; callAttemptId?: string }): void {
    console.log('📤 Emitting call.terminate with data:', data);
    this.emit('call.terminate', data || {});
  }

  cancelCallRequest(handle: string, sourceId?: string, callAttemptId?: string): void {
    console.log('📤 Emitting call.cancel for handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId);
    this.emit('call.cancel', { handle, sourceId, callAttemptId });
  }

  // Agent methods
  goOnlineWithHandle(handle: string, sourceId?: string): void {
    console.log('📤 Emitting device.register for handle:', handle, 'sourceId:', sourceId);
    this.agentState = {
      isAgentOnline: true,
      registrationType: 'with_handle',
      handle,
      sourceId
    };
    this.emit('device.register', { handle, sourceId, deviceType: 'web' });
  }

  goOffline(): void {
    console.log('📤 Emitting device.offline');
    this.agentState = {
      isAgentOnline: false,
      registrationType: 'none'
    };
    this.emit('device.offline', { handle: this.agentState.handle });
  }

  acceptCall(callId: string, handle?: string, sourceId?: string, callAttemptId?: string): void {
    console.log('📤 Emitting call.accept for:', callId, 'handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId);
    this.emit('call.accept', { callId, handle, sourceId, callAttemptId });
  }

  declineCall(callId: string, handle?: string, sourceId?: string, callAttemptId?: string): void {
    console.log('📤 Emitting call.decline for:', callId, 'handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId);
    this.emit('call.decline', { callId, handle, sourceId, callAttemptId });
  }

  // WebRTC signaling methods
  sendOffer(callId: string, offer: RTCSessionDescriptionInit, handle?: string, sourceId?: string, callAttemptId?: string): void {
    console.log('📤 Emitting webrtc.offer for:', callId, offer, 'handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId);
    this.emit('webrtc.offer', { callId, offer, handle, sourceId, callAttemptId });
  }

  sendAnswer(callId: string, answer: RTCSessionDescriptionInit, handle?: string, sourceId?: string, callAttemptId?: string): void {
    console.log('📤 Emitting webrtc.answer for:', callId, answer, 'handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId);
    this.emit('webrtc.answer', { callId, answer, handle, sourceId, callAttemptId });
  }

  sendIceCandidate(callId: string, candidate: RTCIceCandidateInit, handle?: string, sourceId?: string, callAttemptId?: string): void {
    console.log('📤 Emitting webrtc.ice_candidate for:', callId, candidate, 'handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId);
    this.emit('webrtc.ice_candidate', { callId, candidate, handle, sourceId, callAttemptId });
  }

  // WebRTC state synchronization methods
  emitWebRTCConnected(callId: string, handle?: string, sourceId?: string, callAttemptId?: string): void {
    console.log('📤 Emitting webrtc.connected for:', callId, 'handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId);
    this.emit('webrtc.connected', { callId, handle, sourceId, callAttemptId });
  }

  emitWebRTCFailed(callId: string, handle?: string, sourceId?: string, callAttemptId?: string, reason?: string): void {
    console.log('📤 Emitting webrtc.failed for:', callId, 'handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId, 'reason:', reason);
    this.emit('webrtc.failed', { callId, handle, sourceId, callAttemptId, reason });
  }

  emitWebRTCDisconnected(callId: string, handle?: string, sourceId?: string, callAttemptId?: string, reason?: string): void {
    console.log('📤 Emitting webrtc.disconnected for:', callId, 'handle:', handle, 'sourceId:', sourceId, 'callAttemptId:', callAttemptId, 'reason:', reason);
    this.emit('webrtc.disconnected', { callId, handle, sourceId, callAttemptId, reason });
  }

  // Multi-device coordination methods
  registerDevice(handle: string, deviceType: 'android' | 'web', fcmToken?: string): void {
    console.log('📤 Emitting device.register for handle:', handle, 'deviceType:', deviceType);
    this.emit('device.register', { handle, deviceType, fcmToken });
    
    // Update local state
    multiDeviceCoordinator.registerDevice(handle, deviceType, {
      fcmToken,
      socketConnected: true
    });
  }

  unregisterDevice(handle: string, deviceType: 'android' | 'web'): void {
    console.log('📤 Emitting device.unregister for handle:', handle, 'deviceType:', deviceType);
    this.emit('device.unregister', { handle, deviceType });
    
    // Update local state
    multiDeviceCoordinator.unregisterDevice(handle, deviceType);
  }

  requestHandleState(handle: string): void {
    console.log('📤 Requesting handle state for:', handle);
    this.emit('device.sync_request', { handle });
  }

  checkHandleBusyState(handle: string): void {
    console.log('📤 Checking handle busy state for:', handle);
    this.emit('check_handle_busy_state', { handle });
  }

  // Generic emit method
  private emit(event: string, data?: any): void {
    console.log('🔥 Attempting to emit:', event, 'with data:', data);
    console.log('Socket exists:', !!this.socket, 'Connected:', this.isConnected);
    
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
      console.log('✅ Event emitted successfully');
    } else {
      console.warn(`❌ Cannot emit ${event}: socket not connected`);
    }
  }

  // Event subscription methods (Rationalized only)
  on<K extends keyof RationalizedEventHandlers>(
    event: K, 
    handler: RationalizedEventHandlers[K]
  ): void {
    if (!this.rationalizedHandlers.has(event)) {
      this.rationalizedHandlers.set(event, []);
    }
    this.rationalizedHandlers.get(event)?.push(handler);
  }

  off(event: string, handler?: Function): void {
    if (!handler) {
      this.rationalizedHandlers.delete(event);
      return;
    }

    const handlers = this.rationalizedHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Connection status
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // Enable rationalized events (compatibility method)
  enableRationalizedEvents(enabled: boolean): void {
    console.log('📡 Rationalized events', enabled ? 'enabled' : 'disabled');
    // This is already handled in setupRationalizedEventHandlers
    // Method exists for compatibility with existing code
  }

  // Enhanced emission methods for rationalized events
  emit(event: string, data: any): void {
    console.log('🔥 Emitting event:', event, 'with data:', data);
    console.log('Socket exists:', !!this.socket, 'Connected:', this.isConnected);
    
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
      console.log('✅ Event emitted successfully');
    } else {
      console.warn(`❌ Cannot emit ${event}: socket not connected`);
    }
  }

  // UI Control methods (rationalized)
  emitUIControlChange(callId: string, handle: string, controlType: 'mute' | 'end_call', newState: boolean | 'triggered', sourceId?: string): void {
    this.emit('ui.control_changed', {
      type: 'ui.control_changed',
      callId,
      handle,
      controlType,
      newState,
      source: 'user_action',
      phase: 'active', // Will be updated by state machine
      deviceContext: { deviceType: 'web', deviceId: 'browser', isLocalDevice: true },
      sourceId
    });
  }

  // Cleanup
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.rationalizedHandlers.clear();
  }
}