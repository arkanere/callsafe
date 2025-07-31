/**
 * CallSafe v4.0.0 - Embed Widget Script
 * Lightweight, secure widget for embedding on business websites
 * 
 * Usage: <div data-callsafe-widget data-handle="YOUR_HANDLE" data-source-id="website"></div>
 */
(function() {
  'use strict';
  
  // Namespace to avoid conflicts
  const CallSafeWidget = {
    version: '4.0.0',
    initialized: false,
    config: null,
    state: {
      callAttemptId: null,
      isActive: false,
      webrtc: null,
      socket: null
    }
  };
  
  // Secure configuration loading
  CallSafeWidget.init = function(element) {
    if (this.initialized) return;
    
    // Extract configuration from data attributes
    const handle = element.dataset.handle;
    const sourceId = element.dataset.sourceId || 'website';
    const theme = element.dataset.theme || 'light';
    
    // Validate configuration
    if (!handle || !this.validateHandle(handle)) {
      console.error('CallSafe: Invalid or missing handle');
      return;
    }
    
    this.config = {
      handle: this.sanitizeInput(handle),
      sourceId: this.sanitizeInput(sourceId),
      theme: this.sanitizeInput(theme),
      apiBase: 'https://callsafe.tech',
      signalServer: 'http://localhost:3000'
    };
    
    this.render(element);
    this.initialized = true;
  };
  
  // Input sanitization
  CallSafeWidget.sanitizeInput = function(input) {
    const sanitized = String(input).replace(/[<>'\"&]/g, '');
    console.log('[CALLSAFE WIDGET] Input sanitized:', input, '->', sanitized);
    return sanitized;
  };
  
  // Handle validation
  CallSafeWidget.validateHandle = function(handle) {
    const isValid = /^[a-f0-9]{16}$/.test(handle);
    console.log('[CALLSAFE WIDGET] Handle validation:', handle, '->', isValid);
    return isValid;
  };
  
  // Render widget UI
  CallSafeWidget.render = function(container) {
    const widgetHTML = `
      <div class="callsafe-widget" data-theme="${this.config.theme}">
        <button class="callsafe-button" id="callsafe-btn">
          <svg class="callsafe-icon" viewBox="0 0 24 24">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
          </svg>
          <span class="callsafe-text">Talk to us instantly</span>
        </button>
        <div class="callsafe-modal" id="callsafe-modal" style="display: none;">
          <div class="callsafe-modal-content">
            <div class="callsafe-status" id="callsafe-status">Connecting...</div>
            <div class="callsafe-controls" id="callsafe-controls">
              <button class="callsafe-control mute" id="callsafe-mute">Mute</button>
              <button class="callsafe-control end" id="callsafe-end">End Call</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = widgetHTML;
    this.attachEventListeners();
    this.loadStyles();
  };
  
  // Event listeners
  CallSafeWidget.attachEventListeners = function() {
    const button = document.getElementById('callsafe-btn');
    const endButton = document.getElementById('callsafe-end');
    const muteButton = document.getElementById('callsafe-mute');
    
    button.addEventListener('click', () => this.initiateCall());
    endButton.addEventListener('click', () => this.endCall());
    muteButton.addEventListener('click', () => this.toggleMute());
  };
  
  // Call initiation
  CallSafeWidget.initiateCall = async function() {
    console.log('[CALLSAFE WIDGET] Call initiation requested');
    
    if (this.state.isActive) {
      console.log('[CALLSAFE WIDGET] Call already active, ignoring request');
      return;
    }
    
    try {
      console.log('[CALLSAFE WIDGET] Requesting microphone permission');
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
      console.log('[CALLSAFE WIDGET] Microphone access granted');
      
      this.state.callAttemptId = this.generateUUID();
      this.state.isActive = true;
      console.log('[CALLSAFE WIDGET] Call attempt ID generated:', this.state.callAttemptId);
      
      // Update UI
      console.log('[CALLSAFE WIDGET] Updating UI - showing modal');
      this.showModal();
      this.updateStatus('Finding agent...');
      
      // Connect to signaling server
      console.log('[CALLSAFE WIDGET] Connecting to signaling server');
      await this.connectToSignalingServer();
      console.log('[CALLSAFE WIDGET] Connected to signaling server');
      
      // Initialize WebRTC
      console.log('[CALLSAFE WIDGET] Initializing WebRTC');
      await this.initializeWebRTC(stream);
      console.log('[CALLSAFE WIDGET] WebRTC initialized');
      
      // Send call initiate
      console.log('[CALLSAFE WIDGET] Sending call initiate event');
      this.state.socket.emit('call:initiate', {
        callAttemptId: this.state.callAttemptId,
        handle: this.config.handle,
        sourceId: this.config.sourceId,
        timestamp: Date.now()
      });
      console.log('[CALLSAFE WIDGET] Call initiate event sent');
      
    } catch (error) {
      console.error('[CALLSAFE WIDGET] Error during call initiation:', error);
      this.handleError('microphone_access_denied', error);
    }
  };
  
  // WebRTC initialization
  CallSafeWidget.initializeWebRTC = async function(localStream) {
    this.state.webrtc = {
      peerConnection: new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }),
      localStream: localStream,
      remoteStream: null,
      connectionTimeout: null
    };
    
    // Add local stream
    localStream.getTracks().forEach(track => {
      this.state.webrtc.peerConnection.addTrack(track, localStream);
    });
    
    // Handle remote stream
    this.state.webrtc.peerConnection.ontrack = (event) => {
      this.state.webrtc.remoteStream = event.streams[0];
      this.playRemoteAudio(event.streams[0]);
      this.updateStatus('Connected to agent');
      
      // Remote stream received - connection established successfully
      // Server timeout will be cleared automatically when answer is processed
    };
    
    // Handle ICE candidates
    this.state.webrtc.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.state.socket) {
        this.state.socket.emit('webrtc:ice-candidate', {
          callAttemptId: this.state.callAttemptId,
          candidate: event.candidate,
          timestamp: Date.now()
        });
      }
    };
    
    // Handle ICE connection state changes
    this.state.webrtc.peerConnection.oniceconnectionstatechange = () => {
      if (this.state.webrtc.peerConnection.iceConnectionState === 'failed') {
        this.handleConnectionFailure();
      }
      // Connection success is handled by server timeout management
    };
  };
  
  CallSafeWidget.handleConnectionFailure = function() {
    console.error('[CALLSAFE WIDGET] WebRTC connection failed');
    
    console.log('[CALLSAFE WIDGET] Emitting call:failed event to server');
    // Emit call:failed event
    if (this.state.socket && this.state.callAttemptId) {
      this.state.socket.emit('call:failed', {
        callAttemptId: this.state.callAttemptId,
        reason: 'connection_failed',
        timestamp: Date.now()
      });
      console.log('[CALLSAFE WIDGET] Call:failed event sent');
    } else {
      console.log('[CALLSAFE WIDGET] Cannot send call:failed - missing socket or callAttemptId');
    }
    
    console.log('[CALLSAFE WIDGET] UI cleanup will be handled by server response');
    // UI cleanup will be handled by call:failed event from server
  };
  
  // Socket connection
  CallSafeWidget.connectToSignalingServer = function() {
    return new Promise((resolve, reject) => {
      // Dynamic import of Socket.IO client (version must match server: 4.7.4)
      this.loadScript('https://cdn.socket.io/4.7.4/socket.io.min.js', () => {
        this.state.socket = io(this.config.signalServer, {
          transports: ['websocket', 'polling'],
          timeout: 30000 // 30-second timeout for consistency
        });
        
        this.state.socket.on('connect', () => {
          this.setupSocketEventHandlers();
          resolve();
        });
        
        this.state.socket.on('connect_error', reject);
      });
    });
  };
  
  // Socket event handlers
  CallSafeWidget.setupSocketEventHandlers = function() {
    // Call accepted
    this.state.socket.on('call:accepted', async (data) => {
      this.updateStatus('Agent accepted, connecting...');
      
      // Create WebRTC offer
      const offer = await this.state.webrtc.peerConnection.createOffer();
      await this.state.webrtc.peerConnection.setLocalDescription(offer);
      
      this.state.socket.emit('webrtc:offer', {
        callAttemptId: data.callAttemptId,
        offer: offer,
        timestamp: Date.now()
      });
      
      // Server handles WebRTC connection timeout - no frontend timeout needed
    });
    
    // WebRTC answer
    this.state.socket.on('webrtc:answer', async (data) => {
      await this.state.webrtc.peerConnection.setRemoteDescription(data.answer);
      
      // Server handles timeout management - connection is progressing
    });
    
    // ICE candidate
    this.state.socket.on('webrtc:ice-candidate', async (data) => {
      await this.state.webrtc.peerConnection.addIceCandidate(data.candidate);
    });
    
    // Call failures
    this.state.socket.on('call:busy', () => {
      this.handleCallFailure('All agents are busy. Please try again later.');
    });
    
    this.state.socket.on('call:unavailable', () => {
      this.handleCallFailure('No agents available right now.');
    });
    
    this.state.socket.on('call:timeout', () => {
      this.handleCallFailure('No response from agents. Please try again.');
    });
    
    // Call ended
    this.state.socket.on('call:ended', () => {
      this.endCall();
    });
    
    // Call failed (WebRTC connection failures and timeouts)
    this.state.socket.on('call:failed', (data) => {
      const message = data?.reason === 'connection_timeout' 
        ? 'Connection timeout. Please try again.'
        : 'Connection failed. Please try again.';
      this.handleCallFailure(message);
    });
  };
  
  // End call cleanup
  CallSafeWidget.endCall = function() {
    console.log('[CALLSAFE WIDGET] End call requested');
    
    if (!this.state.isActive) {
      console.log('[CALLSAFE WIDGET] No active call to end');
      return;
    }
    
    console.log('[CALLSAFE WIDGET] Sending end call event');
    // Send end call event
    if (this.state.socket && this.state.callAttemptId) {
      this.state.socket.emit('call:end', {
        callAttemptId: this.state.callAttemptId,
        initiator: 'customer',
        reason: 'user_action',
        timestamp: Date.now()
      });
      console.log('[CALLSAFE WIDGET] End call event sent');
    }
    
    console.log('[CALLSAFE WIDGET] Starting cleanup');
    this.cleanup();
  };
  
  // Handle call failures
  CallSafeWidget.handleCallFailure = function(message) {
    console.log('[CALLSAFE WIDGET] Handling call failure:', message);
    this.updateStatus(message);
    
    console.log('[CALLSAFE WIDGET] Scheduling cleanup in 3 seconds');
    setTimeout(() => {
      console.log('[CALLSAFE WIDGET] Executing scheduled cleanup after failure');
      this.cleanup();
    }, 3000);
  };
  
  // Cleanup resources
  CallSafeWidget.cleanup = function() {
    console.log('[CALLSAFE WIDGET] Starting resource cleanup');
    
    // Stop media streams
    if (this.state.webrtc?.localStream) {
      console.log('[CALLSAFE WIDGET] Stopping local media streams');
      this.state.webrtc.localStream.getTracks().forEach(track => {
        console.log('[CALLSAFE WIDGET] Stopping track:', track.kind);
        track.stop();
      });
    }
    
    // Close peer connection
    if (this.state.webrtc?.peerConnection) {
      console.log('[CALLSAFE WIDGET] Closing peer connection');
      this.state.webrtc.peerConnection.close();
    }
    
    // Disconnect socket
    if (this.state.socket) {
      console.log('[CALLSAFE WIDGET] Disconnecting socket');
      this.state.socket.disconnect();
      this.state.socket = null;
    }
    
    // Reset state
    console.log('[CALLSAFE WIDGET] Resetting widget state');
    this.state = {
      callAttemptId: null,
      isActive: false,
      webrtc: null,
      socket: null
    };
    
    // Hide modal
    console.log('[CALLSAFE WIDGET] Hiding modal');
    this.hideModal();
    
    console.log('[CALLSAFE WIDGET] Cleanup complete');
  };
  
  // Toggle mute
  CallSafeWidget.toggleMute = function() {
    if (!this.state.webrtc?.localStream) return;
    
    const audioTracks = this.state.webrtc.localStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    
    const muteButton = document.getElementById('callsafe-mute');
    muteButton.textContent = audioTracks[0]?.enabled ? 'Mute' : 'Unmute';
  };
  
  // UI helpers
  CallSafeWidget.showModal = function() {
    const modal = document.getElementById('callsafe-modal');
    modal.style.display = 'flex';
  };
  
  CallSafeWidget.hideModal = function() {
    const modal = document.getElementById('callsafe-modal');
    modal.style.display = 'none';
  };
  
  CallSafeWidget.updateStatus = function(message) {
    const status = document.getElementById('callsafe-status');
    status.textContent = message;
  };
  
  // Utility functions
  CallSafeWidget.generateUUID = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  
  CallSafeWidget.playRemoteAudio = function(stream) {
    let audioElement = document.getElementById('callsafe-audio');
    if (!audioElement) {
      audioElement = document.createElement('audio');
      audioElement.id = 'callsafe-audio';
      audioElement.autoplay = true;
      audioElement.style.display = 'none';
      document.body.appendChild(audioElement);
    }
    audioElement.srcObject = stream;
  };
  
  CallSafeWidget.loadScript = function(src, callback) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    document.head.appendChild(script);
  };
  
  CallSafeWidget.handleError = function(type, error) {
    console.error('[CALLSAFE WIDGET] Error occurred:', type, error);
    
    let message = 'An error occurred. Please try again.';
    if (type === 'microphone_access_denied') {
      message = 'Please allow microphone access to make calls.';
      console.log('[CALLSAFE WIDGET] Microphone access denied error');
    }
    
    console.log('[CALLSAFE WIDGET] Updating status with error message:', message);
    this.updateStatus(message);
    this.state.isActive = false;
    
    console.log('[CALLSAFE WIDGET] Scheduling modal hide in 3 seconds');
    setTimeout(() => {
      console.log('[CALLSAFE WIDGET] Hiding modal after error timeout');
      this.hideModal();
    }, 3000);
  };
  
  // Load widget styles
  CallSafeWidget.loadStyles = function() {
    if (document.getElementById('callsafe-styles')) return;
    
    const styles = `
      .callsafe-widget {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .callsafe-button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 50px;
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transition: all 0.3s ease;
      }
      
      .callsafe-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
      }
      
      .callsafe-icon {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }
      
      .callsafe-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000000;
      }
      
      .callsafe-modal-content {
        background: white;
        border-radius: 12px;
        padding: 24px;
        text-align: center;
        min-width: 300px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      }
      
      .callsafe-status {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 20px;
        color: #333;
      }
      
      .callsafe-controls {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      
      .callsafe-control {
        padding: 10px 20px;
        border: 2px solid;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .callsafe-control.mute {
        background: #f8f9fa;
        border-color: #6c757d;
        color: #6c757d;
      }
      
      .callsafe-control.mute:hover {
        background: #6c757d;
        color: white;
      }
      
      .callsafe-control.end {
        background: #dc3545;
        border-color: #dc3545;
        color: white;
      }
      
      .callsafe-control.end:hover {
        background: #c82333;
        border-color: #c82333;
      }
      
      /* Dark theme */
      .callsafe-widget[data-theme="dark"] .callsafe-modal-content {
        background: #2d3748;
        color: white;
      }
      
      .callsafe-widget[data-theme="dark"] .callsafe-status {
        color: white;
      }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.id = 'callsafe-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  };
  
  // Auto-initialize on DOM load
  function initializeWidgets() {
    console.log('[CALLSAFE WIDGET] Initializing widgets on page');
    const widgets = document.querySelectorAll('[data-callsafe-widget]');
    console.log('[CALLSAFE WIDGET] Found', widgets.length, 'widget(s) to initialize');
    
    widgets.forEach((widget, index) => {
      console.log('[CALLSAFE WIDGET] Initializing widget', index + 1, 'of', widgets.length);
      CallSafeWidget.init(widget);
    });
    
    console.log('[CALLSAFE WIDGET] All widgets initialized');
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWidgets);
  } else {
    initializeWidgets();
  }
  
  // Expose to global scope for manual initialization
  window.CallSafeWidget = CallSafeWidget;
  
})();