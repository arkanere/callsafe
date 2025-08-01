import { io, Socket } from 'socket.io-client';
import { AuthManager } from './auth-manager';
import { env } from '$env/dynamic/public';

export class ConnectionManager {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  async connect(): Promise<Socket> {
    console.log('[CONNECTION MANAGER] Initiating connection');
    
    const token = AuthManager.getToken();
    if (!token) {
      console.error('[CONNECTION MANAGER] No authentication token available');
      throw new Error('Authentication required');
    }
    console.log('[CONNECTION MANAGER] Authentication token retrieved');

    const socketUrl = env.VITE_SIGNALING_SERVER_URL || 'https://tunnel.callsafe.tech';
    console.log('[CONNECTION MANAGER] Creating socket.io connection to', socketUrl);
    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 30000, // 30-second timeout for consistency
      forceNew: true
    });
    console.log('[CONNECTION MANAGER] Socket.io instance created');

    console.log('[CONNECTION MANAGER] Setting up event handlers');
    this.setupEventHandlers();

    return new Promise((resolve, reject) => {
      this.socket!.on('connect', () => {
        console.log('[CONNECTION MANAGER] Socket connected successfully');
        this.reconnectAttempts = 0;
        resolve(this.socket!);
      });

      this.socket!.on('connect_error', (error) => {
        console.error('[CONNECTION MANAGER] Socket connection error:', error);
        reject(error);
      });
    });
  }

  getSocket(): Socket | null {
    console.log('[CONNECTION MANAGER] Getting socket instance:', this.socket ? 'socket available' : 'no socket');
    return this.socket;
  }

  disconnect(): void {
    console.log('[CONNECTION MANAGER] Disconnecting socket');
    if (this.socket) {
      console.log('[CONNECTION MANAGER] Socket found, disconnecting');
      this.socket.disconnect();
      this.socket = null;
      console.log('[CONNECTION MANAGER] Socket disconnected and cleared');
    } else {
      console.log('[CONNECTION MANAGER] No socket to disconnect');
    }
  }

  private setupEventHandlers(): void {
    console.log('[CONNECTION MANAGER] Setting up socket event handlers');
    
    this.socket!.on('disconnect', (reason) => {
      console.warn('[CONNECTION MANAGER] Socket disconnected:', reason);

      if (reason === 'io server disconnect') {
        console.log('[CONNECTION MANAGER] Server initiated disconnect - no reconnect');
        // Server initiated disconnect - don't reconnect automatically
        return;
      }

      console.log('[CONNECTION MANAGER] Client disconnect detected, attempting reconnection');
      // Attempt reconnection
      this.attemptReconnection();
    });

    this.socket!.on('error', (error) => {
      console.error('[CONNECTION MANAGER] Socket error:', error);

      if (error.type === 'AUTHENTICATION_REQUIRED') {
        console.log('[CONNECTION MANAGER] Authentication required, logging out');
        // Token expired - redirect to login
        AuthManager.logout();
      }
    });
    
    console.log('[CONNECTION MANAGER] Event handlers setup complete');
  }

  private async attemptReconnection(): Promise<void> {
    console.log('[CONNECTION MANAGER] Attempting reconnection, current attempts:', this.reconnectAttempts);
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[CONNECTION MANAGER] Max reconnection attempts reached:', this.maxReconnectAttempts);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log('[CONNECTION MANAGER] Scheduling reconnection attempt', this.reconnectAttempts, 'in', delay, 'ms');

    setTimeout(() => {
      console.log(`[CONNECTION MANAGER] Executing reconnection attempt ${this.reconnectAttempts}`);
      this.connect().catch((error) => {
        console.error('[CONNECTION MANAGER] Reconnection attempt failed:', error);
        this.attemptReconnection();
      });
    }, delay);
  }
}