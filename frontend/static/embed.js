(function() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  
  class CallSafeClient {
    constructor(serverUrl, handle, widgetId) {
      this.socket = null;
      this.peerConnection = null;
      this.localStream = null;
      this.isConnected = false;
      this.callId = null;
      this.isMuted = false;
      this.callState = 'idle';
      this.serverUrl = serverUrl;
      this.handle = handle;
      this.widgetId = widgetId;
      this.modalId = widgetId + '-modal';
    }
    
    async connect() {
      if (typeof io === 'undefined') {
        await this.loadSocketIO();
      }
      
      return new Promise((resolve, reject) => {
        this.socket = io(this.serverUrl, {
          transports: ['websocket', 'polling']
        });
        
        this.socket.on('connect', () => {
          this.isConnected = true;
          this.setupSocketHandlers();
          resolve();
        });
        
        this.socket.on('connect_error', (error) => {
          reject(error);
        });
      });
    }
    
    async loadSocketIO() {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    
    setupSocketHandlers() {
      this.socket.on('call_accepted', async (data) => {
        this.callId = data.callId;
        this.updateStatus('Creating connection...', 'connecting');
        
        try {
          const offer = await this.createOffer();
          this.socket.emit('offer', { callId: this.callId, offer });
        } catch (error) {
          this.updateStatus('Connection failed', 'failed');
        }
      });
      
      this.socket.on('answer', async (data) => {
        try {
          await this.peerConnection.setRemoteDescription(data.answer);
        } catch (error) {
          this.updateStatus('Connection failed', 'failed');
        }
      });
      
      this.socket.on('ice_candidate', async (data) => {
        try {
          await this.peerConnection.addIceCandidate(data.candidate);
        } catch (error) {
          // Silently handle ICE candidate errors
        }
      });
      
      this.socket.on('no_agents_available', () => {
        this.updateStatus('No agents available', 'failed');
      });
      
      this.socket.on('call_timeout', () => {
        this.updateStatus('Call timeout', 'failed');
      });
      
      this.socket.on('call_ended', () => {
        this.updateStatus('Call ended', 'ended');
        this.hideCallControls();
      });
    }
    
    async initializeMedia() {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return true;
      } catch (error) {
        throw new Error('Microphone access denied');
      }
    }
    
    async createOffer() {
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket.emit('ice_candidate', { callId: this.callId, candidate: event.candidate });
        }
      };
      
      this.peerConnection.ontrack = (event) => {
        const remoteAudio = document.createElement('audio');
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        remoteAudio.style.display = 'none';
        document.body.appendChild(remoteAudio);
      };
      
      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection.connectionState === 'connected') {
          this.updateStatus('Connected to agent', 'connected');
        } else if (this.peerConnection.connectionState === 'failed') {
          this.updateStatus('Connection failed', 'failed');
        }
      };
      
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      return offer;
    }
    
    async startCall() {
      try {
        this.updateStatus('Requesting microphone...', 'connecting');
        await this.initializeMedia();
        
        this.updateStatus('Connecting to service...', 'connecting');
        await this.connect();
        
        this.updateStatus('Looking for agent...', 'connecting');
        this.socket.emit('customer_connect_with_handle', { handle: this.handle });
        
        this.callState = 'connecting';
        this.showCallControls();
        
      } catch (error) {
        this.updateStatus('Connection failed: ' + error.message, 'failed');
      }
    }
    
    toggleMute() {
      if (this.localStream) {
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !audioTrack.enabled;
          this.isMuted = !audioTrack.enabled;
          
          const muteBtn = document.getElementById(this.modalId + '-mute-btn');
          if (muteBtn) {
            muteBtn.textContent = this.isMuted ? 'Unmute' : 'Mute';
            muteBtn.style.backgroundColor = this.isMuted ? '#dc2626' : '#6b7280';
          }
        }
      }
    }
    
    endCall() {
      if (this.socket) {
        this.socket.emit('call_ended');
        setTimeout(() => {
          this.socket.disconnect();
        }, 100);
      }
      
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }
      
      if (this.peerConnection) {
        this.peerConnection.close();
      }
      
      this.updateStatus('Call ended', 'ended');
      this.hideCallControls();
    }
    
    updateStatus(message, state) {
      const statusEl = document.getElementById(this.modalId + '-status');
      const iconEl = document.getElementById(this.modalId + '-icon');
      
      if (statusEl) statusEl.textContent = message;
      
      if (iconEl) {
        iconEl.setAttribute('class', 'callsafe-icon ' + (state || ''));
      }
    }
    
    showCallControls() {
      const controls = document.getElementById(this.modalId + '-call-controls');
      if (controls) controls.style.display = 'block';
    }
    
    hideCallControls() {
      const controls = document.getElementById(this.modalId + '-call-controls');
      if (controls) controls.style.display = 'none';
    }
  }
  
  window.CallSafeClient = CallSafeClient;
  
  function createWidgetHTML(widgetId, modalId) {
    return `
      <button type="button" class="callsafe-widget-button">
        📞 Call Us Anonymously
      </button>
      <div id="${modalId}" class="callsafe-modal">
        <div class="callsafe-modal-content">
          <div class="callsafe-modal-header">
            <h3 class="callsafe-modal-title">Anonymous Call</h3>
            <p id="${modalId}-status" class="callsafe-modal-status">Ready to connect</p>
          </div>
          
          <div class="callsafe-modal-body">
            <div class="callsafe-icon-container">
              <svg id="${modalId}-icon" class="callsafe-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            
            <div id="${modalId}-call-controls" class="callsafe-call-controls">
              <button id="${modalId}-mute-btn" type="button" class="callsafe-mute-btn">
                Mute
              </button>
              <button id="${modalId}-end-btn" type="button" class="callsafe-end-btn">
                End Call
              </button>
            </div>
          </div>
          
          <div class="callsafe-modal-footer">
            <button type="button" class="callsafe-cancel-btn" onclick="document.getElementById('${modalId}').style.display='none'">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  function initializeWidget(widget, serverUrl, handle) {
    const widgetId = widget.id;
    const modalId = widgetId + '-modal';
    
    widget.innerHTML = createWidgetHTML(widgetId, modalId);
    
    const button = widget.querySelector('.callsafe-widget-button');
    const modal = document.getElementById(modalId);
    const muteBtn = document.getElementById(modalId + '-mute-btn');
    const endBtn = document.getElementById(modalId + '-end-btn');
    
    const callSafe = new CallSafeClient(serverUrl, handle, widgetId);
    
    button.addEventListener('click', function(e) {
      e.preventDefault();
      modal.style.display = 'flex';
      callSafe.startCall();
    });
    
    muteBtn.addEventListener('click', function() {
      callSafe.toggleMute();
    });
    
    endBtn.addEventListener('click', function() {
      callSafe.endCall();
    });
    
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
    
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
      }
    });
  }
  
  function autoInit() {
    const widgets = document.querySelectorAll('[data-callsafe-widget]');
    widgets.forEach(widget => {
      const handle = widget.dataset.handle;
      const serverUrl = widget.dataset.server || 'https://tunnel.callsafe.tech';
      
      if (handle) {
        initializeWidget(widget, serverUrl, handle);
      }
    });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})();