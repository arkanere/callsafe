import { WsTransport } from '$lib/transport/ws-transport';
import { MessageTypes } from '@callsafe/protocol';
import { AuthManager } from './auth-manager';

export class ConnectionManager {
  private transport: WsTransport | null = null;

  async connect(): Promise<WsTransport> {
    console.log('[CONNECTION MANAGER] connect(): Initiating connection');

    const serverUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'https://signal.callsafe.tech';
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
      const code = (error as Record<string, unknown>).code;
      // Only genuine credential failures warrant a logout; not_authenticated
      // is a transient ordering condition (message sent before device:connect).
      if (code === 'auth_failed' || code === 'token_expired') {
        console.log('[CONNECTION MANAGER] setupEventHandlers(): Auth failure, logging out');
        AuthManager.logout();
      }
    });

    console.log('[CONNECTION MANAGER] setupEventHandlers(): Event handlers setup complete');
  }
}
