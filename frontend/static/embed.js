(function() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  
  class CallSafeClient {
    constructor(serverUrl, handle) {
      this.socket = null;
      this.peerConnection = null;
      this.localStream = null;
      this.isConnected = false;
      this.callId = null;
      this.isMuted = false;
      this.callState = 'idle';
      this.serverUrl = serverUrl;
      this.handle = handle;
      this.modalId = null;
    }
    
    setModalId(modalId) {
      this.modalId = modalId;
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
        if (state === 'connecting') {
          iconEl.style.color = '#f59e0b';
        } else if (state === 'connected') {
          iconEl.style.color = '#10b981';
        } else if (state === 'failed') {
          iconEl.style.color = '#dc2626';
        }
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
  
  window.initCallSafeWidget = function(config) {
    const widget = document.querySelector('#' + config.uniqueId);
    const modal = document.querySelector('#' + config.modalId);
    
    if (!widget || !modal) return;
    
    const button = widget.querySelector('button');
    const muteBtn = document.getElementById(config.modalId + '-mute-btn');
    const endBtn = document.getElementById(config.modalId + '-end-btn');
    
    if (!button) return;
    
    const callSafe = new CallSafeClient(config.serverUrl, config.handle);
    callSafe.setModalId(config.modalId);
    
    button.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#1d4ed8';
    });
    
    button.addEventListener('mouseleave', function() {
      this.style.backgroundColor = '#2563eb';
    });
    
    button.addEventListener('click', function(e) {
      e.preventDefault();
      modal.style.display = 'flex';
      callSafe.startCall();
    });
    
    if (muteBtn) {
      muteBtn.addEventListener('click', function() {
        callSafe.toggleMute();
      });
    }
    
    if (endBtn) {
      endBtn.addEventListener('click', function() {
        callSafe.endCall();
      });
    }
    
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
  };
})();