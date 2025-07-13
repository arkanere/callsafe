import { io, type Socket } from 'socket.io-client';
import { browser } from '$app/environment';
import type { AllSocketEvents } from './types/socket.js';

export class SocketManager {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 16000; // Max 16 seconds
  private serverUrl: string;
  private connectionCallbacks: Map<string, (data?: any) => void> = new Map();

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl || import.meta.env.VITE_SIGNALING_SERVER_URL || 'ws://localhost:3000';
  }

  connect(): Promise<void> {
    if (!browser) {
      return Promise.reject(new Error('Socket.io not available on server'));
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.serverUrl, {
          autoConnect: true,
          reconnection: false, // We'll handle reconnection manually
          timeout: 10000,
          transports: ['websocket', 'polling']
        });

        this.setupEventHandlers();

        this.socket.on('connect', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000; // Reset delay
          console.log('Connected to signaling server');
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

    // Handle server events
    this.socket.on('new_incoming_call', (data) => {
      this.triggerCallback('new_incoming_call', data);
    });

    this.socket.on('call_accepted', (data) => {
      this.triggerCallback('call_accepted', data);
    });

    this.socket.on('call_routed', (data) => {
      this.triggerCallback('call_routed', data);
    });

    this.socket.on('call_ended', (callId) => {
      this.triggerCallback('call_ended', callId);
    });

    this.socket.on('no_agents_available', () => {
      this.triggerCallback('no_agents_available');
    });

    this.socket.on('call_timeout', (callId) => {
      this.triggerCallback('call_timeout', callId);
    });

    // Handle WebRTC signaling events
    this.socket.on('offer', (data) => {
      this.triggerCallback('offer', data);
    });

    this.socket.on('answer', (data) => {
      this.triggerCallback('answer', data);
    });

    this.socket.on('ice_candidate', (data) => {
      this.triggerCallback('ice_candidate', data);
    });

    // Handle error events
    this.socket.on('network_error', (error) => {
      this.triggerCallback('network_error', error);
    });

    this.socket.on('turn_server_failed', (error) => {
      this.triggerCallback('turn_server_failed', error);
    });

    this.socket.on('call_disconnected', (reason) => {
      this.triggerCallback('call_disconnected', reason);
    });
  }

  private triggerCallback(event: string, data?: any): void {
    const callback = this.connectionCallbacks.get(event);
    if (callback) {
      callback(data);
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

  // Customer methods
  connectAsCustomer(): void {
    this.emit('customer_connect');
  }

  endCall(): void {
    this.emit('call_ended');
  }

  // Agent methods
  goOnline(): void {
    this.emit('agent_online');
  }

  goOffline(): void {
    this.emit('agent_offline');
  }

  acceptCall(callId: string): void {
    this.emit('accept_call', callId);
  }

  declineCall(callId: string): void {
    this.emit('decline_call', callId);
  }

  // WebRTC signaling methods
  sendOffer(callId: string, offer: RTCSessionDescriptionInit): void {
    this.emit('offer', { callId, offer });
  }

  sendAnswer(callId: string, answer: RTCSessionDescriptionInit): void {
    this.emit('answer', { callId, answer });
  }

  sendIceCandidate(callId: string, candidate: RTCIceCandidateInit): void {
    this.emit('ice_candidate', { callId, candidate });
  }

  // Generic emit method
  private emit(event: string, data?: any): void {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`Cannot emit ${event}: socket not connected`);
    }
  }

  // Event subscription methods
  on<K extends keyof AllSocketEvents>(event: K, callback: AllSocketEvents[K]): void {
    this.connectionCallbacks.set(event, callback);
  }

  off(event: string): void {
    this.connectionCallbacks.delete(event);
  }

  // Connection status
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // Cleanup
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.connectionCallbacks.clear();
  }
}