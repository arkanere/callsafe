type Handler = (data: Record<string, unknown>) => void;

const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const BASE_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_ATTEMPTS = 5;

export class WsTransport {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<Handler>> = new Map();
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private hasOpenedBefore = false;
  private readonly autoReconnect: boolean;

  constructor(
    private readonly url: string,
    options: { autoReconnect?: boolean } = {}
  ) {
    this.autoReconnect = options.autoReconnect ?? true;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.intentionallyClosed = false;
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.dispatch('open', { reconnected: this.hasOpenedBefore });
        this.hasOpenedBefore = true;
        resolve();
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.dispatch('close', { code: event.code, reason: event.reason });
        if (!this.intentionallyClosed && this.autoReconnect) {
          this.scheduleReconnect();
        }
        // Reject only on first connect failure (reconnectAttempts is still 0)
        if (this.reconnectAttempts === 0) {
          reject(new Error(`WebSocket closed before open: ${event.reason || event.code}`));
        }
      };

      this.ws.onmessage = (event) => this.onMessage(event);

      this.ws.onerror = (event) => {
        console.error('[WS] error', event);
      };
    });
  }

  emit(type: string, data: Record<string, unknown> = {}): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[WS] emit dropped — not connected:', type);
      return;
    }
    this.ws.send(JSON.stringify({ type, ...data }));
  }

  on(type: string, handler: Handler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  off(type: string, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }

  /**
   * Wait for the next message of `type`. Rejects on the first protocol
   * `error` frame or after `timeoutMs`. Used for the device:connect handshake.
   */
  waitFor(type: string, timeoutMs = 10_000): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const settle = () => {
        clearTimeout(timer);
        this.off(type, onMatch);
        this.off('error', onError);
      };
      const onMatch: Handler = (data) => {
        settle();
        resolve(data);
      };
      const onError: Handler = (data) => {
        settle();
        reject(new Error(`Server error while waiting for ${type}: ${data.code ?? 'unknown'}`));
      };
      const timer = setTimeout(() => {
        settle();
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);
      this.on(type, onMatch);
      this.on('error', onError);
    });
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  private onMessage(event: MessageEvent): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data as string) as Record<string, unknown>;
    } catch {
      console.error('[WS] unparseable message:', event.data);
      return;
    }

    const { type, ...data } = msg;

    if (typeof type !== 'string') {
      console.error('[WS] message missing type field:', msg);
      return;
    }

    if (type === 'pong') {
      this.onPong();
      return;
    }

    this.dispatch(type, data);
  }

  private dispatch(type: string, data: Record<string, unknown>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: 'ping' }));
      this.pongTimer = setTimeout(() => {
        console.warn('[WS] heartbeat timeout — closing stale connection');
        this.ws?.close();
      }, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private onPong(): void {
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WS] max reconnect attempts reached');
      return;
    }
    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    console.log(`[WS] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(() => {
      this.connect().catch((err) => {
        console.error('[WS] reconnect failed:', err);
      });
    }, delay);
  }
}
