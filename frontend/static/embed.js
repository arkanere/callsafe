(function() {
  "use strict";
  const HEARTBEAT_INTERVAL_MS = 3e4;
  const HEARTBEAT_TIMEOUT_MS = 5e3;
  const BASE_RECONNECT_DELAY_MS = 1e3;
  const MAX_RECONNECT_ATTEMPTS = 5;
  class WsTransport {
    constructor(url) {
      this.url = url;
    }
    ws = null;
    handlers = /* @__PURE__ */ new Map();
    reconnectAttempts = 0;
    heartbeatTimer = null;
    pongTimer = null;
    intentionallyClosed = false;
    connect() {
      return new Promise((resolve, reject) => {
        this.intentionallyClosed = false;
        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.dispatch("open", {});
          resolve();
        };
        this.ws.onclose = (event) => {
          this.stopHeartbeat();
          this.dispatch("close", { code: event.code, reason: event.reason });
          if (!this.intentionallyClosed) {
            this.scheduleReconnect();
          }
          if (this.reconnectAttempts === 0) {
            reject(new Error(`WebSocket closed before open: ${event.reason || event.code}`));
          }
        };
        this.ws.onmessage = (event) => this.onMessage(event);
        this.ws.onerror = (event) => {
          console.error("[WS] error", event);
        };
      });
    }
    emit(type, data = {}) {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        console.warn("[WS] emit dropped — not connected:", type);
        return;
      }
      this.ws.send(JSON.stringify({ type, ...data }));
    }
    on(type, handler) {
      if (!this.handlers.has(type)) {
        this.handlers.set(type, /* @__PURE__ */ new Set());
      }
      this.handlers.get(type).add(handler);
    }
    off(type, handler) {
      this.handlers.get(type)?.delete(handler);
    }
    disconnect() {
      this.intentionallyClosed = true;
      this.stopHeartbeat();
      this.ws?.close();
      this.ws = null;
    }
    get readyState() {
      return this.ws?.readyState ?? WebSocket.CLOSED;
    }
    onMessage(event) {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        console.error("[WS] unparseable message:", event.data);
        return;
      }
      const { type, ...data } = msg;
      if (typeof type !== "string") {
        console.error("[WS] message missing type field:", msg);
        return;
      }
      if (type === "pong") {
        this.onPong();
        return;
      }
      this.dispatch(type, data);
    }
    dispatch(type, data) {
      const handlers = this.handlers.get(type);
      if (handlers) {
        for (const handler of handlers) {
          handler(data);
        }
      }
    }
    startHeartbeat() {
      this.heartbeatTimer = setInterval(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: "ping" }));
        this.pongTimer = setTimeout(() => {
          console.warn("[WS] heartbeat timeout — closing stale connection");
          this.ws?.close();
        }, HEARTBEAT_TIMEOUT_MS);
      }, HEARTBEAT_INTERVAL_MS);
    }
    stopHeartbeat() {
      if (this.heartbeatTimer !== null) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      if (this.pongTimer !== null) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
    }
    onPong() {
      if (this.pongTimer !== null) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
    }
    scheduleReconnect() {
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error("[WS] max reconnect attempts reached");
        return;
      }
      const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
      this.reconnectAttempts++;
      console.log(`[WS] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(() => {
        this.connect().catch((err) => {
          console.error("[WS] reconnect failed:", err);
        });
      }, delay);
    }
  }
  const CallLifecycleMessages = {
    // Client to Server
    CALL_INITIATE: "call:initiate",
    // Customer initiates a call
    CALL_ACCEPT: "call:accept",
    // Agent accepts incoming call
    CALL_REJECT: "call:reject",
    // Agent rejects incoming call
    CALL_END: "call:end",
    // Either party ends active call
    CALL_FAILED: "call:failed",
    // Report call failure
    // Server to Client
    CALL_INCOMING: "call:incoming",
    // Notify agent of incoming call
    CALL_ACCEPTED: "call:accepted",
    // Confirm call was accepted
    CALL_CANCELLED: "call:cancelled",
    // Call was cancelled
    CALL_ENDED: "call:ended",
    // Call has ended
    CALL_BUSY: "call:busy",
    // All agents busy
    CALL_UNAVAILABLE: "call:unavailable",
    // No agents available
    CALL_TIMEOUT: "call:timeout"
    // Call timed out
  };
  const WebRTCMessages = {
    WEBRTC_OFFER: "webrtc:offer",
    // SDP offer
    WEBRTC_ANSWER: "webrtc:answer",
    // SDP answer
    WEBRTC_ICE_CANDIDATE: "webrtc:ice-candidate"
    // ICE candidate
  };
  const DeviceMessages = {
    // Client to Server
    DEVICE_CONNECT: "device:connect",
    // Register device
    DEVICE_DISCONNECT: "device:disconnect",
    // Unregister device
    DEVICE_STATUS: "device:status",
    // Update availability status
    // Server to Client
    DEVICE_CONNECTED: "device:connected",
    // Device registration confirmed
    DEVICE_DISCONNECTED: "device:disconnected",
    // Device logout confirmed
    DEVICE_STATUS_UPDATED: "device:status-updated"
    // Status change confirmed
  };
  const MediaMessages = {
    MEDIA_TOGGLE: "media:toggle",
    // Toggle camera/microphone
    CALL_ESCALATE: "call:escalate",
    // Request voice-to-video escalation
    CALL_DOWNGRADE: "call:downgrade",
    // Request video-to-voice downgrade
    ESCALATION_ACCEPTED: "escalation:accepted",
    // Peer accepted escalation
    ESCALATION_REJECTED: "escalation:rejected"
    // Peer rejected escalation
  };
  const SystemMessages = {
    OPEN: "open",
    // WebSocket connection established
    CLOSE: "close",
    // WebSocket connection closed
    ERROR: "error",
    // Error notification
    SERVER_SHUTDOWN: "server:shutdown"
    // Server shutting down
  };
  const MessageTypes = {
    ...CallLifecycleMessages,
    ...WebRTCMessages,
    ...DeviceMessages,
    ...MediaMessages,
    ...SystemMessages
  };
  const dbg = () => {
  };
  class WebRTCManager {
    peerConnection = null;
    localStream = null;
    socket;
    callType = "voice";
    _isOfferer = false;
    _disconnectTimer = null;
    _iceRestartAttempted = false;
    turnCredentials = null;
    onAutoplayBlocked = null;
    // Called when remote stream arrives and media connection is established
    onConnected = null;
    // Called when ICE permanently fails (after restart attempt)
    onConnectionFailed = null;
    // Override remote stream handling — receives (stream, callType). If null, uses default DOM queries.
    onRemoteStream = null;
    constructor(socket) {
      this.socket = socket;
    }
    setTurnCredentials(creds) {
      this.turnCredentials = creds;
    }
    getIceServers() {
      const iceServers = [];
      const stunServer1 = "stun:stun.l.google.com:19302";
      const stunServer2 = "stun:stun1.l.google.com:19302";
      iceServers.push({ urls: stunServer1 });
      iceServers.push({ urls: stunServer2 });
      if (this.turnCredentials) {
        iceServers.push({
          urls: this.turnCredentials.urls,
          username: this.turnCredentials.username,
          credential: this.turnCredentials.credential
        });
      }
      return iceServers;
    }
    // localStream is optional: if provided, use it directly (embed pattern where media is
    // captured before WebRTC init); if omitted, capture internally (SvelteKit pattern).
    async initialize(callAttemptId, callType = "voice", localStream) {
      this.callType = callType;
      if (localStream) {
        this.localStream = localStream;
      } else {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: callType === "video"
        });
      }
      const iceServers = this.getIceServers();
      this.peerConnection = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: "all",
        // Allow both STUN and TURN, with STUN preferred
        iceCandidatePoolSize: 10
        // Pre-gather ICE candidates for faster connection
      });
      this.localStream.getTracks().forEach((track) => {
        dbg("[WEBRTC MANAGER] initialize(): Adding track:", track.kind);
        this.peerConnection.addTrack(track, this.localStream);
      });
      this.peerConnection.ontrack = (event) => {
        dbg("[WEBRTC MANAGER] initialize(): Remote track received:", event.track.kind);
        const remoteStream = event.streams[0];
        if (this.onRemoteStream) {
          this.onRemoteStream(remoteStream, this.callType);
        } else if (this.callType === "video") {
          this.playRemoteVideo(remoteStream);
        } else {
          this.playRemoteAudio(remoteStream);
        }
        this.onConnected?.();
      };
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit(MessageTypes.WEBRTC_ICE_CANDIDATE, {
            callAttemptId,
            candidate: event.candidate,
            timestamp: Date.now()
          });
        }
      };
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection.iceConnectionState;
        if (state === "connected" || state === "completed") {
          if (this._disconnectTimer !== null) {
            clearTimeout(this._disconnectTimer);
            this._disconnectTimer = null;
          }
          this._iceRestartAttempted = false;
        } else if (state === "disconnected") {
          if (this._disconnectTimer === null) {
            this._disconnectTimer = setTimeout(() => {
              this._disconnectTimer = null;
              if (this.peerConnection?.iceConnectionState === "disconnected") {
                this._triggerIceRestart(callAttemptId).catch(() => {
                  this.handleConnectionFailure(callAttemptId);
                });
              }
            }, 4e3);
          }
        } else if (state === "failed") {
          if (this._disconnectTimer !== null) {
            clearTimeout(this._disconnectTimer);
            this._disconnectTimer = null;
          }
          if (!this._iceRestartAttempted) {
            this._triggerIceRestart(callAttemptId).catch(() => {
              this.handleConnectionFailure(callAttemptId);
            });
          } else {
            console.error("[WEBRTC MANAGER] initialize(): ICE restart failed, giving up");
            this.handleConnectionFailure(callAttemptId);
          }
        }
      };
    }
    async createAnswer(offer, callAttemptId) {
      this._isOfferer = false;
      if (!this.peerConnection) {
        console.error("[WEBRTC MANAGER] createAnswer(): Peer connection not initialized");
        throw new Error("Peer connection not initialized");
      }
      await this.peerConnection.setRemoteDescription(offer);
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.socket.emit(MessageTypes.WEBRTC_ANSWER, {
        callAttemptId,
        answer,
        timestamp: Date.now()
      });
    }
    async createOffer(callAttemptId) {
      this._isOfferer = true;
      if (!this.peerConnection) {
        console.error("[WEBRTC MANAGER] createOffer(): Peer connection not initialized");
        throw new Error("Peer connection not initialized");
      }
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.socket.emit(MessageTypes.WEBRTC_OFFER, {
        callAttemptId,
        offer,
        timestamp: Date.now()
      });
      return offer;
    }
    async setRemoteDescription(answer) {
      if (!this.peerConnection) {
        console.error("[WEBRTC MANAGER] setRemoteDescription(): Peer connection not initialized");
        throw new Error("Peer connection not initialized");
      }
      await this.peerConnection.setRemoteDescription(answer);
    }
    async addIceCandidate(candidate) {
      if (!this.peerConnection) {
        console.error("[WEBRTC MANAGER] addIceCandidate(): Peer connection not initialized");
        throw new Error("Peer connection not initialized");
      }
      await this.peerConnection.addIceCandidate(candidate);
    }
    toggleCamera() {
      if (!this.localStream) {
        return false;
      }
      const videoTracks = this.localStream.getVideoTracks();
      dbg("[WEBRTC MANAGER] toggleCamera(): Found", videoTracks.length);
      videoTracks.forEach((track) => {
        const wasEnabled = track.enabled;
        track.enabled = !track.enabled;
        dbg("[WEBRTC MANAGER] toggleCamera(): Track toggled from", wasEnabled, "to", track.enabled);
      });
      const isDisabled = !videoTracks[0]?.enabled;
      return isDisabled;
    }
    toggleMute() {
      if (!this.localStream) {
        return false;
      }
      const audioTracks = this.localStream.getAudioTracks();
      dbg("[WEBRTC MANAGER] toggleMute(): Found", audioTracks.length);
      audioTracks.forEach((track) => {
        const wasEnabled = track.enabled;
        track.enabled = !track.enabled;
        dbg("[WEBRTC MANAGER] toggleMute(): Track mute toggled from", wasEnabled, "to", track.enabled);
      });
      const isMuted = !audioTracks[0]?.enabled;
      return isMuted;
    }
    playRemoteAudio(remoteStream) {
      const audioElement = document.querySelector("audio[autoplay]");
      if (audioElement) {
        audioElement.srcObject = remoteStream;
        audioElement.play().then(() => {
        }).catch((error) => {
          console.error("[WEBRTC MANAGER] playRemoteAudio(): Failed to start remote audio playback:", error);
          this.onAutoplayBlocked?.();
        });
      } else {
        console.error("[WEBRTC MANAGER] playRemoteAudio(): No audio element found for remote stream playback");
      }
    }
    playRemoteVideo(remoteStream) {
      const videoElement = document.querySelector("video[data-remote]");
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        videoElement.play().then(() => {
        }).catch((error) => {
          console.error("[WEBRTC MANAGER] playRemoteVideo(): Failed to start remote video playback:", error);
          this.onAutoplayBlocked?.();
        });
      } else {
        console.error("[WEBRTC MANAGER] playRemoteVideo(): No video[data-remote] element found for remote stream playback");
      }
    }
    async _triggerIceRestart(callAttemptId) {
      if (!this.peerConnection || this._iceRestartAttempted) return;
      this._iceRestartAttempted = true;
      if (this._isOfferer) {
        this.peerConnection.restartIce();
        await this.createOffer(callAttemptId);
      } else {
        console.error("[WEBRTC MANAGER] _triggerIceRestart(): Callee cannot restart ICE — signaling failure");
        this.handleConnectionFailure(callAttemptId);
      }
    }
    handleConnectionFailure(callAttemptId) {
      console.error("[WEBRTC MANAGER] handleConnectionFailure(): WebRTC connection failed for call:", callAttemptId);
      this.socket.emit(MessageTypes.CALL_FAILED, {
        callAttemptId,
        reason: "connection_failed",
        timestamp: Date.now()
      });
      this.onConnectionFailed?.();
      this.cleanup();
    }
    resumePlayback() {
      const audioEl = document.querySelector("audio[autoplay], audio[data-callsafe-remote]");
      if (audioEl?.srcObject) {
        audioEl.play().catch((e) => console.error("[WEBRTC MANAGER] resumePlayback(): audio play failed:", e));
      }
      const videoEl = document.querySelector("video[data-remote], video[data-callsafe-remote]");
      if (videoEl?.srcObject) {
        videoEl.play().catch((e) => console.error("[WEBRTC MANAGER] resumePlayback(): video play failed:", e));
      }
    }
    cleanup() {
      if (this._disconnectTimer !== null) {
        clearTimeout(this._disconnectTimer);
        this._disconnectTimer = null;
      }
      this._iceRestartAttempted = false;
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          dbg("[WEBRTC MANAGER] cleanup(): Stopping track:", track.kind);
          track.stop();
        });
        this.localStream = null;
      }
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
    }
    getLocalStream() {
      return this.localStream;
    }
    getConnectionState() {
      const state = this.peerConnection?.connectionState || null;
      return state;
    }
  }
  const CONFIG = {
    DEFAULT_SIGNALING_SERVER: "https://tunnel.callsafe.tech",
    CONNECTION_TIMEOUT: 3e4,
    CLEANUP_DELAY: 5e3,
    AUTO_RESET_DELAY: 3e3,
    // Set debug: true to enable verbose logging (off by default in production)
    debug: false
  };
  function debugLog(category, message, data = null) {
    if (!CONFIG.debug) return;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const prefix = `[CallSafe ${timestamp}] [${category.toUpperCase()}]`;
    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
  function sanitizeInput(input) {
    return String(input).replace(/[<>'"&]/g, "").substring(0, 255);
  }
  function validateHandle(handle) {
    return /^[a-f0-9]{16}$/.test(handle);
  }
  function validateCallAttemptId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  }
  function validateSourceId(sourceId) {
    return /^[a-zA-Z0-9-_]{1,50}$/.test(sourceId);
  }
  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  class CallSafeWidget {
    constructor(config, scriptElement) {
      this.version = "5.0.0";
      this.config = config;
      this.scriptElement = scriptElement;
      this.widgetElement = null;
      this.transport = null;
      this.webrtcManager = null;
      this.currentCall = null;
      this.eventListeners = /* @__PURE__ */ new Map();
      this.connectionTimeout = null;
      this.cleanupTimeout = null;
      this.callTimerInterval = null;
      this.isReady = false;
      this.isVisible = true;
      this.isEnabled = true;
      this.isMuted = false;
      this.callType = "voice";
      this.isVideoEnabled = true;
      this.turnCredentials = null;
      this.turnCredentialsFetchPromise = null;
      this.init();
    }
    init() {
      try {
        if (!this.checkBrowserSupport()) {
          this.renderUnsupportedMessage();
          return;
        }
        this.createWidget();
        this.prefetchTurnCredentials();
        this.isReady = true;
        this.emit("ready");
        if (this.config.debug) {
          console.log("CallSafe Widget initialized", this.config);
        }
      } catch (error) {
        console.error("CallSafe: Initialization failed", error);
        this.emit("error", { message: "Initialization failed", error });
      }
    }
    // --------------------------------------------------------------------------
    // TURN Credentials
    // --------------------------------------------------------------------------
    prefetchTurnCredentials() {
      debugLog("turn", "Pre-fetching TURN credentials in background");
      this.turnCredentialsFetchPromise = fetch(`${CONFIG.DEFAULT_SIGNALING_SERVER}/api/turn-credentials`).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      }).then((credentials) => {
        this.turnCredentials = credentials;
        debugLog("turn", "TURN credentials pre-fetched successfully");
        return credentials;
      }).catch((error) => {
        debugLog("turn", "Failed to pre-fetch TURN credentials (will use STUN only)", { error: error.message });
        return null;
      });
    }
    async getTurnCredentials() {
      if (this.turnCredentials) return this.turnCredentials;
      if (this.turnCredentialsFetchPromise) return await this.turnCredentialsFetchPromise;
      this.prefetchTurnCredentials();
      return await this.turnCredentialsFetchPromise;
    }
    // --------------------------------------------------------------------------
    // Widget DOM
    // --------------------------------------------------------------------------
    createWidget() {
      this.widgetElement = document.createElement("div");
      this.widgetElement.className = `callsafe-widget theme-${this.config.theme} position-${this.config.position}`;
      this.widgetElement.setAttribute("data-version", this.version);
      const button = document.createElement("button");
      button.className = `callsafe-button size-${this.config.size}`;
      button.innerHTML = this.getButtonHTML();
      button.onclick = () => this.handleButtonClick();
      button.setAttribute("aria-label", this.config.buttonText);
      this.widgetElement.appendChild(button);
      const modal = document.createElement("div");
      modal.className = "callsafe-modal";
      modal.style.display = "none";
      modal.innerHTML = this.getModalHTML();
      this.widgetElement.appendChild(modal);
      if (this.config.position === "inline") {
        if (this.scriptElement && this.scriptElement.parentNode) {
          this.scriptElement.parentNode.insertBefore(this.widgetElement, this.scriptElement.nextSibling);
        } else {
          document.body.appendChild(this.widgetElement);
        }
      } else {
        if (document.body) {
          document.body.appendChild(this.widgetElement);
        } else {
          setTimeout(() => document.body && document.body.appendChild(this.widgetElement), 100);
        }
      }
      this.applyStyles();
      this.attachModalEvents();
    }
    getButtonHTML() {
      return `
      <svg class="callsafe-icon" viewBox="0 0 24 24" width="18" height="18">
        <path fill="currentColor" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
      </svg>
      <span class="callsafe-text">${escapeHTML(this.config.buttonText)}</span>
    `;
    }
    getModalHTML() {
      return `
      <div class="callsafe-modal-overlay">
        <div class="callsafe-modal-content">
          <div class="callsafe-modal-header">
            <h3 class="callsafe-modal-title">CallSafe</h3>
            <button class="callsafe-modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="callsafe-modal-body">
            <div class="callsafe-confirmation" id="callsafe-confirmation">
              <div class="callsafe-confirmation-message">Ready to connect on call?</div>
            </div>
            <div class="callsafe-video-area" id="callsafe-video-area" style="display: none;">
              <video data-callsafe-remote autoplay playsinline class="callsafe-video-remote"></video>
              <video data-callsafe-local autoplay playsinline muted class="callsafe-video-local"></video>
            </div>
            <div class="callsafe-call-status" id="callsafe-call-status" style="display: none;">
              <div class="callsafe-status-message" id="callsafe-status">Ready to call</div>
              <div class="callsafe-call-timer" id="callsafe-timer" style="display: none;">00:00</div>
            </div>
          </div>
          <div class="callsafe-modal-footer">
            <div class="callsafe-confirmation-buttons" id="callsafe-confirmation-buttons">
              <button class="callsafe-control-btn cancel-btn" id="callsafe-cancel">Cancel</button>
              <button class="callsafe-control-btn call-voice-btn" id="callsafe-call-voice">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                </svg>
                Voice
              </button>
              <button class="callsafe-control-btn call-video-btn" id="callsafe-call-video">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                </svg>
                Video
              </button>
            </div>
            <div class="callsafe-call-buttons" id="callsafe-call-buttons" style="display: none;">
              <button class="callsafe-control-btn mute-btn" id="callsafe-mute" style="display: none;">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path fill="currentColor" d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                Mute
              </button>
              <button class="callsafe-control-btn camera-btn" id="callsafe-camera" style="display: none;">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                </svg>
                Camera
              </button>
              <button class="callsafe-control-btn end-btn" id="callsafe-end">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
                End Call
              </button>
            </div>
            <div class="callsafe-branding" id="callsafe-branding">
              Powered with <a href="https://callsafe.tech" target="_blank" rel="noopener noreferrer" class="callsafe-link">CallSafe</a>
            </div>
          </div>
        </div>
      </div>
    `;
    }
    applyStyles() {
      if (document.getElementById("callsafe-styles")) return;
      const styleSheet = document.createElement("style");
      styleSheet.id = "callsafe-styles";
      styleSheet.textContent = this.getWidgetCSS();
      document.head.appendChild(styleSheet);
    }
    getWidgetCSS() {
      return `
      .callsafe-widget {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        z-index: 999999;
        position: relative;
      }
      .callsafe-widget.position-inline { display: inline-block; }
      .callsafe-widget.position-bottom-right { position: fixed; bottom: 20px; right: 20px; }
      .callsafe-widget.position-bottom-left { position: fixed; bottom: 20px; left: 20px; }
      .callsafe-widget.position-top-right { position: fixed; top: 20px; right: 20px; }
      .callsafe-widget.position-top-left { position: fixed; top: 20px; left: 20px; }

      .callsafe-button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 50px;
        padding: 14px 24px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        outline: none;
        display: flex;
        align-items: center;
        gap: 8px;
        text-decoration: none;
        user-select: none;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      }
      .callsafe-button:focus { box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3); }
      .callsafe-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5); }
      .callsafe-button:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
      .callsafe-button.size-small { padding: 8px 16px; font-size: 12px; }
      .callsafe-button.size-large { padding: 16px 28px; font-size: 16px; }
      .callsafe-icon { flex-shrink: 0; }
      .callsafe-text { white-space: nowrap; }

      .callsafe-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000000; font-family: inherit; }
      .callsafe-modal-overlay {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        display: flex; align-items: center; justify-content: center; padding: 20px;
      }
      .callsafe-modal-content {
        background: white;
        border-radius: 16px;
        max-width: 420px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
      }
      .callsafe-modal-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 20px 24px 16px;
        border-bottom: 1px solid #f0f0f0;
      }
      .callsafe-modal-title { margin: 0; font-size: 18px; font-weight: 700; color: #1a1a2e; }
      .callsafe-modal-close {
        background: none; border: none; font-size: 24px; cursor: pointer;
        color: #666; line-height: 1; padding: 0; width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center; border-radius: 50%;
        transition: background 0.2s;
      }
      .callsafe-modal-close:hover { background: #f0f0f0; }
      .callsafe-modal-body { padding: 24px; }
      .callsafe-modal-footer { padding: 16px 24px 24px; border-top: 1px solid #f0f0f0; }

      .callsafe-confirmation-message { font-size: 16px; color: #333; text-align: center; margin-bottom: 8px; }

      .callsafe-confirmation-buttons {
        display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px;
      }
      .callsafe-call-buttons {
        display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px;
      }
      .callsafe-control-btn {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 20px; border-radius: 8px; border: none;
        font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
      }
      .callsafe-control-btn.call-voice-btn { background: #667eea; color: white; }
      .callsafe-control-btn.call-voice-btn:hover { background: #5a6fd8; }
      .callsafe-control-btn.call-video-btn { background: #764ba2; color: white; }
      .callsafe-control-btn.call-video-btn:hover { background: #6a4292; }
      .callsafe-control-btn.cancel-btn { background: #f0f0f0; color: #333; }
      .callsafe-control-btn.cancel-btn:hover { background: #e0e0e0; }
      .callsafe-control-btn.end-btn { background: #ef4444; color: white; }
      .callsafe-control-btn.end-btn:hover { background: #dc2626; }
      .callsafe-control-btn.mute-btn { background: #f0f0f0; color: #333; }
      .callsafe-control-btn.mute-btn.muted { background: #667eea; color: white; }
      .callsafe-control-btn.camera-btn { background: #f0f0f0; color: #333; }
      .callsafe-control-btn.camera-btn.camera-off { background: #ef4444; color: white; }

      .callsafe-call-status { text-align: center; }
      .callsafe-status-message { font-size: 16px; color: #333; margin-bottom: 8px; }
      .callsafe-call-timer { font-size: 24px; font-weight: 700; color: #667eea; font-variant-numeric: tabular-nums; }

      .callsafe-branding { text-align: center; font-size: 12px; color: #999; }
      .callsafe-link { color: #667eea; text-decoration: none; }
      .callsafe-link:hover { text-decoration: underline; }

      .callsafe-video-area { position: relative; width: 100%; aspect-ratio: 4/3; background: #1a1a2e; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
      .callsafe-video-remote { width: 100%; height: 100%; object-fit: cover; }
      .callsafe-video-local { position: absolute; bottom: 8px; right: 8px; width: 25%; aspect-ratio: 4/3; object-fit: cover; border-radius: 4px; border: 2px solid white; }

      @media (max-width: 480px) {
        .callsafe-modal-content { border-radius: 12px; }
        .callsafe-modal-body { padding: 16px; }
        .callsafe-modal-footer { padding: 12px 16px 16px; }
        .callsafe-control-btn { padding: 8px 14px; font-size: 13px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .callsafe-button { transition: none; }
        .callsafe-control-btn { transition: none; }
      }
    `;
    }
    attachModalEvents() {
      const modal = this.widgetElement.querySelector(".callsafe-modal");
      const closeBtn = modal.querySelector(".callsafe-modal-close");
      const callVoiceBtn = modal.querySelector("#callsafe-call-voice");
      const callVideoBtn = modal.querySelector("#callsafe-call-video");
      const cancelBtn = modal.querySelector("#callsafe-cancel");
      const muteBtn = modal.querySelector("#callsafe-mute");
      const cameraBtn = modal.querySelector("#callsafe-camera");
      const endBtn = modal.querySelector("#callsafe-end");
      closeBtn.onclick = () => this.hideModal();
      callVoiceBtn.onclick = () => this.handleCallNow("voice");
      callVideoBtn.onclick = () => this.handleCallNow("video");
      cancelBtn.onclick = () => this.hideModal();
      muteBtn.onclick = () => this.toggleMute();
      cameraBtn.onclick = () => this.toggleCamera();
      endBtn.onclick = () => this.endCall();
      modal.querySelector(".callsafe-modal-overlay").onclick = (e) => {
        if (e.target === e.currentTarget) this.hideModal();
      };
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display !== "none") this.hideModal();
      });
    }
    // --------------------------------------------------------------------------
    // Call Flow
    // --------------------------------------------------------------------------
    async handleButtonClick() {
      if (this.currentCall) {
        this.showModal();
      } else {
        this.showConfirmationModal();
      }
    }
    showConfirmationModal() {
      const confirmationUI = this.widgetElement.querySelector("#callsafe-confirmation");
      const callStatusUI = this.widgetElement.querySelector("#callsafe-call-status");
      const confirmationButtons = this.widgetElement.querySelector("#callsafe-confirmation-buttons");
      const callButtons = this.widgetElement.querySelector("#callsafe-call-buttons");
      const branding = this.widgetElement.querySelector("#callsafe-branding");
      if (confirmationUI) confirmationUI.style.display = "block";
      if (callStatusUI) callStatusUI.style.display = "none";
      if (confirmationButtons) confirmationButtons.style.display = "flex";
      if (callButtons) callButtons.style.display = "none";
      if (branding) branding.style.display = "block";
      this.showModal();
    }
    async handleCallNow(type = "voice") {
      const confirmationUI = this.widgetElement.querySelector("#callsafe-confirmation");
      const callStatusUI = this.widgetElement.querySelector("#callsafe-call-status");
      const confirmationButtons = this.widgetElement.querySelector("#callsafe-confirmation-buttons");
      const callButtons = this.widgetElement.querySelector("#callsafe-call-buttons");
      if (confirmationUI) confirmationUI.style.display = "none";
      if (callStatusUI) callStatusUI.style.display = "block";
      if (confirmationButtons) confirmationButtons.style.display = "none";
      if (callButtons) callButtons.style.display = "flex";
      await this.initiateCall(type);
    }
    async initiateCall(type = "voice") {
      debugLog("call", "Call initiation started", { isEnabled: this.isEnabled, callType: type });
      if (!this.isEnabled) {
        return { success: false, error: { code: "WIDGET_DISABLED", message: "Widget is disabled" } };
      }
      this.callType = type;
      this.isVideoEnabled = true;
      try {
        const callAttemptId = this.generateCallId();
        if (!validateCallAttemptId(callAttemptId)) throw new Error("Invalid call attempt ID generated");
        const mediaConstraints = {
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: type === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };
        debugLog("call", "Requesting media and TURN credentials in parallel");
        const [localStream, turnCredentials] = await Promise.all([
          navigator.mediaDevices.getUserMedia(mediaConstraints),
          this.getTurnCredentials()
        ]);
        if (type === "video") {
          const localVideoEl = this.widgetElement.querySelector("video[data-callsafe-local]");
          if (localVideoEl) {
            localVideoEl.srcObject = localStream;
            localVideoEl.play().catch(() => {
            });
          }
          const videoArea = this.widgetElement.querySelector("#callsafe-video-area");
          if (videoArea) videoArea.style.display = "block";
        }
        this.currentCall = { id: callAttemptId, startTime: Date.now(), state: "connecting", duration: 0 };
        this.updateButtonState("connecting", "Connecting...");
        this.showModal();
        this.updateStatusMessage("Finding agent... (takes ~10 seconds)");
        const wsUrl = this.getWebSocketUrl();
        debugLog("call", "Connecting to signaling server", { url: wsUrl });
        this.transport = new WsTransport(wsUrl);
        this.setupEventHandlers();
        await this.transport.connect();
        this.webrtcManager = new WebRTCManager(this.transport);
        this.webrtcManager.onAutoplayBlocked = () => this.showAutoplayPrompt();
        this.webrtcManager.onConnected = () => this.handleCallConnected();
        this.webrtcManager.onConnectionFailed = () => this.setFailsafeCleanup();
        this.webrtcManager.onRemoteStream = (stream, callType) => this.handleRemoteStream(stream, callType);
        if (turnCredentials) this.webrtcManager.setTurnCredentials(turnCredentials);
        await this.webrtcManager.initialize(callAttemptId, type, localStream);
        const initiateData = {
          callAttemptId: sanitizeInput(callAttemptId),
          handle: sanitizeInput(this.config.handle),
          sourceId: sanitizeInput(this.config.sourceId),
          callType: type,
          mediaCapabilities: {
            canSend: type === "video" ? ["audio", "video"] : ["audio"],
            canReceive: type === "video" ? ["audio", "video"] : ["audio"]
          },
          timestamp: Date.now()
        };
        debugLog("call", "Sending call:initiate", initiateData);
        this.transport.emit("call:initiate", initiateData);
        this.emit("call:initiated", { callAttemptId, callType: type });
        return { success: true, callAttemptId };
      } catch (error) {
        debugLog("call", "Call initiation failed", { error: error.message });
        let errorMessage;
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          errorMessage = type === "video" ? "Please allow camera and microphone access for video calls." : "Please allow microphone access to make calls.";
        } else {
          errorMessage = "Failed to start call. Please try again.";
        }
        this.handleCallError(errorMessage);
        return { success: false, error: { code: "CALL_INITIATION_FAILED", message: error.message } };
      }
    }
    // Remote stream handler for embed — manages its own DOM elements
    handleRemoteStream(stream, callType) {
      if (callType === "video") {
        const videoEl = this.widgetElement.querySelector("video[data-callsafe-remote]");
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch((error) => {
            console.warn("CallSafe: Failed to autoplay remote video", error);
            this.showAutoplayPrompt();
          });
        }
      } else {
        document.querySelectorAll("audio[data-callsafe-remote]").forEach((el) => el.remove());
        const audio = document.createElement("audio");
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.hidden = true;
        audio.setAttribute("data-callsafe-remote", "true");
        document.body.appendChild(audio);
        audio.play().catch((error) => {
          console.warn("CallSafe: Failed to autoplay remote audio", error);
          this.showAutoplayPrompt();
        });
      }
    }
    // --------------------------------------------------------------------------
    // WebSocket Event Handlers
    // --------------------------------------------------------------------------
    setupEventHandlers() {
      debugLog("socket", "Setting up WebSocket event handlers");
      this.transport.on("call:accepted", async (data) => {
        debugLog("socket-event", "call:accepted received", { callAttemptId: data.callAttemptId });
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleCallAccepted(data);
        }
      });
      this.transport.on("webrtc:answer", async (data) => {
        debugLog("socket-event", "webrtc:answer received");
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleWebRTCAnswer(data.answer);
        }
      });
      this.transport.on("webrtc:ice-candidate", async (data) => {
        debugLog("socket-event", "webrtc:ice-candidate received");
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleICECandidate(data.candidate);
        }
      });
      this.transport.on("call:busy", (data) => {
        debugLog("socket-event", "call:busy received");
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure("All agents are busy. Please try again later.");
        }
      });
      this.transport.on("call:unavailable", (data) => {
        debugLog("socket-event", "call:unavailable received");
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure(this.config.offlineMessage);
        }
      });
      this.transport.on("call:timeout", (data) => {
        debugLog("socket-event", "call:timeout received");
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure("No response from agents. Please try again.");
        }
      });
      this.transport.on("call:failed", (data) => {
        debugLog("socket-event", "call:failed received", { reason: data.reason });
        if (data.callAttemptId === this.currentCall?.id) {
          const message = data?.reason === "connection_timeout" ? "Connection timeout. Please try again." : "Connection failed. Please try again.";
          this.handleCallFailure(message);
        }
      });
      this.transport.on("call:ended", (data) => {
        debugLog("socket-event", "call:ended received");
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallEnded();
        }
      });
      debugLog("socket", "WebSocket event handlers setup complete");
    }
    // --------------------------------------------------------------------------
    // Signaling Server URL
    // --------------------------------------------------------------------------
    getSignalingServerUrl() {
      if (typeof window !== "undefined" && window.VITE_SIGNALING_SERVER_URL) {
        return window.VITE_SIGNALING_SERVER_URL;
      }
      const serverUrl = this.scriptElement?.getAttribute("data-server-url");
      if (serverUrl) return serverUrl;
      return CONFIG.DEFAULT_SIGNALING_SERVER;
    }
    getWebSocketUrl() {
      const httpUrl = this.getSignalingServerUrl();
      return httpUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://") + "/ws";
    }
    // --------------------------------------------------------------------------
    // Call Event Handlers
    // --------------------------------------------------------------------------
    async handleCallAccepted(data) {
      try {
        debugLog("call", "Call accepted by business", { callAttemptId: data.callAttemptId });
        this.updateStatusMessage("Agent accepted, connecting...");
        this.currentCall.state = "ringing";
        if (this.webrtcManager) {
          debugLog("webrtc", "Creating WebRTC offer for accepted call");
          await this.webrtcManager.createOffer(data.callAttemptId);
        }
        this.emit("call:connecting");
      } catch (error) {
        debugLog("call", "Failed to handle call acceptance", { error: error.message });
        this.handleConnectionFailure();
      }
    }
    async handleWebRTCAnswer(answer) {
      try {
        if (this.webrtcManager) {
          await this.webrtcManager.setRemoteDescription(answer);
        }
      } catch (error) {
        console.error("CallSafe: Failed to process WebRTC answer", error);
        this.handleConnectionFailure();
      }
    }
    async handleICECandidate(candidate) {
      try {
        if (this.webrtcManager) {
          await this.webrtcManager.addIceCandidate(candidate);
        }
      } catch (error) {
        console.error("CallSafe: Failed to add ICE candidate", error);
      }
    }
    handleCallConnected() {
      debugLog("call", "Call fully connected", { callAttemptId: this.currentCall?.id });
      this.currentCall.state = "connected";
      this.updateStatusMessage("Connected to agent");
      this.updateButtonState("connected", "In Call");
      this.showCallControls();
      this.startCallTimer();
      this.clearConnectionTimeout();
      this.emit("call:connected");
    }
    // Widget-level failure path: notify server and set failsafe.
    // ICE failures are also handled internally by WebRTCManager; onConnectionFailed
    // triggers setFailsafeCleanup() independently.
    handleConnectionFailure() {
      console.error("CallSafe: Connection failed");
      if (this.transport && this.currentCall) {
        this.transport.emit("call:failed", {
          callAttemptId: this.currentCall.id,
          reason: "connection_failed",
          timestamp: Date.now()
        });
      }
      this.setFailsafeCleanup();
    }
    handleCallFailure(message) {
      if (this.currentCall) this.currentCall.state = "failed";
      this.updateStatusMessage(message);
      this.emit("call:failed", { reason: "general" });
      setTimeout(() => this.cleanup(), CONFIG.AUTO_RESET_DELAY);
    }
    handleCallEnded() {
      debugLog("call", "Call ended by server", { callAttemptId: this.currentCall?.id });
      if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = null;
      }
      this.updateStatusMessage("Call ended");
      this.emit("call:ended");
      setTimeout(() => this.cleanup(), 2e3);
    }
    handleCallError(message) {
      this.updateStatusMessage(message);
      this.updateButtonState("idle", this.config.buttonText);
      setTimeout(() => this.cleanup(), CONFIG.AUTO_RESET_DELAY);
    }
    setFailsafeCleanup() {
      this.cleanupTimeout = setTimeout(() => {
        if (this.config.debug) console.log("CallSafe: Server didn't respond, forcing cleanup");
        this.cleanup();
      }, CONFIG.CLEANUP_DELAY);
    }
    setConnectionTimeout() {
      this.clearConnectionTimeout();
      this.connectionTimeout = setTimeout(() => {
        if (this.currentCall && this.currentCall.state !== "connected") {
          console.error("CallSafe: Connection timeout after 30 seconds");
          this.handleConnectionFailure();
        }
      }, CONFIG.CONNECTION_TIMEOUT);
    }
    clearConnectionTimeout() {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
    }
    // --------------------------------------------------------------------------
    // Call Controls
    // --------------------------------------------------------------------------
    showCallControls() {
      const muteBtn = this.widgetElement.querySelector("#callsafe-mute");
      const cameraBtn = this.widgetElement.querySelector("#callsafe-camera");
      const timer = this.widgetElement.querySelector("#callsafe-timer");
      if (muteBtn) muteBtn.style.display = "flex";
      if (cameraBtn && this.callType === "video") cameraBtn.style.display = "flex";
      if (timer) timer.style.display = "block";
    }
    hideCallControls() {
      const muteBtn = this.widgetElement.querySelector("#callsafe-mute");
      const cameraBtn = this.widgetElement.querySelector("#callsafe-camera");
      const timer = this.widgetElement.querySelector("#callsafe-timer");
      if (muteBtn) {
        muteBtn.style.display = "none";
        muteBtn.classList.remove("muted");
      }
      if (cameraBtn) {
        cameraBtn.style.display = "none";
        cameraBtn.classList.remove("camera-off");
      }
      if (timer) {
        timer.style.display = "none";
        timer.textContent = "00:00";
      }
    }
    showAutoplayPrompt() {
      const modal = this.widgetElement?.querySelector(".callsafe-modal-content");
      if (!modal || modal.querySelector("#callsafe-autoplay-prompt")) return;
      const prompt = document.createElement("button");
      prompt.id = "callsafe-autoplay-prompt";
      prompt.textContent = "Tap to enable audio";
      prompt.style.cssText = "display:block;width:100%;margin-bottom:8px;padding:10px;background:#f59e0b;color:#fff;font-weight:600;border:none;border-radius:12px;cursor:pointer;font-size:14px;";
      prompt.onclick = () => {
        this.webrtcManager?.resumePlayback();
        prompt.remove();
      };
      const body = modal.querySelector(".callsafe-modal-body");
      if (body) body.prepend(prompt);
    }
    toggleCamera() {
      if (!this.webrtcManager || this.callType !== "video") return;
      const isNowDisabled = this.webrtcManager.toggleCamera();
      this.isVideoEnabled = !isNowDisabled;
      const cameraBtn = this.widgetElement.querySelector("#callsafe-camera");
      if (cameraBtn) {
        cameraBtn.classList.toggle("camera-off", isNowDisabled);
        cameraBtn.innerHTML = isNowDisabled ? `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.4 5.6L5.6 18.4 4.2 17l1.4-1.4c-.1-.2-.1-.4-.1-.6V7c0-1.1.9-2 2-2h9c.4 0 .8.1 1.1.3l1.4-1.4 1.3 1.7zM3.4 6.7l1.4 1.4c-.1.2-.1.4-.1.6v7c0 1.1.9 2 2 2h7c.2 0 .4 0 .6-.1l1.4 1.4L14 20.5l-1.4-1.4c-.2.1-.4.1-.6.1H7c-1.1 0-2-.9-2-2V9c0-.2 0-.4.1-.6L3.7 7l-.3-.3z"/></svg>Camera Off` : `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>Camera`;
      }
      if (this.transport && this.currentCall) {
        this.transport.emit("media:toggle", {
          callAttemptId: this.currentCall.id,
          action: isNowDisabled ? "disable_camera" : "enable_camera",
          success: true,
          timestamp: Date.now()
        });
      }
    }
    toggleMute() {
      if (!this.webrtcManager) return;
      this.isMuted = this.webrtcManager.toggleMute();
      const muteBtn = this.widgetElement.querySelector("#callsafe-mute");
      if (muteBtn) {
        muteBtn.classList.toggle("muted", this.isMuted);
        muteBtn.innerHTML = this.isMuted ? `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>Unmute` : `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path fill="currentColor" d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>Mute`;
      }
    }
    startCallTimer() {
      const timerElement = this.widgetElement.querySelector("#callsafe-timer");
      if (!timerElement) return;
      const startTime = Date.now();
      this.callTimerInterval = setInterval(() => {
        if (this.currentCall && this.currentCall.state === "connected") {
          const elapsed = Math.floor((Date.now() - startTime) / 1e3);
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
          this.currentCall.duration = elapsed;
        }
      }, 1e3);
    }
    stopCallTimer() {
      if (this.callTimerInterval) {
        clearInterval(this.callTimerInterval);
        this.callTimerInterval = null;
      }
    }
    endCall() {
      debugLog("call", "End call requested", { hasCurrentCall: !!this.currentCall });
      if (!this.currentCall) return;
      if (this.transport) {
        this.transport.emit("call:end", {
          callAttemptId: this.currentCall.id,
          initiator: "customer",
          reason: "user_action",
          timestamp: Date.now()
        });
        this.setFailsafeCleanup();
      } else {
        this.cleanup();
      }
    }
    cleanup() {
      debugLog("cleanup", "Starting cleanup process");
      this.clearConnectionTimeout();
      this.stopCallTimer();
      if (this.cleanupTimeout) {
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = null;
      }
      this.widgetElement?.querySelector("#callsafe-autoplay-prompt")?.remove();
      if (this.webrtcManager) {
        this.webrtcManager.cleanup();
        this.webrtcManager = null;
      }
      if (this.transport) {
        this.transport.disconnect();
        this.transport = null;
      }
      this.currentCall = null;
      this.isMuted = false;
      this.callType = "voice";
      this.isVideoEnabled = true;
      const videoArea = this.widgetElement?.querySelector("#callsafe-video-area");
      if (videoArea) {
        videoArea.style.display = "none";
        const localEl = videoArea.querySelector("video[data-callsafe-local]");
        const remoteEl = videoArea.querySelector("video[data-callsafe-remote]");
        if (localEl) localEl.srcObject = null;
        if (remoteEl) remoteEl.srcObject = null;
      }
      document.querySelectorAll("audio[data-callsafe-remote]").forEach((el) => el.remove());
      this.updateButtonState("idle", this.config.buttonText);
      this.hideModal();
      this.hideCallControls();
      debugLog("cleanup", "Cleanup complete");
    }
    // --------------------------------------------------------------------------
    // UI Helpers
    // --------------------------------------------------------------------------
    updateButtonState(state, text) {
      const button = this.widgetElement.querySelector(".callsafe-button");
      if (button) {
        const textElement = button.querySelector(".callsafe-text");
        if (textElement) textElement.textContent = text;
        button.disabled = state === "connecting";
      }
    }
    updateStatusMessage(message) {
      const statusElement = this.widgetElement.querySelector("#callsafe-status");
      if (statusElement) statusElement.textContent = message;
    }
    showModal() {
      const modal = this.widgetElement.querySelector(".callsafe-modal");
      if (modal) {
        modal.style.display = "block";
        this.emit("show");
      }
    }
    hideModal() {
      const modal = this.widgetElement.querySelector(".callsafe-modal");
      if (modal) {
        modal.style.display = "none";
        this.emit("hide");
        if (this.currentCall && this.currentCall.state !== "connected") {
          this.endCall();
        }
      }
    }
    generateCallId() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : r & 3 | 8;
        return v.toString(16);
      });
    }
    checkBrowserSupport() {
      return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.WebSocket && window.Promise);
    }
    renderUnsupportedMessage() {
      const message = document.createElement("div");
      message.style.cssText = `
      background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;
      border-radius: 4px; padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px; margin: 10px 0;
    `;
      message.textContent = "Your browser does not support calling features. Please use a modern browser.";
      if (this.config.position === "inline") {
        if (this.scriptElement && this.scriptElement.parentNode) {
          this.scriptElement.parentNode.insertBefore(message, this.scriptElement.nextSibling);
        } else {
          document.body.appendChild(message);
        }
      } else {
        document.body.appendChild(message);
      }
    }
    // --------------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------------
    show() {
      this.isVisible = true;
      if (this.widgetElement) this.widgetElement.style.display = "";
      this.emit("show");
    }
    hide() {
      this.isVisible = false;
      if (this.widgetElement) this.widgetElement.style.display = "none";
      this.emit("hide");
    }
    enable() {
      this.isEnabled = true;
      const button = this.widgetElement?.querySelector(".callsafe-button");
      if (button && !this.currentCall) button.disabled = false;
    }
    disable() {
      this.isEnabled = false;
      const button = this.widgetElement?.querySelector(".callsafe-button");
      if (button) button.disabled = true;
    }
    getStatus() {
      return {
        isVisible: this.isVisible,
        isEnabled: this.isEnabled,
        currentState: this.currentCall?.state || "idle",
        lastError: null
      };
    }
    isCallActive() {
      return !!(this.currentCall && this.currentCall.state === "connected");
    }
    getCallDuration() {
      return this.currentCall?.duration || 0;
    }
    updateConfig(newConfig) {
      Object.assign(this.config, newConfig);
      if (newConfig.buttonText) {
        this.updateButtonState(this.currentCall?.state || "idle", newConfig.buttonText);
      }
    }
    getConfig() {
      return { ...this.config };
    }
    getVersion() {
      return this.version;
    }
    destroy() {
      if (this.currentCall) this.endCall();
      if (this.transport) this.transport.disconnect();
      if (this.widgetElement && this.widgetElement.parentNode) {
        this.widgetElement.parentNode.removeChild(this.widgetElement);
      }
      const widgets = document.querySelectorAll(".callsafe-widget");
      if (widgets.length === 0) {
        const styles = document.getElementById("callsafe-styles");
        if (styles) styles.parentNode.removeChild(styles);
      }
      this.eventListeners.clear();
    }
    // --------------------------------------------------------------------------
    // Event System
    // --------------------------------------------------------------------------
    on(event, callback) {
      if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
      this.eventListeners.get(event).push(callback);
    }
    off(event, callback) {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
      }
    }
    emit(event, data) {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error("CallSafe: Event listener error", error);
          }
        });
      }
      try {
        const customEvent = new CustomEvent(`callsafe:${event}`, {
          bubbles: true,
          detail: { widget: this, data }
        });
        window.dispatchEvent(customEvent);
      } catch (error) {
        console.error("CallSafe: Failed to dispatch DOM event", error);
      }
    }
  }
  function initializeWidget() {
    const script = document.currentScript || document.querySelector('script[src*="embed"]');
    if (!script) {
      console.error("CallSafe: Unable to locate script element");
      return;
    }
    const config = {
      handle: script.getAttribute("data-handle"),
      sourceId: script.getAttribute("data-source-id") || "website",
      buttonText: script.getAttribute("data-button-text") || "Talk to us instantly",
      position: script.getAttribute("data-position") || "bottom-right",
      theme: script.getAttribute("data-theme") || "light",
      language: script.getAttribute("data-language") || "en",
      size: script.getAttribute("data-size") || "medium",
      offlineMessage: script.getAttribute("data-offline-message") || "No agents available right now.",
      debug: script.getAttribute("data-debug") === "true"
    };
    if (!config.handle) {
      console.error("CallSafe: data-handle attribute is required");
      return;
    }
    if (!validateHandle(config.handle)) {
      console.error("CallSafe: Invalid handle format");
      return;
    }
    if (!validateSourceId(config.sourceId)) {
      console.error("CallSafe: Invalid source ID format");
      return;
    }
    if (config.debug) CONFIG.debug = true;
    const widget = new CallSafeWidget(config, script);
    if (config.debug) window.CallSafeWidget = widget;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWidget);
  } else {
    initializeWidget();
  }
})();
