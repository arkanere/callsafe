(function() {
  'use strict';
  
  // Configuration constants
  const CONFIG = {
    DEFAULT_SIGNALING_SERVER: 'https://tunnel.callsafe.tech',
    CONNECTION_TIMEOUT: 30000,
    CLEANUP_DELAY: 5000,
    AUTO_RESET_DELAY: 3000,
    CONNECTION_CHECK_INTERVAL: 1000,
    SOCKET_IO_CDN: 'https://cdn.socket.io/4.7.4/socket.io.min.js',
    
    // WebRTC ICE Servers
    STUN_SERVER_1: 'stun:stun.l.google.com:19302',
    STUN_SERVER_2: 'stun:stun1.l.google.com:19302',
    TURN_SERVER_URL: 'turn:a.relay.metered.ca:80',
    TURN_USERNAME: '***REDACTED***',
    TURN_CREDENTIAL: '***REDACTED***'
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
      debugLog('webrtc', 'WebRTCManager constructor called', { socketConnected: !!socket });
      this.socket = socket;
      this.sendMessage = sendMessageFn;
      this.peerConnection = null;
      this.localStream = null;
      this.remoteStream = null;
      this.callId = null;
      this.connectionState = 'idle';
      this.connectionCheckInterval = null;
    }

    getIceServers() {
      debugLog('webrtc', 'Getting ICE servers configuration');
      const iceServers = [];

      // Add STUN servers
      iceServers.push({ urls: CONFIG.STUN_SERVER_1 });
      iceServers.push({ urls: CONFIG.STUN_SERVER_2 });
      debugLog('webrtc', 'Added STUN servers', { 
        stun1: CONFIG.STUN_SERVER_1, 
        stun2: CONFIG.STUN_SERVER_2 
      });

      // Add TURN server as fallback if configured
      if (CONFIG.TURN_SERVER_URL && CONFIG.TURN_USERNAME && CONFIG.TURN_CREDENTIAL) {
        iceServers.push({
          urls: CONFIG.TURN_SERVER_URL,
          username: CONFIG.TURN_USERNAME,
          credential: CONFIG.TURN_CREDENTIAL
        });
        debugLog('webrtc', 'TURN server configured as fallback', { 
          turnUrl: CONFIG.TURN_SERVER_URL,
          username: CONFIG.TURN_USERNAME 
        });
      } else {
        debugLog('webrtc', 'TURN server not configured - using STUN only');
      }

      debugLog('webrtc', 'ICE servers configuration complete', { totalServers: iceServers.length });
      return iceServers;
    }

    async initialize(callId, localStream) {
      debugLog('webrtc', 'Initializing WebRTC manager', { 
        callId, 
        hasLocalStream: !!localStream,
        localStreamTracks: localStream ? localStream.getTracks().length : 0
      });
      
      this.callId = callId;
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
        this.playRemoteAudio(this.remoteStream);
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
      
      // Remove remote audio elements
      document.querySelectorAll('audio[data-callsafe-remote]').forEach(el => el.remove());
      
      this.remoteStream = null;
      this.connectionState = 'idle';
    }
  }

  // Main CallSafe Widget Class
  class CallSafeWidget {
    constructor(config, scriptElement) {
      this.version = '5.0.0';
      this.config = config;
      this.scriptElement = scriptElement;
      this.widgetElement = null;
      this.socket = null;
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
      
      // Message queuing for socket connection race condition
      this.messageQueue = [];
      this.socketConnected = false;
      
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
              <div class="callsafe-status-message" id="callsafe-status">Ready to call</div>
              <div class="callsafe-call-timer" id="callsafe-timer" style="display: none;">00:00</div>
            </div>
            <div class="callsafe-modal-footer">
              <button class="callsafe-control-btn mute-btn" id="callsafe-mute" style="display: none;">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path fill="currentColor" d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
                Mute
              </button>
              <button class="callsafe-control-btn end-btn" id="callsafe-end">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
                End Call
              </button>
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
        
        .callsafe-modal-footer {
          padding: 16px 24px 24px;
          display: flex;
          gap: 12px;
          justify-content: center;
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
        
        .theme-dark .callsafe-status-message {
          color: #e2e8f0;
        }
        
        .theme-dark .callsafe-control-btn {
          background: #2d3748;
          color: #e2e8f0;
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
      const muteBtn = modal.querySelector('#callsafe-mute');
      const endBtn = modal.querySelector('#callsafe-end');
      
      closeBtn.onclick = () => {
        debugLog('modal', 'Close button clicked - hiding modal');
        this.hideModal();
      };
      muteBtn.onclick = () => {
        debugLog('modal', 'Mute button clicked');
        this.toggleMute();
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
    
    // Message queuing system to handle socket connection race conditions
    sendSocketMessage(eventName, data) {
      if (this.socket && this.socketConnected) {
        debugLog('socket', 'Sending message immediately', { eventName, data });
        this.socket.emit(eventName, data);
      } else {
        debugLog('socket', 'Queueing message - socket not connected', { eventName, data });
        this.messageQueue.push({ eventName, data, timestamp: Date.now() });
      }
    }
    
    flushMessageQueue() {
      if (this.messageQueue.length === 0) return;
      
      debugLog('socket', 'Flushing queued messages', { queueLength: this.messageQueue.length });
      
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        debugLog('socket', 'Sending queued message', { 
          eventName: message.eventName, 
          data: message.data,
          queuedFor: Date.now() - message.timestamp 
        });
        this.socket.emit(message.eventName, message.data);
      }
      
      debugLog('socket', 'Message queue flushed successfully');
    }
    
    async initializeSocket() {
      debugLog('socket', 'Initializing socket connection');
      
      // Load Socket.IO client if not already available
      if (!window.io) {
        debugLog('socket', 'Socket.IO not loaded, loading from CDN');
        await this.loadSocketIO();
      } else {
        debugLog('socket', 'Socket.IO already available');
      }
      
      await this.connectSocket();
    }
    
    loadSocketIO() {
      return new Promise((resolve, reject) => {
        debugLog('socket', 'Loading Socket.IO from CDN', { url: CONFIG.SOCKET_IO_CDN });
        const script = document.createElement('script');
        script.src = CONFIG.SOCKET_IO_CDN;
        script.onload = () => {
          debugLog('socket', 'Socket.IO loaded successfully');
          resolve();
        };
        script.onerror = () => {
          debugLog('socket', 'Failed to load Socket.IO');
          reject(new Error('Failed to load Socket.IO'));
        };
        document.head.appendChild(script);
      });
    }
    
    async connectSocket() {
      return new Promise((resolve, reject) => {
        try {
          debugLog('socket', 'Starting socket connection');
          
          // Ensure Socket.IO is loaded
          if (!window.io) {
            debugLog('socket', 'Socket.IO library not loaded');
            reject(new Error('Socket.IO library not loaded'));
            return;
          }

          // Get signaling server URL with environment variable support
          const signalingServerUrl = this.getSignalingServerUrl();
          debugLog('socket', 'Connecting to signaling server', { 
            url: signalingServerUrl,
            transports: ['websocket', 'polling'],
            timeout: CONFIG.CONNECTION_TIMEOUT,
            forceNew: true
          });
          
          this.socket = window.io(signalingServerUrl, {
            transports: ['websocket', 'polling'],
            timeout: CONFIG.CONNECTION_TIMEOUT,
            forceNew: true
          });
          
          this.socket.on('connect', () => {
            debugLog('socket', 'Connected to server successfully', { 
              socketId: this.socket.id,
              transport: this.socket.io.engine.transport.name 
            });
            this.socketConnected = true;
            this.setupSocketEventHandlers();
            this.flushMessageQueue();
            resolve();
          });
          
          this.socket.on('connect_error', (error) => {
            debugLog('socket', 'Connection error occurred', { 
              error: error.message,
              type: error.type 
            });
            reject(error);
          });
          
          this.socket.on('disconnect', (reason) => {
            debugLog('socket', 'Socket disconnected', { 
              reason,
              socketId: this.socket?.id 
            });
            this.socketConnected = false;
          });
          
        } catch (error) {
          debugLog('socket', 'Socket connection setup failed', { 
            error: error.message 
          });
          reject(error);
        }
      });
    }
    
    getSignalingServerUrl() {
      // Check for environment variables (for development/testing)
      if (typeof window !== 'undefined' && window.VITE_SIGNALING_SERVER_URL) {
        return window.VITE_SIGNALING_SERVER_URL;
      }
      
      // Check for data attribute on script
      const serverUrl = this.scriptElement?.getAttribute('data-server-url');
      if (serverUrl) {
        return serverUrl;
      }
      
      // Default fallback
      return CONFIG.DEFAULT_SIGNALING_SERVER;
    }
    
    setupSocketEventHandlers() {
      if (!this.socket) {
        debugLog('socket', 'Cannot setup handlers - socket is null');
        return;
      }
      
      debugLog('socket', 'Setting up socket event handlers');
      
      // Call accepted
      this.socket.on('call:accepted', async (data) => {
        debugLog('socket-event', 'call:accepted received', { 
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id,
          matches: data.callAttemptId === this.currentCall?.id
        });
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleCallAccepted(data);
        }
      });
      
      // WebRTC answer
      this.socket.on('webrtc:answer', async (data) => {
        debugLog('socket-event', 'webrtc:answer received', { 
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id,
          matches: data.callAttemptId === this.currentCall?.id
        });
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleWebRTCAnswer(data.answer);
        }
      });
      
      // ICE candidate
      this.socket.on('webrtc:ice-candidate', async (data) => {
        debugLog('socket-event', 'webrtc:ice-candidate received', { 
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id,
          candidateType: data.candidate?.type
        });
        if (data.callAttemptId === this.currentCall?.id) {
          await this.handleICECandidate(data.candidate);
        }
      });
      
      // Call failures
      this.socket.on('call:busy', (data) => {
        debugLog('socket-event', 'call:busy received', { 
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id
        });
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure('All agents are busy. Please try again later.');
        }
      });
      
      this.socket.on('call:unavailable', (data) => {
        debugLog('socket-event', 'call:unavailable received', { 
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id
        });
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure(this.config.offlineMessage);
        }
      });
      
      this.socket.on('call:timeout', (data) => {
        debugLog('socket-event', 'call:timeout received', { 
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id,
          timeoutDuration: data.timeoutDuration
        });
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailure('No response from agents. Please try again.');
        }
      });
      
      this.socket.on('call:failed', (data) => {
        debugLog('socket-event', 'call:failed received', { 
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id,
          reason: data.reason
        });
        if (data.callAttemptId === this.currentCall?.id) {
          const message = data?.reason === 'connection_timeout'
            ? 'Connection timeout. Please try again.'
            : 'Connection failed. Please try again.';
          this.handleCallFailure(message);
        }
      });
      
      // Call ended
      this.socket.on('call:ended', (data) => {
        debugLog('socket-event', 'call:ended received', { 
          callAttemptId: data.callAttemptId,
          currentCallId: this.currentCall?.id
        });
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallEnded();
        }
      });
      
      debugLog('socket', 'Socket event handlers setup complete');
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
        debugLog('call', 'Initiating new call');
        await this.initiateCall();
      }
    }
    
    async initiateCall() {
      debugLog('call', 'Call initiation started', { 
        isEnabled: this.isEnabled,
        handle: this.config.handle,
        sourceId: this.config.sourceId
      });
      
      if (!this.isEnabled) {
        debugLog('call', 'Call initiation failed - widget disabled');
        return { success: false, error: { code: 'WIDGET_DISABLED', message: 'Widget is disabled' } };
      }
      
      try {
        // Generate call attempt ID
        const callAttemptId = this.generateCallId();
        debugLog('call', 'Generated call attempt ID', { callAttemptId });
        
        if (!validateCallAttemptId(callAttemptId)) {
          throw new Error('Invalid call attempt ID generated');
        }
        
        // Request microphone permission
        debugLog('call', 'Requesting microphone permission');
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        debugLog('call', 'Microphone permission granted', { 
          streamId: localStream.id,
          trackCount: localStream.getTracks().length
        });
        
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
        
        // Load Socket.IO and connect to signaling server
        debugLog('call', 'Initializing socket connection');
        await this.initializeSocket();
        
        // Initialize WebRTC
        debugLog('call', 'Initializing WebRTC');
        this.webrtcManager = new WebRTCManager(this.socket, this.sendSocketMessage.bind(this));
        await this.webrtcManager.initialize(callAttemptId, localStream);
        
        // Start connection monitoring
        debugLog('call', 'Starting connection state monitoring');
        this.startConnectionStateMonitoring();
        
        // Send call initiate
        const initiateData = {
          callAttemptId: sanitizeInput(callAttemptId),
          handle: sanitizeInput(this.config.handle),
          sourceId: sanitizeInput(this.config.sourceId),
          timestamp: Date.now()
        };
        debugLog('call', 'Sending call:initiate to server', initiateData);
        this.sendSocketMessage('call:initiate', initiateData);
        
        this.emit('call:initiated', { callAttemptId });
        debugLog('call', 'Call initiated successfully', { callAttemptId });
        
        return { success: true, callAttemptId };
        
      } catch (error) {
        debugLog('call', 'Call initiation failed', { 
          error: error.message,
          errorName: error.name,
          stack: error.stack
        });
        
        let errorMessage;
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Please allow microphone access to make calls.';
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
      
      if (this.socket && this.currentCall) {
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
      const timer = this.widgetElement.querySelector('#callsafe-timer');
      
      if (muteBtn) muteBtn.style.display = 'flex';
      if (timer) timer.style.display = 'block';
    }
    
    hideCallControls() {
      const muteBtn = this.widgetElement.querySelector('#callsafe-mute');
      const timer = this.widgetElement.querySelector('#callsafe-timer');
      
      if (muteBtn) {
        muteBtn.style.display = 'none';
        muteBtn.classList.remove('muted');
      }
      if (timer) {
        timer.style.display = 'none';
        timer.textContent = '00:00';
      }
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
      if (this.socket) {
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
        // If no socket, cleanup immediately
        debugLog('call', 'No socket available - cleaning up immediately');
        this.cleanup();
      }
      
      debugLog('call', 'Call end process initiated');
    }
    
    cleanup() {
      debugLog('cleanup', 'Starting cleanup process', {
        hasCurrentCall: !!this.currentCall,
        hasSocket: !!this.socket,
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
      
      // Disconnect socket
      if (this.socket) {
        debugLog('cleanup', 'Disconnecting socket', { socketId: this.socket.id });
        this.socket.disconnect();
        this.socket = null;
      }
      
      // Reset socket state and clear message queue
      this.socketConnected = false;
      if (this.messageQueue.length > 0) {
        debugLog('cleanup', 'Clearing message queue', { queuedMessages: this.messageQueue.length });
        this.messageQueue = [];
      }
      
      // Reset state
      const previousCallState = this.currentCall?.state;
      this.currentCall = null;
      this.isMuted = false;
      debugLog('cleanup', 'State reset complete', { previousCallState });
      
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
      
      // Disconnect socket
      if (this.socket) {
        this.socket.disconnect();
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