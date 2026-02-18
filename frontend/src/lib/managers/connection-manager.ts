import { WsTransport } from '$lib/transport/ws-transport';
import { MessageTypes } from '@callsafe/protocol';
import { AuthManager } from './auth-manager';
import { env } from '$env/dynamic/public';

export class ConnectionManager {
  private transport: WsTransport | null = null;

  async connect(): Promise<WsTransport> {
    console.log('[CONNECTION MANAGER] connect(): Initiating connection');

    const serverUrl = env.VITE_SIGNALING_SERVER_URL || 'https://tunnel.callsafe.tech';
    const wsUrl = serverUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/ws';
    console.log('[CONNECTION MANAGER] connect(): Connecting to', wsUrl);

    this.transport = new WsTransport(wsUrl);
    this.setupEventHandlers();
    await this.transport.connect();

    console.log('[CONNECTION MANAGER] connect(): Connected successfully');
    return this.transport;
  }

  getTransport(): WsTransport | null {
    console.log('[CONNECTION MANAGER] getTransport(): Getting transport instance:', this.transport ? 'available' : 'null');
    return this.transport;
  }

  disconnect(): void {
    console.log('[CONNECTION MANAGER] disconnect(): Disconnecting');
    if (this.transport) {
      this.transport.disconnect();
      this.transport = null;
      console.log('[CONNECTION MANAGER] disconnect(): Transport disconnected and cleared');
    } else {
      console.log('[CONNECTION MANAGER] disconnect(): No transport to disconnect');
    }
  }

  private setupEventHandlers(): void {
    console.log('[CONNECTION MANAGER] setupEventHandlers(): Setting up event handlers');

    this.transport!.on('close', (data) => {
      console.warn('[CONNECTION MANAGER] setupEventHandlers(): Connection closed:', data);
      // WsTransport handles reconnection internally
    });

    this.transport!.on(MessageTypes.ERROR, (error) => {
      console.error('[CONNECTION MANAGER] setupEventHandlers(): Error received:', error);
      if ((error as Record<string, unknown>).code === 'AUTHENTICATION_REQUIRED') {
        console.log('[CONNECTION MANAGER] setupEventHandlers(): Authentication required, logging out');
        AuthManager.logout();
      }
    });

    console.log('[CONNECTION MANAGER] setupEventHandlers(): Event handlers setup complete');
  }
}
