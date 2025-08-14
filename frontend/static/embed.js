(function() {
  'use strict';
  
  // Security and validation utilities
  function sanitizeInput(input) {
    return String(input)
      .replace(/[<>'"&]/g, '')
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
    new CallSafeWidget(config, script);
  }
  
  // Main CallSafe Widget Class
  class CallSafeWidget {
    constructor(config, scriptElement) {
      this.version = '4.0.0';
      this.config = config;
      this.scriptElement = scriptElement;
      this.widgetElement = null;
      this.socket = null;
      this.peerConnection = null;
      this.localStream = null;
      this.remoteStream = null;
      this.currentCall = null;
      this.eventListeners = new Map();
      this.connectionTimeout = null;
      this.callTimerInterval = null;
      this.isReady = false;
      this.isVisible = true;
      this.isEnabled = true;
      
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
        
        // Mark as ready (no socket connection until call initiation)
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
        // Check if script element has a parent node
        if (this.scriptElement && this.scriptElement.parentNode) {
          this.scriptElement.parentNode.insertBefore(this.widgetElement, this.scriptElement.nextSibling);
        } else {
          // Fallback to body if no parent node
          document.body.appendChild(this.widgetElement);
        }
      } else {
        // For fixed positions, always append to body
        if (document.body) {
          document.body.appendChild(this.widgetElement);
        } else {
          // Wait for body if not ready
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
              <div class="callsafe-status-message" id="callsafe-status">Connecting...</div>
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
      const modal = this.widgetElement.querySelector('.callsafe-modal');
      const closeBtn = modal.querySelector('.callsafe-modal-close');
      const muteBtn = modal.querySelector('#callsafe-mute');
      const endBtn = modal.querySelector('#callsafe-end');
      
      closeBtn.onclick = () => this.hideModal();
      muteBtn.onclick = () => this.toggleMute();
      endBtn.onclick = () => this.endCall();
      
      // Close modal on overlay click
      modal.querySelector('.callsafe-modal-overlay').onclick = (e) => {
        if (e.target === e.currentTarget) {
          this.hideModal();
        }
      };
      
      // ESC key to close modal
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
          this.hideModal();
        }
      });
    }
    
    async initializeSocket() {
      // Load Socket.IO client if not already available
      if (!window.io) {
        await this.loadSocketIO();
      }
      
      this.connectSocket();
    }
    
    loadSocketIO() {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Socket.IO'));
        document.head.appendChild(script);
      });
    }
    
    connectSocket() {
      try {
        this.socket = window.io('wss://tunnel.callsafe.tech', {
          transports: ['websocket', 'polling'],
          timeout: 30000,
          forceNew: true
        });
        
        this.setupSocketEventHandlers();
        
      } catch (error) {
        console.error('CallSafe: Socket connection failed', error);
        this.emit('error', { message: 'Connection failed', error });
      }
    }
    
    setupSocketEventHandlers() {
      this.socket.on('connect', () => {
        if (this.config.debug) {
          console.log('CallSafe: Connected to server');
        }
      });
      
      this.socket.on('disconnect', (reason) => {
        if (this.config.debug) {
          console.log('CallSafe: Disconnected from server', reason);
        }
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('CallSafe: Connection error', error);
        this.emit('error', { message: 'Connection error', error });
      });
      
      // Call event handlers
      this.socket.on('call:accepted', (data) => {
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallAccepted(data);
        }
      });
      
      this.socket.on('call:busy', (data) => {
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallBusy();
        }
      });
      
      this.socket.on('call:unavailable', (data) => {
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallUnavailable();
        }
      });
      
      this.socket.on('call:timeout', (data) => {
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallTimeout();
        }
      });
      
      this.socket.on('call:failed', (data) => {
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallFailed(data);
        }
      });
      
      this.socket.on('call:ended', (data) => {
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleCallEnded();
        }
      });
      
      // WebRTC event handlers
      this.socket.on('webrtc:answer', (data) => {
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleWebRTCAnswer(data.answer);
        }
      });
      
      this.socket.on('webrtc:ice-candidate', (data) => {
        if (data.callAttemptId === this.currentCall?.id) {
          this.handleICECandidate(data.candidate);
        }
      });
    }
    
    
    async handleButtonClick() {
      if (this.currentCall) {
        this.showModal();
      } else {
        await this.initiateCall();
      }
    }
    
    async initiateCall() {
      if (!this.isEnabled) {
        console.warn('CallSafe: Widget is disabled');
        return { success: false, error: { code: 'WIDGET_DISABLED', message: 'Widget is disabled' } };
      }
      
      try {
        // Initialize socket connection when call starts
        if (!this.socket) {
          await this.initializeSocket();
        }
        
        // Request microphone permission
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        
        // Generate call attempt ID
        const callAttemptId = this.generateCallId();
        
        // Validate generated ID
        if (!validateCallAttemptId(callAttemptId)) {
          throw new Error('Invalid call attempt ID generated');
        }
        
        // Create call object
        this.currentCall = {
          id: callAttemptId,
          startTime: Date.now(),
          state: 'connecting',
          duration: 0
        };
        
        // Update UI
        this.updateButtonState('connecting', 'Connecting...');
        this.showModal();
        this.updateStatusMessage('Finding agent...');
        
        // Wait for socket connection if needed
        if (!this.socket.connected) {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
            this.socket.once('connect', () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        }
        
        // Emit call initiate event
        this.socket.emit('call:initiate', {
          callAttemptId: sanitizeInput(callAttemptId),
          handle: sanitizeInput(this.config.handle),
          sourceId: sanitizeInput(this.config.sourceId),
          timestamp: Date.now()
        });
        
        this.emit('call:initiated', { callAttemptId });
        
        if (this.config.debug) {
          console.log('CallSafe: Call initiated', callAttemptId);
        }
        
        return { success: true, callAttemptId };
        
      } catch (error) {
        console.error('CallSafe: Failed to initiate call', error);
        
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
    
    async handleCallAccepted(data) {
      try {
        this.updateStatusMessage('Agent accepted, connecting...');
        this.currentCall.state = 'ringing';
        
        // Set up WebRTC
        await this.setupWebRTC();
        
        this.emit('call:connecting');
        
        if (this.config.debug) {
          console.log('CallSafe: Call accepted, setting up WebRTC');
        }
        
      } catch (error) {
        console.error('CallSafe: Failed to set up WebRTC', error);
        this.handleCallError('Failed to establish connection. Please try again.');
      }
    }
    
    async setupWebRTC() {
      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      // Add local stream
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }
      
      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        this.remoteStream = event.streams[0];
        this.playRemoteAudio(this.remoteStream);
        
        // Call connected successfully
        this.handleCallConnected();
        
        // Clear connection timeout
        this.clearConnectionTimeout();
      };
      
      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.socket && this.currentCall) {
          this.socket.emit('webrtc:ice-candidate', {
            callAttemptId: this.currentCall.id,
            candidate: event.candidate,
            timestamp: Date.now()
          });
        }
      };
      
      // Handle connection state changes
      this.peerConnection.oniceconnectionstatechange = () => {
        if (this.config.debug) {
          console.log('CallSafe: ICE connection state:', this.peerConnection.iceConnectionState);
        }
        
        if (this.peerConnection.iceConnectionState === 'failed') {
          this.handleConnectionFailure();
        } else if (this.peerConnection.iceConnectionState === 'connected') {
          this.clearConnectionTimeout();
        }
      };
      
      // Create and send offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      this.socket.emit('webrtc:offer', {
        callAttemptId: this.currentCall.id,
        offer: offer,
        timestamp: Date.now()
      });
      
      // Set connection timeout
      this.setConnectionTimeout();
    }
    
    async handleWebRTCAnswer(answer) {
      try {
        await this.peerConnection.setRemoteDescription(answer);
        this.clearConnectionTimeout();
        
        if (this.config.debug) {
          console.log('CallSafe: WebRTC answer processed');
        }
        
      } catch (error) {
        console.error('CallSafe: Failed to process WebRTC answer', error);
        this.handleCallError('Connection failed. Please try again.');
      }
    }
    
    async handleICECandidate(candidate) {
      try {
        if (this.peerConnection) {
          await this.peerConnection.addIceCandidate(candidate);
        }
      } catch (error) {
        console.error('CallSafe: Failed to add ICE candidate', error);
      }
    }
    
    handleCallConnected() {
      this.currentCall.state = 'connected';
      this.updateStatusMessage('Connected to agent');
      this.updateButtonState('connected', 'In Call');
      
      // Show call controls
      this.showCallControls();
      
      // Start call timer
      this.startCallTimer();
      
      this.emit('call:connected');
      
      if (this.config.debug) {
        console.log('CallSafe: Call connected successfully');
      }
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
    
    showCallControls() {
      const muteBtn = this.widgetElement.querySelector('#callsafe-mute');
      const timer = this.widgetElement.querySelector('#callsafe-timer');
      
      if (muteBtn) muteBtn.style.display = 'flex';
      if (timer) timer.style.display = 'block';
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
      if (!this.localStream) return;
      
      const audioTracks = this.localStream.getAudioTracks();
      const muteBtn = this.widgetElement.querySelector('#callsafe-mute');
      
      if (audioTracks.length > 0) {
        const isCurrentlyMuted = !audioTracks[0].enabled;
        
        audioTracks.forEach(track => {
          track.enabled = isCurrentlyMuted;
        });
        
        // Update button state
        if (muteBtn) {
          muteBtn.classList.toggle('muted', !isCurrentlyMuted);
          muteBtn.innerHTML = isCurrentlyMuted 
            ? `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path fill="currentColor" d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>Mute`
            : `<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3z"/><path fill="currentColor" d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>Unmute`;
        }
        
        if (this.config.debug) {
          console.log('CallSafe: Mute toggled', !isCurrentlyMuted);
        }
      }
    }
    
    endCall() {
      if (!this.currentCall) return;
      
      // Emit end call event
      if (this.socket) {
        this.socket.emit('call:end', {
          callAttemptId: this.currentCall.id,
          initiator: 'customer',
          reason: 'user_action',
          timestamp: Date.now()
        });
      }
      
      this.cleanup();
      
      if (this.config.debug) {
        console.log('CallSafe: Call ended by user');
      }
    }
    
    handleCallBusy() {
      this.updateStatusMessage('All agents are busy. Please try again later.');
      this.emit('call:failed', { reason: 'busy' });
      
      setTimeout(() => {
        this.cleanup();
      }, 3000);
    }
    
    handleCallUnavailable() {
      this.updateStatusMessage(this.config.offlineMessage);
      this.emit('call:failed', { reason: 'unavailable' });
      
      setTimeout(() => {
        this.cleanup();
      }, 3000);
    }
    
    handleCallTimeout() {
      this.updateStatusMessage('No response from agents. Please try again.');
      this.emit('call:failed', { reason: 'timeout' });
      
      setTimeout(() => {
        this.cleanup();
      }, 3000);
    }
    
    handleCallFailed(data) {
      const message = data?.reason === 'connection_timeout' 
        ? 'Connection timeout. Please try again.'
        : 'Connection failed. Please try again.';
        
      this.handleCallError(message);
      this.emit('call:failed', { reason: data?.reason || 'unknown' });
    }
    
    handleCallEnded() {
      this.updateStatusMessage('Call ended');
      this.emit('call:ended');
      
      setTimeout(() => {
        this.cleanup();
      }, 2000);
    }
    
    handleCallError(message) {
      this.updateStatusMessage(message);
      this.updateButtonState('idle', this.config.buttonText);
      
      setTimeout(() => {
        this.cleanup();
      }, 3000);
    }
    
    setConnectionTimeout() {
      this.clearConnectionTimeout();
      
      this.connectionTimeout = setTimeout(() => {
        if (this.currentCall && this.currentCall.state !== 'connected') {
          console.error('CallSafe: WebRTC connection timeout after 30 seconds');
          
          if (this.socket) {
            this.socket.emit('call:failed', {
              callAttemptId: this.currentCall.id,
              reason: 'connection_timeout',
              timestamp: Date.now()
            });
          }
          
          this.handleCallError('Connection timeout. Please try again.');
        }
      }, 30000);
    }
    
    clearConnectionTimeout() {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
    }
    
    handleConnectionFailure() {
      console.error('CallSafe: WebRTC connection failed');
      
      this.clearConnectionTimeout();
      
      if (this.socket && this.currentCall) {
        this.socket.emit('call:failed', {
          callAttemptId: this.currentCall.id,
          reason: 'connection_failed',
          timestamp: Date.now()
        });
      }
      
      this.handleCallError('Connection failed. Please try again.');
    }
    
    cleanup() {
      // Clear timeouts
      this.clearConnectionTimeout();
      this.stopCallTimer();
      
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
      
      // Reset state
      this.currentCall = null;
      this.remoteStream = null;
      
      // Reset UI
      this.updateButtonState('idle', this.config.buttonText);
      this.hideModal();
      this.hideCallControls();
      
      if (this.config.debug) {
        console.log('CallSafe: Cleanup completed');
      }
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
      const modal = this.widgetElement.querySelector('.callsafe-modal');
      if (modal) {
        modal.style.display = 'block';
        this.emit('show');
      }
    }
    
    hideModal() {
      const modal = this.widgetElement.querySelector('.callsafe-modal');
      if (modal) {
        modal.style.display = 'none';
        this.emit('hide');
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
    
  }
  
  // Wait for DOM to be ready before initializing widget
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWidget);
  } else {
    // DOM is already ready
    initializeWidget();
  }
  
})();