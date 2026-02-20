(function() {
  'use strict';
  
  // Configuration constants
  const CONFIG = {
    DEFAULT_SIGNALING_SERVER: 'https://tunnel.callsafe.tech',
    CONNECTION_TIMEOUT: 30000,
    CLEANUP_DELAY: 5000,
    AUTO_RESET_DELAY: 3000,
    CONNECTION_CHECK_INTERVAL: 1000,

    // WebSocket transport
    WS_RECONNECT_BASE_MS: 1000,
    WS_RECONNECT_MAX_ATTEMPTS: 5,
    WS_HEARTBEAT_INTERVAL_MS: 30000,
    WS_HEARTBEAT_TIMEOUT_MS: 5000,

    // WebRTC ICE Servers
    STUN_SERVER_1: 'stun:stun.l.google.com:19302',
    STUN_SERVER_2: 'stun:stun1.l.google.com:19302'
    // TURN credentials removed - fetched dynamically from server
  };

  // Debug logging utility - ALWAYS logs in production for debugging call issues
  function debugLog(category, message, data = null) {
    // Check if debugging is disabled via window flag (for future control)
    if (window.CALLSAFE_DISABLE_DEBUG === true) {
      return;
    }
    
    const timestamp = new Date().toISOString();
    const logPrefix = `[CallSafe Debug ${timestamp}] [${category.toUpperCase()}]`;
    
    // Always log in production to help debug call connection issues
    // Critical categories that should ALWAYS log even if debugging is limited
    const criticalCategories = ['socket', 'call', 'cleanup', 'modal'];
    const isCritical = criticalCategories.includes(category.toLowerCase());
    
    // Log if it's critical OR if debugging is not specifically disabled
    if (isCritical || window.CALLSAFE_DISABLE_DEBUG !== true) {
      if (data) {
        console.log(`${logPrefix} ${message}`, data);
      } else {
        console.log(`${logPrefix} ${message}`);
      }
    }
  }

  // Security and validation utilities
  function sanitizeInput(input) {
    return String(input)
      .replace(/[<>'\"&]/g, '')
      .substring(0, 255);
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
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // WebRTC Manager Class
  class WebRTCManager {
    constructor(socket, sendMessageFn) {
      debugLog('webrtc', 'WebRTCManager constructor called');
      this.socket = socket;
      this.sendMessage = sendMessageFn;
      this.peerConnection = null;
      this.localStream = null;
      this.remoteStream = null;
      this.callId = null;
      this.callType = 'voice';
      this.connectionState = 'idle';
      this.connectionCheckInterval = null;
      this.turnCredentials = null; // Dynamic TURN credentials from server
    }

    setTurnCredentials(credentials) {
      debugLog('webrtc', 'Received TURN credentials from server', {
        hasUrls: !!credentials.urls,
        urlCount: credentials.urls?.length,
        expiresAt: credentials.expiresAt ? new Date(credentials.expiresAt * 1000).toISOString() : 'unknown'
      });
      this.turnCredentials = credentials;
    }

    getIceServers() {
      debugLog('webrtc', 'Getting ICE servers configuration');
      const iceServers = [];

      // Add STUN servers (public servers, safe to hardcode)
      iceServers.push({ urls: CONFIG.STUN_SERVER_1 });
      iceServers.push({ urls: CONFIG.STUN_SERVER_2 });
      debugLog('webrtc', 'Added STUN servers', {
        stun1: CONFIG.STUN_SERVER_1,
        stun2: CONFIG.STUN_SERVER_2
      });

      // Add TURN server with dynamic credentials if available
      if (this.turnCredentials) {
        iceServers.push({
          urls: this.turnCredentials.urls,
          username: this.turnCredentials.username,
          credential: this.turnCredentials.credential
        });
        debugLog('webrtc', 'TURN server configured with time-limited credentials', {
          turnUrls: this.turnCredentials.urls,
          expiresAt: new Date(this.turnCredentials.expiresAt * 1000).toISOString(),
          username: this.turnCredentials.username
        });
      } else {
        debugLog('webrtc', 'No TURN credentials available - using STUN only (may fail on restrictive networks)');
      }

      debugLog('webrtc', 'ICE servers configuration complete', { totalServers: iceServers.length });
      return iceServers;
    }

    getLocalStream() {
      return this.localStream;
    }

    toggleCamera() {
      if (!this.localStream) return false;
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const willDisable = videoTracks[0].enabled;
        videoTracks.forEach(track => { track.enabled = !willDisable; });
        return willDisable; // returns true if camera is now disabled
      }
      return false;
    }

    async initialize(callId, localStream, callType = 'voice') {
      debugLog('webrtc', 'Initializing WebRTC manager', {
        callId,
        callType,
        hasLocalStream: !!localStream,
        localStreamTracks: localStream ? localStream.getTracks().length : 0
      });

      this.callId = callId;
      this.callType = callType;
      this.localStream = localStream;
      
      // Create peer connection with dynamic ICE servers
      const iceServers = this.getIceServers();
      debugLog('webrtc', 'Creating RTCPeerConnection', { 
        iceServersCount: iceServers.length,
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
      });
      
      this.peerConnection = new RTCPeerConnection({
        iceServers: iceServers,
        iceTransportPolicy: 'all', // Allow both STUN and TURN, with STUN preferred
        iceCandidatePoolSize: 10   // Pre-gather ICE candidates for faster connection
      });
      
      debugLog('webrtc', 'RTCPeerConnection created successfully');

      // Add local stream
      if (this.localStream) {
        debugLog('webrtc', 'Adding local stream tracks to peer connection', {
          trackCount: this.localStream.getTracks().length
        });
        this.localStream.getTracks().forEach(track => {
          debugLog('webrtc', 'Adding track to peer connection', {
            kind: track.kind,
            enabled: track.enabled,
            readyState: track.readyState
          });
          this.peerConnection.addTrack(track, this.localStream);
        });
      } else {
        debugLog('webrtc', 'No local stream available to add');
      }

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        debugLog('webrtc', 'Remote track received', {
          streamCount: event.streams.length,
          trackKind: event.track.kind
        });
        this.remoteStream = event.streams[0];
        if (this.callType === 'video') {
          this.playRemoteVideo(this.remoteStream);
        } else {
          this.playRemoteAudio(this.remoteStream);
        }
        this.connectionState = 'connected';
        debugLog('webrtc', 'Connection state changed to connected via ontrack');
      };

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.sendMessage && this.callId) {
          debugLog('webrtc', 'Sending ICE candidate', {
            callAttemptId: this.callId,
            candidateType: event.candidate.type,
            foundation: event.candidate.foundation
          });
          this.sendMessage('webrtc:ice-candidate', {
            callAttemptId: this.callId,
            candidate: event.candidate,
            timestamp: Date.now()
          });
        } else if (event.candidate === null) {
          debugLog('webrtc', 'ICE candidate gathering complete');
        } else {
          debugLog('webrtc', 'ICE candidate ignored - missing sendMessage or callId', {
            hasCandidate: !!event.candidate,
            hasSendMessage: !!this.sendMessage,
            hasCallId: !!this.callId
          });
        }
      };

      // Handle connection state changes
      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection.iceConnectionState;
        debugLog('webrtc', 'ICE connection state changed', { 
          newState: state,
          previousState: this.connectionState 
        });
        
        if (state === 'connected' || state === 'completed') {
          this.connectionState = 'connected';
        } else if (state === 'failed' || state === 'disconnected') {
          this.connectionState = 'failed';
        }
      };

      // Start connection monitoring
      this.startConnectionMonitoring();
    }

    startConnectionMonitoring() {
      debugLog('webrtc', 'Starting connection monitoring', { 
        checkInterval: CONFIG.CONNECTION_CHECK_INTERVAL 
      });
      
      this.connectionCheckInterval = setInterval(() => {
        if (this.peerConnection) {
          const state = this.peerConnection.iceConnectionState;
          const oldState = this.connectionState;
          
          if (state === 'connected' || state === 'completed') {
            this.connectionState = 'connected';
            if (oldState !== 'connected') {
              debugLog('webrtc', 'Connection monitoring detected connection success', { 
                iceState: state,
                oldConnectionState: oldState 
              });
            }
          } else if (state === 'failed' || state === 'closed') {
            this.connectionState = 'failed';
            debugLog('webrtc', 'Connection monitoring detected failure', { 
              iceState: state,
              oldConnectionState: oldState 
            });
            this.stopConnectionMonitoring();
          }
        } else {
          debugLog('webrtc', 'Connection monitoring - no peer connection available');
        }
      }, CONFIG.CONNECTION_CHECK_INTERVAL);
    }

    stopConnectionMonitoring() {
      if (this.connectionCheckInterval) {
        clearInterval(this.connectionCheckInterval);
        this.connectionCheckInterval = null;
      }
    }

    async createOffer(callAttemptId) {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.sendMessage('webrtc:offer', {
        callAttemptId: callAttemptId,
        offer: offer,
        timestamp: Date.now()
      });
    }

    async setRemoteDescription(answer) {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }
      await this.peerConnection.setRemoteDescription(answer);
    }

    async addIceCandidate(candidate) {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(candidate);
      }
    }

    toggleMute() {
      if (!this.localStream) return false;

      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const isCurrentlyMuted = !audioTracks[0].enabled;
        audioTracks.forEach(track => {
          track.enabled = isCurrentlyMuted;
        });
        return !isCurrentlyMuted;
      }
      return false;
    }

    getConnectionState() {
      return this.connectionState;
    }

    playRemoteAudio(stream) {
      // Remove any existing remote audio elements
      document.querySelectorAll('audio[data-callsafe-remote]').forEach(el => el.remove());

      const audio = document.createElement('audio');
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.hidden = true;
      audio.setAttribute('data-callsafe-remote', 'true');
      document.body.appendChild(audio);

      // Ensure audio plays
      audio.play().catch(error => {
        console.warn('CallSafe: Failed to autoplay remote audio', error);
      });
    }

    playRemoteVideo(stream) {
      const videoEl = document.querySelector('video[data-callsafe-remote]');
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.play().catch(error => {
          console.warn('CallSafe: Failed to autoplay remote video', error);
        });
      }
    }

    cleanup() {
      this.stopConnectionMonitoring();
      
      // Stop media streams
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }
      
      // Close peer connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
      
      // Remove remote audio/video elements
      document.querySelectorAll('audio[data-callsafe-remote]').forEach(el => el.remove());

      this.remoteStream = null;
      this.callType = 'voice';
      this.connectionState = 'idle';
    }
  }

  // Main CallSafeWidget Class
  class CallSafeWidget {
    constructor(config, scriptElement) {
      this.version = '5.0.0';
      this.config = config;
      this.scriptElement = scriptElement;
      this.widgetElement = null;
      this.ws = null;
      this.wsHandlers = new Map();
      this.wsConnected = false;
      this.wsHeartbeatTimer = null;
      this.wsPongTimer = null;
      this.wsIntentionallyClosed = false;
      this.wsReconnectAttempts = 0;
      this.wsHandlersSetup = false;
      this.webrtcManager = null;
      this.currentCall = null;
      this.eventListeners = new Map();
      this.connectionTimeout = null;
      this.cleanupTimeout = null;
      this.callTimerInterval = null;
      this.isReady = false;
      this.isVisible = true;
      this.isEnabled = true;
      this.isMuted = false;
      this.callType = 'voice';
      this.isVideoEnabled = true;

      // Message queuing for ws connection race condition
      this.messageQueue = [];

      // TURN credentials (fetched dynamically)
      this.turnCredentials = null;
      this.turnCredentialsFetchPromise = null;

      this.init();
    }
    
    init() {
      try {
        // Check browser support
        if (!this.checkBrowserSupport()) {
          this.renderUnsupportedMessage();
          return;
        }

        // Create widget UI
        this.createWidget();

        // Pre-fetch TURN credentials in background (don't block initialization)
        this.prefetchTurnCredentials();

        // Mark as ready
        this.isReady = true;
        this.emit('ready');

        if (this.config.debug) {
          console.log('CallSafe Widget initialized', this.config);
        }

      } catch (error) {
        console.error('CallSafe: Initialization failed', error);
        this.emit('error', { message: 'Initialization failed', error });
      }
    }

    prefetchTurnCredentials() {
      debugLog('turn', 'Pre-fetching TURN credentials in background');

      // Fetch credentials from signaling server
      this.turnCredentialsFetchPromise = fetch(`${CONFIG.DEFAULT_SIGNALING_SERVER}/api/turn-credentials`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then(credentials => {
          this.turnCredentials = credentials;
          debugLog('turn', 'TURN credentials pre-fetched successfully', {
            expiresAt: credentials.expiresAt ? new Date(credentials.expiresAt * 1000).toISOString() : 'unknown',
            urlCount: credentials.urls?.length
          });
          return credentials;
        })
        .catch(error => {
          debugLog('turn', 'Failed to pre-fetch TURN credentials (will use STUN only)', {
            error: error.message
          });
          return null; // Graceful degradation - STUN only
        });
    }

    async getTurnCredentials() {
      // If already fetched, return immediately
      if (this.turnCredentials) {
        debugLog('turn', 'Using cached TURN credentials');
        return this.turnCredentials;
      }

      // If fetch in progress, wait for it
      if (this.turnCredentialsFetchPromise) {
        debugLog('turn', 'Waiting for TURN credentials fetch to complete');
        return await this.turnCredentialsFetchPromise;
      }

      // Fallback: fetch now (shouldn't happen if prefetch worked)
      debugLog('turn', 'No cached credentials, fetching now');
      this.prefetchTurnCredentials();
      return await this.turnCredentialsFetchPromise;
    }
    
    createWidget() {
      // Create main widget container
      this.widgetElement = document.createElement('div');
      this.widgetElement.className = `callsafe-widget theme-${this.config.theme} position-${this.config.position}`;
      this.widgetElement.setAttribute('data-version', this.version);
      
      // Create call button
      const button = document.createElement('button');
      button.className = `callsafe-button size-${this.config.size}`;
      button.innerHTML = this.getButtonHTML();
      button.onclick = () => this.handleButtonClick();
      button.setAttribute('aria-label', this.config.buttonText);
      
      this.widgetElement.appendChild(button);
      
      // Create modal for call controls
      const modal = document.createElement('div');
      modal.className = 'callsafe-modal';
      modal.style.display = 'none';
      modal.innerHTML = this.getModalHTML();
      this.widgetElement.appendChild(modal);
      
      // Insert widget into DOM based on position with safety checks
      if (this.config.position === 'inline') {
        if (this.scriptElement && this.scriptElement.parentNode) {
          this.scriptElement.parentNode.insertBefore(this.widgetElement, this.scriptElement.nextSibling);
        } else {
          document.body.appendChild(this.widgetElement);
        }
      } else {
        if (document.body) {
          document.body.appendChild(this.widgetElement);
        } else {
          setTimeout(() => {
            if (document.body) {
              document.body.appendChild(this.widgetElement);
            }
          }, 100);
        }
      }
      
      // Apply styles
      this.applyStyles();
      
      // Attach modal event listeners
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
              <!-- Confirmation UI (shown before call is placed) -->
              <div class="callsafe-confirmation" id="callsafe-confirmation">
                <div class="callsafe-confirmation-message">Ready to connect on call?</div>
              </div>
              <!-- Video area (shown during video calls) -->
              <div class="callsafe-video-area" id="callsafe-video-area" style="display: none;">
                <video data-callsafe-remote autoplay playsinline class="callsafe-video-remote"></video>
                <video data-callsafe-local autoplay playsinline muted class="callsafe-video-local"></video>
              </div>
              <!-- Call Status UI (shown during/after call) -->
              <div class="callsafe-call-status" id="callsafe-call-status" style="display: none;">
                <div class="callsafe-status-message" id="callsafe-status">Ready to call</div>
                <div class="callsafe-call-timer" id="callsafe-timer" style="display: none;">00:00</div>
              </div>
            </div>
            <div class="callsafe-modal-footer">
              <!-- Confirmation Buttons -->
              <div class="callsafe-confirmation-buttons" id="callsafe-confirmation-buttons">
                <button class="callsafe-control-btn cancel-btn" id="callsafe-cancel">
                  Cancel
                </button>
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
              <!-- Call Control Buttons -->
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
              <!-- Branding -->
              <div class="callsafe-branding" id="callsafe-branding">
                Powered with <a href="https://callsafe.tech" target="_blank" rel="noopener noreferrer" class="callsafe-link">CallSafe</a>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
    applyStyles() {
      if (document.getElementById('callsafe-styles')) return;
      
      const styleSheet = document.createElement('style');
      styleSheet.id = 'callsafe-styles';
      styleSheet.textContent = this.getWidgetCSS();
      document.head.appendChild(styleSheet);
    }
    
    getWidgetCSS() {
      return `
        /* CallSafe Widget Styles */
        .callsafe-widget {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          z-index: 999999;
          position: relative;
        }
        
        .callsafe-widget.position-inline {
          display: inline-block;
        }
        
        .callsafe-widget.position-bottom-right {
          position: fixed;
          bottom: 20px;
          right: 20px;
        }
        
        .callsafe-widget.position-bottom-left {
          position: fixed;
          bottom: 20px;
          left: 20px;
        }
        
        .callsafe-widget.position-top-right {
          position: fixed;
          top: 20px;
          right: 20px;
        }
        
        .callsafe-widget.position-top-left {
          position: fixed;
          top: 20px;
          left: 20px;
        }
        
        /* Button Styles */
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
        
        .callsafe-button:focus {
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.3);
        }
        
        .callsafe-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }
        
        .callsafe-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }
        
        /* Button Sizes */
        .callsafe-button.size-small {
          padding: 8px 16px;
          font-size: 12px;
        }
        
        .callsafe-button.size-large {
          padding: 16px 28px;
          font-size: 16px;
        }
        
        /* Icon and Status */
        .callsafe-icon {
          flex-shrink: 0;
        }
        
        .callsafe-text {
          white-space: nowrap;
        }
        
        /* Modal Styles */
        .callsafe-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000000;
          font-family: inherit;
        }
        
        .callsafe-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .callsafe-modal-content {
          background: white;
          border-radius: 12px;
          padding: 0;
          min-width: 300px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: callsafe-modal-appear 0.2s ease-out;
        }
        
        @keyframes callsafe-modal-appear {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .callsafe-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid #e9ecef;
        }
        
        .callsafe-modal-title {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }
        
        .callsafe-modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }
        
        .callsafe-modal-close:hover {
          background: #f8f9fa;
          color: #333;
        }
        
        .callsafe-modal-body {
          padding: 24px;
          text-align: center;
        }

        .callsafe-confirmation {
          padding: 20px 0;
        }

        .callsafe-confirmation-message {
          font-size: 18px;
          font-weight: 500;
          color: #333;
          margin-bottom: 0;
          line-height: 1.5;
        }

        .callsafe-call-status {
          /* Status display during/after call */
        }

        .callsafe-status-message {
          font-size: 16px;
          font-weight: 500;
          color: #333;
          margin-bottom: 16px;
        }
        
        .callsafe-call-timer {
          font-size: 24px;
          font-weight: 700;
          color: #28a745;
          font-family: 'Courier New', monospace;
        }

        /* Video area */
        .callsafe-video-area {
          position: relative;
          background: #1a1a2e;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 12px;
          min-height: 180px;
        }

        .callsafe-video-remote {
          width: 100%;
          height: 180px;
          object-fit: cover;
          display: block;
          background: #1a1a2e;
        }

        .callsafe-video-local {
          position: absolute;
          bottom: 8px;
          right: 8px;
          width: 72px;
          height: 54px;
          object-fit: cover;
          border-radius: 6px;
          border: 2px solid rgba(255,255,255,0.3);
          background: #333;
        }
        
        .callsafe-modal-footer {
          padding: 16px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          justify-content: center;
          align-items: center;
        }

        .callsafe-confirmation-buttons,
        .callsafe-call-buttons {
          display: flex;
          gap: 12px;
          width: 100%;
          justify-content: center;
        }

        .callsafe-branding {
          font-size: 12px;
          color: #6c757d;
          text-align: center;
          margin-top: 8px;
        }

        .callsafe-link {
          color: #667eea;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s ease;
        }

        .callsafe-link:hover {
          color: #764ba2;
          text-decoration: underline;
        }

        .callsafe-control-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 16px;
          border: 2px solid;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          background: white;
        }

        .callsafe-control-btn svg {
          flex-shrink: 0;
        }

        .cancel-btn {
          border-color: #6c757d;
          color: #6c757d;
        }

        .cancel-btn:hover {
          background: #6c757d;
          color: white;
        }

        .call-voice-btn {
          border-color: #28a745;
          color: #28a745;
        }

        .call-voice-btn:hover {
          background: #28a745;
          color: white;
        }

        .call-video-btn {
          border-color: #4a90e2;
          color: #4a90e2;
        }

        .call-video-btn:hover {
          background: #4a90e2;
          color: white;
        }

        .camera-btn {
          border-color: #4a90e2;
          color: #4a90e2;
        }

        .camera-btn:hover {
          background: #4a90e2;
          color: white;
        }

        .camera-btn.camera-off {
          background: #dc3545;
          border-color: #dc3545;
          color: white;
        }

        .mute-btn {
          border-color: #6c757d;
          color: #6c757d;
        }
        
        .mute-btn:hover {
          background: #6c757d;
          color: white;
        }
        
        .mute-btn.muted {
          background: #6c757d;
          color: white;
        }
        
        .end-btn {
          border-color: #dc3545;
          color: #dc3545;
        }
        
        .end-btn:hover {
          background: #dc3545;
          color: white;
        }
        
        /* Dark Theme */
        .theme-dark .callsafe-modal-content {
          background: #2d3748;
          color: white;
        }

        .theme-dark .callsafe-modal-header {
          border-bottom-color: #4a5568;
        }

        .theme-dark .callsafe-modal-title {
          color: white;
        }

        .theme-dark .callsafe-modal-close {
          color: #a0aec0;
        }

        .theme-dark .callsafe-modal-close:hover {
          background: #4a5568;
          color: white;
        }

        .theme-dark .callsafe-confirmation-message {
          color: #e2e8f0;
        }

        .theme-dark .callsafe-status-message {
          color: #e2e8f0;
        }

        .theme-dark .callsafe-control-btn {
          background: #2d3748;
          color: #e2e8f0;
        }

        .theme-dark .cancel-btn:hover {
          background: #6c757d;
          color: white;
        }

        .theme-dark .call-voice-btn:hover {
          background: #28a745;
          color: white;
        }

        .theme-dark .call-video-btn:hover {
          background: #4a90e2;
          color: white;
        }

        .theme-dark .callsafe-branding {
          color: #a0aec0;
        }

        .theme-dark .callsafe-link {
          color: #90a4f4;
        }

        .theme-dark .callsafe-link:hover {
          color: #b4a3d8;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
          .callsafe-button {
            min-height: 44px;
            font-size: 16px;
          }
          
          .callsafe-modal-content {
            margin: 10px;
            min-width: unset;
          }
          
          .callsafe-control-btn {
            flex: 1;
            justify-content: center;
          }
        }
        
        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .callsafe-button {
            transition: none;
          }
          
          .callsafe-modal-content {
            animation: none;
          }
        }
      `;
    }
    
    attachModalEvents() {
      debugLog('modal', 'Attaching modal event listeners');
      const modal = this.widgetElement.querySelector('.callsafe-modal');
      const closeBtn = modal.querySelector('.callsafe-modal-close');
      const callVoiceBtn = modal.querySelector('#callsafe-call-voice');
      const callVideoBtn = modal.querySelector('#callsafe-call-video');
      const cancelBtn = modal.querySelector('#callsafe-cancel');
      const muteBtn = modal.querySelector('#callsafe-mute');
      const cameraBtn = modal.querySelector('#callsafe-camera');
      const endBtn = modal.querySelector('#callsafe-end');

      closeBtn.onclick = () => {
        debugLog('modal', 'Close button clicked - hiding modal');
        this.hideModal();
      };

      // Confirmation buttons
      callVoiceBtn.onclick = () => {
        debugLog('modal', 'Voice Call button clicked');
        this.handleCallNow('voice');
      };

      callVideoBtn.onclick = () => {
        debugLog('modal', 'Video Call button clicked');
        this.handleCallNow('video');
      };

      cancelBtn.onclick = () => {
        debugLog('modal', 'Cancel button clicked - hiding modal');
        this.hideModal();
      };

      // Call control buttons
      muteBtn.onclick = () => {
        debugLog('modal', 'Mute button clicked');
        this.toggleMute();
      };
      cameraBtn.onclick = () => {
        debugLog('modal', 'Camera button clicked');
        this.toggleCamera();
      };
      endBtn.onclick = () => {
        debugLog('modal', 'End call button clicked');
        this.endCall();
      };

      // Close modal on overlay click
      modal.querySelector('.callsafe-modal-overlay').onclick = (e) => {
        if (e.target === e.currentTarget) {
          debugLog('modal', 'Modal overlay clicked - hiding modal');
          this.hideModal();
        }
      };

      // ESC key to close modal
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
          debugLog('modal', 'ESC key pressed - hiding modal');
          this.hideModal();
        }
      });

      debugLog('modal', 'Modal event listeners attached successfully');
    }
    
    // Message queuing system to handle ws connection race conditions
    sendSocketMessage(eventName, data) {
      if (this.wsConnected) {
        debugLog('socket', 'Sending message immediately', { eventName, data });
        this.wsEmit(eventName, data);
      } else {
        debugLog('socket', 'Queueing message - ws not connected', { eventName, data });
        this.messageQueue.push({ eventName, data, timestamp: Date.now() });
      }
    }

    flushMessageQueue() {
      if (this.messageQueue.length === 0) return;
      debugLog('socket', 'Flushing queued messages', { queueLength: this.messageQueue.length });
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        debugLog('socket', 'Sending queued message', { eventName: message.eventName, data: message.data });
        this.wsEmit(message.eventName, message.data);
      }
      debugLog('socket', 'Message queue flushed successfully');
    }

    // --- Inline WebSocket transport ---

    getSignalingServerUrl() {
      if (typeof window !== 'undefined' && window.VITE_SIGNALING_SERVER_URL) {
        return window.VITE_SIGNALING_SERVER_URL;
      }
      const serverUrl = this.scriptElement?.getAttribute('data-server-url');
      if (serverUrl) return serverUrl;
      return CONFIG.DEFAULT_SIGNALING_SERVER;
    }

    getWebSocketUrl() {
      const httpUrl = this.getSignalingServerUrl();
      return httpUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/ws';
    }

    wsEmit(type, data = {}) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        debugLog('socket', 'wsEmit dropped — not connected', { type });
        return;
      }
      this.ws.send(JSON.stringify({ type, ...data }));
    }

    wsOn(type, handler) {
      if (!this.wsHandlers.has(type)) {
        this.wsHandlers.set(type, new Set());
      }
      this.wsHandlers.get(type).add(handler);
    }

    wsDispatch(type, data) {
      const handlers = this.wsHandlers.get(type);
      if (handlers) {
        for (const handler of handlers) {
          try { handler(data); } catch (e) { console.error('[WS] handler error', e); }
        }
      }
    }

    wsStartHeartbeat() {
      this.wsHeartbeatTimer = setInterval(() => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify({ type: 'ping' }));
        this.wsPongTimer = setTimeout(() => {
          debugLog('socket', 'Heartbeat timeout — closing stale connection');
          this.ws?.close();
        }, CONFIG.WS_HEARTBEAT_TIMEOUT_MS);
      }, CONFIG.WS_HEARTBEAT_INTERVAL_MS);
    }

    wsStopHeartbeat() {
      if (this.wsHeartbeatTimer) { clearInterval(this.wsHeartbeatTimer); this.wsHeartbeatTimer = null; }
      if (this.wsPongTimer) { clearTimeout(this.wsPongTimer); this.wsPongTimer = null; }
    }

    wsOnPong() {
      if (this.wsPongTimer) { clearTimeout(this.wsPongTimer); this.wsPongTimer = null; }
    }

    wsScheduleReconnect() {
      if (this.wsReconnectAttempts >= CONFIG.WS_RECONNECT_MAX_ATTEMPTS) {
        debugLog('socket', 'Max reconnect attempts reached');
        return;
      }
      const delay = CONFIG.WS_RECONNECT_BASE_MS * Math.pow(2, this.wsReconnectAttempts);
      this.wsReconnectAttempts++;
      debugLog('socket', `Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts}/${CONFIG.WS_RECONNECT_MAX_ATTEMPTS})`);
      setTimeout(() => {
        this.connectWebSocket().catch(err => debugLog('socket', 'Reconnect failed', { error: err.message }));
      }, delay);
    }

    connectWebSocket() {
      return new Promise((resolve, reject) => {
        const wsUrl = this.getWebSocketUrl();
        debugLog('socket', 'Connecting to WebSocket server', { url: wsUrl });

        this.wsIntentionallyClosed = false;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          debugLog('socket', 'WebSocket connected successfully');
          this.wsConnected = true;
          this.wsReconnectAttempts = 0;
          this.wsStartHeartbeat();
          if (!this.wsHandlersSetup) {
            this.setupWsEventHandlers();
            this.wsHandlersSetup = true;
          }
          this.flushMessageQueue();
          resolve();
        };

        this.ws.onclose = (event) => {
          debugLog('socket', 'WebSocket disconnected', { code: event.code, reason: event.reason });
          this.wsConnected = false;
          this.wsStopHeartbeat();
          if (!this.wsIntentionallyClosed) {
            this.wsScheduleReconnect();
          }
          // Reject only on initial connect failure
          if (this.wsReconnectAttempts === 0 && !this.wsConnected) {
            reject(new Error(`WebSocket closed: ${event.reason || event.code}`));
          }
        };

        this.ws.onmessage = (event) => {
          let msg;
          try { msg = JSON.parse(event.data); } catch { return; }
          const { type, ...data } = msg;
          if (typeof type !== 'string') return;
          if (type === 'pong') { this.wsOnPong(); return; }
          this.wsDispatch(type, data);
        };

        this.ws.onerror = (event) => {
          debugLog('socket', 'WebSocket error', { event });
        };
      });
    }

    wsDisconnect() {
      this.wsIntentionallyClosed = true;
      this.wsStopHeartbeat();
      this.wsHandlersSetup = false;
      this.wsHandlers.clear();
      if (this.ws) { this.ws.close(); this.ws = null; }
      this.wsConnected = false;
    }

    setupWsEventHandlers() {
      debugLog('socket', 'Setting up WebSocket event handlers');

      this.wsOn('call:accepted', async (data) => {
        debugLog('socket-event', 'call:accepted received', {
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id
        });
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleCallAccepted(data);
        }
      });

      this.wsOn('webrtc:answer', async (data) => {
        debugLog('socket-event', 'webrtc:answer received', {
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id
        });
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleWebRTCAnswer(data.answer);
        }
      });

      this.wsOn('webrtc:ice-candidate', async (data) => {
        debugLog('socket-event', 'webrtc:ice-candidate received', {
          callAttemptId: data.callAttemptId,
          candidateType: data.candidate?.type
        });
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleICECandidate(data.candidate);
        }
      });

      this.wsOn('call:busy', (data) => {
        debugLog('socket-event', 'call:busy received', { callAttemptId: data.callAttemptId });
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure('All agents are busy. Please try again later.');
        }
      });

      this.wsOn('call:unavailable', (data) => {
        debugLog('socket-event', 'call:unavailable received', { callAttemptId: data.callAttemptId });
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure(this.config.offlineMessage);
        }
      });

      this.wsOn('call:timeout', (data) => {
        debugLog('socket-event', 'call:timeout received', { callAttemptId: data.callAttemptId });
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure('No response from agents. Please try again.');
        }
      });

      this.wsOn('call:failed', (data) => {
        debugLog('socket-event', 'call:failed received', { callAttemptId: data.callAttemptId, reason: data.reason });
        if (data.callAttemptId === this.currentCall?.id) {
          const message = data?.reason === 'connection_timeout'
            ? 'Connection timeout. Please try again.'
            : 'Connection failed. Please try again.';
          this.handleCallFailure(message);
        }
      });

      this.wsOn('call:ended', (data) => {
        debugLog('socket-event', 'call:ended received', { callAttemptId: data.callAttemptId });
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallEnded();
        }
      });

      debugLog('socket', 'WebSocket event handlers setup complete');
    }
    
    async handleButtonClick() {
      debugLog('call', 'Call button clicked', {
        hasCurrentCall: !!this.currentCall,
        currentCallState: this.currentCall?.state
      });

      if (this.currentCall) {
        debugLog('call', 'Showing modal for existing call');
        this.showModal();
      } else {
        debugLog('call', 'Showing confirmation modal');
        this.showConfirmationModal();
      }
    }

    showConfirmationModal() {
      debugLog('modal', 'Showing confirmation modal');

      // Show confirmation UI, hide call status UI
      const confirmationUI = this.widgetElement.querySelector('#callsafe-confirmation');
      const callStatusUI = this.widgetElement.querySelector('#callsafe-call-status');
      const confirmationButtons = this.widgetElement.querySelector('#callsafe-confirmation-buttons');
      const callButtons = this.widgetElement.querySelector('#callsafe-call-buttons');
      const branding = this.widgetElement.querySelector('#callsafe-branding');

      if (confirmationUI) confirmationUI.style.display = 'block';
      if (callStatusUI) callStatusUI.style.display = 'none';
      if (confirmationButtons) confirmationButtons.style.display = 'flex';
      if (callButtons) callButtons.style.display = 'none';
      if (branding) branding.style.display = 'block';

      this.showModal();
      debugLog('modal', 'Confirmation modal shown');
    }

    async handleCallNow(type = 'voice') {
      debugLog('call', 'Call Now confirmed - initiating call', { type });

      // Switch to call status UI
      const confirmationUI = this.widgetElement.querySelector('#callsafe-confirmation');
      const callStatusUI = this.widgetElement.querySelector('#callsafe-call-status');
      const confirmationButtons = this.widgetElement.querySelector('#callsafe-confirmation-buttons');
      const callButtons = this.widgetElement.querySelector('#callsafe-call-buttons');

      if (confirmationUI) confirmationUI.style.display = 'none';
      if (callStatusUI) callStatusUI.style.display = 'block';
      if (confirmationButtons) confirmationButtons.style.display = 'none';
      if (callButtons) callButtons.style.display = 'flex';

      // Initiate the call
      await this.initiateCall(type);
    }
    
    async initiateCall(type = 'voice') {
      debugLog('call', 'Call initiation started', {
        isEnabled: this.isEnabled,
        handle: this.config.handle,
        sourceId: this.config.sourceId,
        callType: type
      });

      if (!this.isEnabled) {
        debugLog('call', 'Call initiation failed - widget disabled');
        return { success: false, error: { code: 'WIDGET_DISABLED', message: 'Widget is disabled' } };
      }

      this.callType = type;
      this.isVideoEnabled = true;

      try {
        // Generate call attempt ID
        const callAttemptId = this.generateCallId();
        debugLog('call', 'Generated call attempt ID', { callAttemptId });

        if (!validateCallAttemptId(callAttemptId)) {
          throw new Error('Invalid call attempt ID generated');
        }

        // Get media permission and TURN credentials in parallel
        const mediaConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };

        debugLog('call', 'Requesting media permission and fetching TURN credentials in parallel', { mediaConstraints });
        const [localStream, turnCredentials] = await Promise.all([
          navigator.mediaDevices.getUserMedia(mediaConstraints),
          this.getTurnCredentials()
        ]);

        debugLog('call', 'Media permission granted', {
          streamId: localStream.id,
          trackCount: localStream.getTracks().length
        });

        // For video calls, bind local stream to preview element
        if (type === 'video') {
          const localVideoEl = this.widgetElement.querySelector('video[data-callsafe-local]');
          if (localVideoEl) {
            localVideoEl.srcObject = localStream;
            localVideoEl.play().catch(() => {});
          }
          const videoArea = this.widgetElement.querySelector('#callsafe-video-area');
          if (videoArea) videoArea.style.display = 'block';
        }

        // Create call object
        this.currentCall = {
          id: callAttemptId,
          startTime: Date.now(),
          state: 'connecting',
          duration: 0
        };
        debugLog('call', 'Call object created', this.currentCall);

        // Update UI
        debugLog('ui', 'Updating UI for call initiation');
        this.updateButtonState('connecting', 'Connecting...');
        this.showModal();
        this.updateStatusMessage('Finding agent... (takes ~10 seconds)');

        // Connect to signaling server via WebSocket
        debugLog('call', 'Connecting to WebSocket signaling server');
        await this.connectWebSocket();

        // Initialize WebRTC with TURN credentials
        debugLog('call', 'Initializing WebRTC with credentials');
        this.webrtcManager = new WebRTCManager(null, this.sendSocketMessage.bind(this));

        // Set TURN credentials if available
        if (turnCredentials) {
          this.webrtcManager.setTurnCredentials(turnCredentials);
        }

        await this.webrtcManager.initialize(callAttemptId, localStream, type);

        // Start connection monitoring
        debugLog('call', 'Starting connection state monitoring');
        this.startConnectionStateMonitoring();

        // Send call initiate
        const initiateData = {
          callAttemptId: sanitizeInput(callAttemptId),
          handle: sanitizeInput(this.config.handle),
          sourceId: sanitizeInput(this.config.sourceId),
          callType: type,
          mediaCapabilities: {
            canSend: type === 'video' ? ['audio', 'video'] : ['audio'],
            canReceive: type === 'video' ? ['audio', 'video'] : ['audio']
          },
          timestamp: Date.now()
        };
        debugLog('call', 'Sending call:initiate to server', initiateData);
        this.sendSocketMessage('call:initiate', initiateData);

        this.emit('call:initiated', { callAttemptId, callType: type });
        debugLog('call', 'Call initiated successfully', { callAttemptId, callType: type });

        return { success: true, callAttemptId };

      } catch (error) {
        debugLog('call', 'Call initiation failed', {
          error: error.message,
          errorName: error.name,
          stack: error.stack
        });

        let errorMessage;
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = type === 'video'
            ? 'Please allow camera and microphone access for video calls.'
            : 'Please allow microphone access to make calls.';
        } else if (error.message === 'Connection timeout') {
          errorMessage = 'Connection failed. Please try again.';
        } else {
          errorMessage = 'Failed to start call. Please try again.';
        }

        this.handleCallError(errorMessage);
        return { success: false, error: { code: 'CALL_INITIATION_FAILED', message: error.message } };
      }
    }
    
    startConnectionStateMonitoring() {
      // Monitor WebRTC connection state
      const checkConnection = () => {
        if (!this.webrtcManager || !this.currentCall) return;
        
        const connectionState = this.webrtcManager.getConnectionState();
        
        if (connectionState === 'connected' && this.currentCall.state !== 'connected') {
          this.handleCallConnected();
        } else if (connectionState === 'failed' && this.currentCall.state !== 'failed') {
          this.handleConnectionFailure();
        }
      };
      
      // Check connection state periodically
      const connectionCheckInterval = setInterval(() => {
        checkConnection();
        if (!this.currentCall || ['connected', 'ended', 'failed'].includes(this.currentCall.state)) {
          clearInterval(connectionCheckInterval);
        }
      }, CONFIG.CONNECTION_CHECK_INTERVAL);
    }
    
    async handleCallAccepted(data) {
      try {
        debugLog('call', 'Call accepted by business', { 
          callAttemptId: data.callAttemptId,
          deviceType: data.deviceType,
          deviceId: data.deviceId
        });
        
        // Calculate business response time
        if (this.currentCall && this.currentCall.startTime) {
          const responseTime = Date.now() - this.currentCall.startTime;
          debugLog('analytics', 'Business response time', { 
            responseTimeMs: responseTime,
            responseTimeSeconds: Math.round(responseTime / 1000 * 10) / 10,
            callAttemptId: data.callAttemptId
          });
        }
        
        this.updateStatusMessage('Agent accepted, connecting...');
        this.currentCall.state = 'ringing';
        
        // Create WebRTC offer
        if (this.webrtcManager) {
          debugLog('webrtc', 'Creating WebRTC offer for accepted call');
          await this.webrtcManager.createOffer(data.callAttemptId);
        }
        
        this.emit('call:connecting');
        debugLog('call', 'Call acceptance handling completed');
        
      } catch (error) {
        debugLog('call', 'Failed to handle call acceptance', { 
          error: error.message,
          callAttemptId: data.callAttemptId 
        });
        this.handleConnectionFailure();
      }
    }
    
    async handleWebRTCAnswer(answer) {
      try {
        if (this.webrtcManager) {
          await this.webrtcManager.setRemoteDescription(answer);
        }
        
        if (this.config.debug) {
          console.log('CallSafe: WebRTC answer processed');
        }
        
      } catch (error) {
        console.error('CallSafe: Failed to process WebRTC answer', error);
        this.handleConnectionFailure();
      }
    }
    
    async handleICECandidate(candidate) {
      try {
        if (this.webrtcManager) {
          await this.webrtcManager.addIceCandidate(candidate);
        }
      } catch (error) {
        console.error('CallSafe: Failed to add ICE candidate', error);
      }
    }
    
    handleCallConnected() {
      debugLog('call', 'Call fully connected', { 
        callAttemptId: this.currentCall?.id,
        previousState: this.currentCall?.state
      });
      
      // Calculate total connection time (initiate to connected)
      if (this.currentCall && this.currentCall.startTime) {
        const connectionTime = Date.now() - this.currentCall.startTime;
        debugLog('analytics', 'Total connection time', { 
          connectionTimeMs: connectionTime,
          connectionTimeSeconds: Math.round(connectionTime / 1000 * 10) / 10,
          callAttemptId: this.currentCall.id
        });
      }
      
      this.currentCall.state = 'connected';
      this.updateStatusMessage('Connected to agent');
      this.updateButtonState('connected', 'In Call');
      
      // Show call controls
      this.showCallControls();
      
      // Start call timer
      this.startCallTimer();
      
      // Clear connection timeout
      this.clearConnectionTimeout();
      
      this.emit('call:connected');
      debugLog('call', 'Call connection setup completed');
    }
    
    handleConnectionFailure() {
      console.error('CallSafe: Connection failed');
      
      if (this.wsConnected && this.currentCall) {
        this.sendSocketMessage('call:failed', {
          callAttemptId: this.currentCall.id,
          reason: 'connection_failed',
          timestamp: Date.now()
        });
      }
      
      // Don't cleanup here - wait for server response with failsafe
      this.setFailsafeCleanup();
    }
    
    handleCallFailure(message) {
      this.currentCall.state = 'failed';
      this.updateStatusMessage(message);
      this.emit('call:failed', { reason: 'general' });
      
      // Auto-reset after delay
      setTimeout(() => this.cleanup(), CONFIG.AUTO_RESET_DELAY);
    }
    
    handleCallEnded() {
      debugLog('call', 'Call ended by server', { 
        callAttemptId: this.currentCall?.id,
        currentState: this.currentCall?.state
      });
      
      // Calculate call duration
      if (this.currentCall && this.currentCall.startTime) {
        const callDuration = Date.now() - this.currentCall.startTime;
        debugLog('analytics', 'Call duration', { 
          durationMs: callDuration,
          durationSeconds: Math.round(callDuration / 1000 * 10) / 10,
          durationMinutes: Math.round(callDuration / 60000 * 10) / 10,
          callAttemptId: this.currentCall.id,
          callState: this.currentCall.state
        });
      }
      
      // Clear any pending cleanup timeout since server responded
      if (this.cleanupTimeout) {
        debugLog('cleanup', 'Clearing pending cleanup timeout - server responded');
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = null;
      }
      
      this.updateStatusMessage('Call ended');
      this.emit('call:ended');
      
      // Cleanup directly since server confirmed
      debugLog('cleanup', 'Scheduling cleanup in 2 seconds');
      setTimeout(() => this.cleanup(), 2000);
    }
    
    handleCallError(message) {
      this.updateStatusMessage(message);
      this.updateButtonState('idle', this.config.buttonText);
      
      setTimeout(() => this.cleanup(), CONFIG.AUTO_RESET_DELAY);
    }
    
    setFailsafeCleanup() {
      // Failsafe: cleanup after delay if server doesn't respond
      this.cleanupTimeout = setTimeout(() => {
        if (this.config.debug) {
          console.log('CallSafe: Server didn\'t respond, forcing cleanup');
        }
        this.cleanup();
      }, CONFIG.CLEANUP_DELAY);
    }
    
    setConnectionTimeout() {
      this.clearConnectionTimeout();
      
      this.connectionTimeout = setTimeout(() => {
        if (this.currentCall && this.currentCall.state !== 'connected') {
          console.error('CallSafe: Connection timeout after 30 seconds');
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
    
    showCallControls() {
      const muteBtn = this.widgetElement.querySelector('#callsafe-mute');
      const cameraBtn = this.widgetElement.querySelector('#callsafe-camera');
      const timer = this.widgetElement.querySelector('#callsafe-timer');

      if (muteBtn) muteBtn.style.display = 'flex';
      if (cameraBtn && this.callType === 'video') cameraBtn.style.display = 'flex';
      if (timer) timer.style.display = 'block';
    }

    hideCallControls() {
      const muteBtn = this.widgetElement.querySelector('#callsafe-mute');
      const cameraBtn = this.widgetElement.querySelector('#callsafe-camera');
      const timer = this.widgetElement.querySelector('#callsafe-timer');

      if (muteBtn) {
        muteBtn.style.display = 'none';
        muteBtn.classList.remove('muted');
      }
      if (cameraBtn) {
        cameraBtn.style.display = 'none';
        cameraBtn.classList.remove('camera-off');
      }
      if (timer) {
        timer.style.display = 'none';
        timer.textContent = '00:00';
      }
    }

    toggleCamera() {
      if (!this.webrtcManager || this.callType !== 'video') return;

      const isNowDisabled = this.webrtcManager.toggleCamera();
      this.isVideoEnabled = !isNowDisabled;

      const cameraBtn = this.widgetElement.querySelector('#callsafe-camera');
      if (cameraBtn) {
        cameraBtn.classList.toggle('camera-off', isNowDisabled);
        cameraBtn.innerHTML = isNowDisabled
          ? `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.4 5.6L5.6 18.4 4.2 17l1.4-1.4c-.1-.2-.1-.4-.1-.6V7c0-1.1.9-2 2-2h9c.4 0 .8.1 1.1.3l1.4-1.4 1.3 1.7zM3.4 6.7l1.4 1.4c-.1.2-.1.4-.1.6v7c0 1.1.9 2 2 2h7c.2 0 .4 0 .6-.1l1.4 1.4L14 20.5l-1.4-1.4c-.2.1-.4.1-.6.1H7c-1.1 0-2-.9-2-2V9c0-.2 0-.4.1-.6L3.7 7l-.3-.3z"/></svg>Camera Off`
          : `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>Camera`;
      }

      if (this.wsConnected && this.currentCall) {
        this.sendSocketMessage('media:toggle', {
          callAttemptId: this.currentCall.id,
          action: isNowDisabled ? 'disable_camera' : 'enable_camera',
          success: true,
          timestamp: Date.now()
        });
      }

      debugLog('call', 'Camera toggled', { isVideoEnabled: this.isVideoEnabled });
    }
    
    startCallTimer() {
      const timerElement = this.widgetElement.querySelector('#callsafe-timer');
      if (!timerElement) return;
      
      const startTime = Date.now();
      this.callTimerInterval = setInterval(() => {
        if (this.currentCall && this.currentCall.state === 'connected') {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          this.currentCall.duration = elapsed;
        }
      }, 1000);
    }
    
    stopCallTimer() {
      if (this.callTimerInterval) {
        clearInterval(this.callTimerInterval);
        this.callTimerInterval = null;
      }
    }
    
    toggleMute() {
      if (!this.webrtcManager) return;
      
      this.isMuted = this.webrtcManager.toggleMute();
      const muteBtn = this.widgetElement.querySelector('#callsafe-mute');
      
      if (muteBtn) {
        muteBtn.classList.toggle('muted', this.isMuted);
        muteBtn.innerHTML = this.isMuted 
          ? `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>Unmute`
          : `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path fill="currentColor" d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>Mute`;
      }
      
      if (this.config.debug) {
        console.log('CallSafe: Mute toggled', this.isMuted);
      }
    }
    
    endCall() {
      debugLog('call', 'End call requested', { 
        hasCurrentCall: !!this.currentCall,
        currentCallId: this.currentCall?.id,
        currentCallState: this.currentCall?.state,
        hasSocket: !!this.socket
      });
      
      if (!this.currentCall) {
        debugLog('call', 'End call ignored - no current call');
        return;
      }

      // Emit end call event
      if (this.ws) {
        const endData = {
          callAttemptId: this.currentCall.id,
          initiator: 'customer',
          reason: 'user_action',
          timestamp: Date.now()
        };
        debugLog('call', 'Sending call:end to server', endData);
        this.sendSocketMessage('call:end', endData);

        // Don't cleanup here - wait for server's call:ended response
        debugLog('call', 'Setting failsafe cleanup timeout');
        this.setFailsafeCleanup();
      } else {
        // If no ws, cleanup immediately
        debugLog('call', 'No WebSocket available - cleaning up immediately');
        this.cleanup();
      }
      
      debugLog('call', 'Call end process initiated');
    }
    
    cleanup() {
      debugLog('cleanup', 'Starting cleanup process', {
        hasCurrentCall: !!this.currentCall,
        hasWs: !!this.ws,
        hasWebRTC: !!this.webrtcManager,
        hasCleanupTimeout: !!this.cleanupTimeout
      });
      
      // Clear any pending timeouts
      this.clearConnectionTimeout();
      this.stopCallTimer();
      
      if (this.cleanupTimeout) {
        debugLog('cleanup', 'Clearing cleanup timeout');
        clearTimeout(this.cleanupTimeout);
        this.cleanupTimeout = null;
      }
      
      // Stop WebRTC and media streams
      if (this.webrtcManager) {
        debugLog('cleanup', 'Cleaning up WebRTC manager');
        this.webrtcManager.cleanup();
        this.webrtcManager = null;
      }
      
      // Disconnect WebSocket
      if (this.ws) {
        debugLog('cleanup', 'Disconnecting WebSocket');
        this.wsDisconnect();
      }

      // Clear message queue
      if (this.messageQueue.length > 0) {
        debugLog('cleanup', 'Clearing message queue', { queuedMessages: this.messageQueue.length });
        this.messageQueue = [];
      }
      
      // Reset state
      const previousCallState = this.currentCall?.state;
      this.currentCall = null;
      this.isMuted = false;
      this.callType = 'voice';
      this.isVideoEnabled = true;
      debugLog('cleanup', 'State reset complete', { previousCallState });

      // Hide video area and clear video elements
      const videoArea = this.widgetElement?.querySelector('#callsafe-video-area');
      if (videoArea) {
        videoArea.style.display = 'none';
        const localEl = videoArea.querySelector('video[data-callsafe-local]');
        const remoteEl = videoArea.querySelector('video[data-callsafe-remote]');
        if (localEl) localEl.srcObject = null;
        if (remoteEl) remoteEl.srcObject = null;
      }
      
      // Reset UI
      debugLog('cleanup', 'Resetting UI');
      this.updateButtonState('idle', this.config.buttonText);
      this.hideModal();
      this.hideCallControls();
      
      debugLog('cleanup', 'Cleanup process completed');
    }
    
    updateButtonState(state, text) {
      const button = this.widgetElement.querySelector('.callsafe-button');
      if (button) {
        const textElement = button.querySelector('.callsafe-text');
        if (textElement) {
          textElement.textContent = text;
        }
        button.disabled = state === 'connecting';
      }
    }
    
    updateStatusMessage(message) {
      const statusElement = this.widgetElement.querySelector('#callsafe-status');
      if (statusElement) {
        statusElement.textContent = message;
      }
    }
    
    showModal() {
      debugLog('modal', 'Showing modal', { 
        hasCurrentCall: !!this.currentCall,
        currentCallState: this.currentCall?.state
      });
      const modal = this.widgetElement.querySelector('.callsafe-modal');
      if (modal) {
        modal.style.display = 'block';
        this.emit('show');
        debugLog('modal', 'Modal shown successfully');
      } else {
        debugLog('modal', 'Failed to show modal - modal element not found');
      }
    }
    
    hideModal() {
      debugLog('modal', 'Hiding modal', { 
        hasCurrentCall: !!this.currentCall,
        currentCallState: this.currentCall?.state,
        reason: 'user_action'
      });
      const modal = this.widgetElement.querySelector('.callsafe-modal');
      if (modal) {
        modal.style.display = 'none';
        this.emit('hide');
        debugLog('modal', 'Modal hidden successfully');
        
        // If there's an active call that's not connected, end it
        if (this.currentCall && this.currentCall.state !== 'connected') {
          debugLog('call', 'Ending call due to modal close during connection phase');
          this.endCall();
        }
      } else {
        debugLog('modal', 'Failed to hide modal - modal element not found');
      }
    }
    
    generateCallId() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    
    checkBrowserSupport() {
      return !!(
        window.RTCPeerConnection &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia &&
        window.WebSocket &&
        window.Promise
      );
    }
    
    renderUnsupportedMessage() {
      const message = document.createElement('div');
      message.style.cssText = `
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        padding: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        margin: 10px 0;
      `;
      message.textContent = 'Your browser does not support calling features. Please use a modern browser.';
      
      if (this.config.position === 'inline') {
        if (this.scriptElement && this.scriptElement.parentNode) {
          this.scriptElement.parentNode.insertBefore(message, this.scriptElement.nextSibling);
        } else {
          document.body.appendChild(message);
        }
      } else {
        document.body.appendChild(message);
      }
    }
    
    // Public API methods
    show() {
      this.isVisible = true;
      if (this.widgetElement) {
        this.widgetElement.style.display = '';
      }
      this.emit('show');
    }
    
    hide() {
      this.isVisible = false;
      if (this.widgetElement) {
        this.widgetElement.style.display = 'none';
      }
      this.emit('hide');
    }
    
    enable() {
      this.isEnabled = true;
      const button = this.widgetElement?.querySelector('.callsafe-button');
      if (button && !this.currentCall) {
        button.disabled = false;
      }
    }
    
    disable() {
      this.isEnabled = false;
      const button = this.widgetElement?.querySelector('.callsafe-button');
      if (button) {
        button.disabled = true;
      }
    }
    
    getStatus() {
      return {
        isVisible: this.isVisible,
        isEnabled: this.isEnabled,
        currentState: this.currentCall?.state || 'idle',
        lastError: null
      };
    }
    
    isCallActive() {
      return !!(this.currentCall && this.currentCall.state === 'connected');
    }
    
    getCallDuration() {
      return this.currentCall?.duration || 0;
    }
    
    updateConfig(newConfig) {
      Object.assign(this.config, newConfig);
      
      // Re-render button if text changed
      if (newConfig.buttonText) {
        this.updateButtonState(this.currentCall?.state || 'idle', newConfig.buttonText);
      }
    }
    
    getConfig() {
      return { ...this.config };
    }
    
    getVersion() {
      return this.version;
    }
    
    destroy() {
      // End any active call
      if (this.currentCall) {
        this.endCall();
      }
      
      // Disconnect WebSocket
      if (this.ws) {
        this.wsDisconnect();
      }
      
      // Remove widget from DOM
      if (this.widgetElement && this.widgetElement.parentNode) {
        this.widgetElement.parentNode.removeChild(this.widgetElement);
      }
      
      // Remove styles if no other widgets exist
      const widgets = document.querySelectorAll('.callsafe-widget');
      if (widgets.length === 0) {
        const styles = document.getElementById('callsafe-styles');
        if (styles) {
          styles.parentNode.removeChild(styles);
        }
      }
      
      // Clean up references
      this.eventListeners.clear();
      
      if (this.config.debug) {
        console.log('CallSafe: Widget destroyed');
      }
    }
    
    // Event system
    on(event, callback) {
      if (!this.eventListeners.has(event)) {
        this.eventListeners.set(event, []);
      }
      this.eventListeners.get(event).push(callback);
    }
    
    off(event, callback) {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }
    
    emit(event, data) {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error('CallSafe: Event listener error', error);
          }
        });
      }
      
      // Also dispatch as DOM event
      try {
        const customEvent = new CustomEvent(`callsafe:${event}`, { 
          detail: { widget: this, data } 
        });
        window.dispatchEvent(customEvent);
      } catch (error) {
        console.error('CallSafe: Failed to dispatch DOM event', error);
      }
    }
  }
  
  // Initialize widget when DOM is ready
  function initializeWidget() {
    // Get script configuration
    const script = document.currentScript || document.querySelector('script[src*="embed"]');
    if (!script) {
      console.error('CallSafe: Unable to locate script element');
      return;
    }
    
    const config = {
      handle: script.getAttribute('data-handle'),
      sourceId: script.getAttribute('data-source-id') || 'website',
      buttonText: script.getAttribute('data-button-text') || 'Talk to us instantly',
      position: script.getAttribute('data-position') || 'bottom-right',
      theme: script.getAttribute('data-theme') || 'light',
      language: script.getAttribute('data-language') || 'en',
      size: script.getAttribute('data-size') || 'medium',
      offlineMessage: script.getAttribute('data-offline-message') || 'No agents available right now.',
      debug: script.getAttribute('data-debug') === 'true'
    };
    
    // Validate required configuration
    if (!config.handle) {
      console.error('CallSafe: data-handle attribute is required');
      return;
    }
    
    if (!validateHandle(config.handle)) {
      console.error('CallSafe: Invalid handle format');
      return;
    }
    
    if (!validateSourceId(config.sourceId)) {
      console.error('CallSafe: Invalid source ID format');
      return;
    }

    // Create widget instance
    const widget = new CallSafeWidget(config, script);
    
    // Make widget globally accessible for debugging
    if (config.debug) {
      window.CallSafeWidget = widget;
    }
  }
  
  // Wait for DOM to be ready before initializing widget
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWidget);
  } else {
    // DOM is already ready
    initializeWidget();
  }
  
})();