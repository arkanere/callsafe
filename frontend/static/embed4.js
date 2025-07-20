(function() {
    'use strict';
    
    // CallSafe Embed Widget (Modal Version)
    class CallSafeWidget {
        constructor(config) {
            this.config = {
                handle: config.handle || '',
                sourceId: config.sourceId || '',
                baseUrl: config.baseUrl || 'https://callsafe.tech',
                signalingUrl: config.signalingUrl || 'https://tunnel.callsafe.tech'
            };
            
            this.widget = null;
            this.modal = null;
            this.socket = null;
            this.peerConnection = null;
            this.localStream = null;
            this.remoteAudio = null;
            this.isModalOpen = false;
            
            this.callState = {
                status: 'idle', // idle, connecting, connected, ended, failed
                callId: null,
                isMuted: false,
                isConnecting: false
            };
            
            this.init();
        }
        
        init() {
            this.createStyles();
            this.createWidget();
            this.setupEventListeners();
        }
        
        createStyles() {
            if (document.getElementById('callsafe-embed4-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'callsafe-embed4-styles';
            styles.textContent = `
                .callsafe-widget4 {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .callsafe-trigger4 {
                    height: 50px;
                    padding: 0 20px;
                    border-radius: 25px;
                    background: linear-gradient(135deg, #3b82f6, #1e40af);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    position: relative;
                }
                
                .callsafe-trigger4:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 25px rgba(59, 130, 246, 0.6);
                }
                
                .callsafe-trigger4.connecting {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    animation: pulse 2s infinite;
                }
                
                .callsafe-trigger4.connected {
                    background: linear-gradient(135deg, #10b981, #059669);
                }
                
                .callsafe-trigger4.failed {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                }
                
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                
                .callsafe-trigger4 svg {
                    width: 20px;
                    height: 20px;
                    fill: white;
                    transition: transform 0.3s ease;
                }
                
                .callsafe-text {
                    color: white;
                    font-size: 14px;
                    font-weight: 600;
                    text-decoration: none;
                    white-space: nowrap;
                }
                
                .callsafe-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.3s ease;
                }
                
                .callsafe-modal.show {
                    opacity: 1;
                    visibility: visible;
                }
                
                .callsafe-modal-content {
                    background: white;
                    border-radius: 16px;
                    width: 90%;
                    max-width: 400px;
                    max-height: 90vh;
                    overflow: hidden;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    transform: scale(0.9);
                    transition: transform 0.3s ease;
                    position: relative;
                }
                
                .callsafe-modal.show .callsafe-modal-content {
                    transform: scale(1);
                }
                
                .callsafe-modal-header {
                    padding: 24px 24px 0 24px;
                    text-align: center;
                }
                
                .callsafe-modal-title {
                    font-size: 24px;
                    font-weight: 700;
                    color: #1f2937;
                    margin-bottom: 8px;
                }
                
                .callsafe-modal-subtitle {
                    font-size: 14px;
                    color: #6b7280;
                    margin-bottom: 24px;
                }
                
                .callsafe-modal-body {
                    padding: 0 24px 24px 24px;
                }
                
                .callsafe-close {
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s ease;
                }
                
                .callsafe-close:hover {
                    background: rgba(0, 0, 0, 0.2);
                }
                
                .callsafe-close svg {
                    width: 16px;
                    height: 16px;
                    stroke: #666;
                    stroke-width: 2;
                    fill: none;
                }
                
                .callsafe-call-status {
                    text-align: center;
                    margin-bottom: 24px;
                }
                
                .callsafe-status-icon {
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    margin: 0 auto 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s ease;
                    position: relative;
                }
                
                .callsafe-status-icon.idle {
                    background: linear-gradient(135deg, #3b82f6, #1e40af);
                }
                
                .callsafe-status-icon.connecting {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    animation: pulse 2s infinite;
                }
                
                .callsafe-status-icon.connected {
                    background: linear-gradient(135deg, #10b981, #059669);
                }
                
                .callsafe-status-icon.failed {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                }
                
                .callsafe-status-icon svg {
                    width: 32px;
                    height: 32px;
                    fill: white;
                }
                
                .callsafe-spinner {
                    width: 24px;
                    height: 24px;
                    border: 3px solid rgba(255, 255, 255, 0.3);
                    border-top: 3px solid white;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    position: absolute;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                .callsafe-status {
                    font-size: 18px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 8px;
                }
                
                .callsafe-status-message {
                    font-size: 14px;
                    color: #6b7280;
                    margin-bottom: 16px;
                }
                
                .callsafe-start-btn {
                    width: 100%;
                    padding: 16px;
                    border: none;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #3b82f6, #1e40af);
                    color: white;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }
                
                .callsafe-start-btn:hover {
                    background: linear-gradient(135deg, #2563eb, #1d4ed8);
                    transform: translateY(-1px);
                }
                
                .callsafe-start-btn:disabled {
                    background: #9ca3af;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .callsafe-controls {
                    display: flex;
                    gap: 12px;
                    margin-top: 24px;
                }
                
                .callsafe-btn {
                    flex: 1;
                    padding: 12px 16px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .callsafe-btn.mute {
                    background: #f3f4f6;
                    color: #374151;
                }
                
                .callsafe-btn.mute:hover {
                    background: #e5e7eb;
                }
                
                .callsafe-btn.mute.active {
                    background: #ef4444;
                    color: white;
                }
                
                .callsafe-btn.end {
                    background: #ef4444;
                    color: white;
                }
                
                .callsafe-btn.end:hover {
                    background: #dc2626;
                }
                
                .callsafe-tooltip {
                    position: absolute;
                    bottom: 75px;
                    right: 0;
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    white-space: nowrap;
                    opacity: 0;
                    transform: translateY(10px);
                    transition: all 0.3s ease;
                    pointer-events: none;
                }
                
                .callsafe-tooltip::after {
                    content: '';
                    position: absolute;
                    top: 100%;
                    right: 20px;
                    border: 4px solid transparent;
                    border-top-color: rgba(0, 0, 0, 0.8);
                }
                
                .callsafe-trigger4:hover .callsafe-tooltip {
                    opacity: 1;
                    transform: translateY(0);
                }
                
                @media (max-width: 640px) {
                    .callsafe-widget4 {
                        bottom: 15px;
                        right: 15px;
                    }
                    
                    .callsafe-trigger4 {
                        width: 56px;
                        height: 56px;
                    }
                    
                    .callsafe-modal-content {
                        width: 95%;
                        max-width: 350px;
                    }
                    
                    .callsafe-modal-header {
                        padding: 20px 20px 0 20px;
                    }
                    
                    .callsafe-modal-body {
                        padding: 0 20px 20px 20px;
                    }
                }
            `;
            
            document.head.appendChild(styles);
        }
        
        createWidget() {
            // Create trigger button
            this.widget = document.createElement('div');
            this.widget.className = 'callsafe-widget4';
            
            this.widget.innerHTML = `
                <button class="callsafe-trigger4" title="Start a call">
                    <svg class="callsafe-icon" viewBox="0 0 24 24">
                        <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    <span class="callsafe-text">Call Anonymously</span>
                    <div class="callsafe-tooltip">Start a call</div>
                </button>
            `;
            
            document.body.appendChild(this.widget);
            
            // Create modal
            this.createModal();
            
            // Create hidden audio element for remote stream
            this.remoteAudio = document.createElement('audio');
            this.remoteAudio.autoplay = true;
            this.remoteAudio.style.display = 'none';
            document.body.appendChild(this.remoteAudio);
            
            this.bindEvents();
        }
        
        createModal() {
            this.modal = document.createElement('div');
            this.modal.className = 'callsafe-modal';
            
            this.modal.innerHTML = `
                <div class="callsafe-modal-content">
                    <button class="callsafe-close" title="Close">
                        <svg viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                    
                    <div class="callsafe-modal-header">
                        <h2 class="callsafe-modal-title">CallSafe</h2>
                        <p class="callsafe-modal-subtitle">Anonymous Business Calling</p>
                    </div>
                    
                    <div class="callsafe-modal-body">
                        <div class="callsafe-call-status">
                            <div class="callsafe-status-icon idle">
                                <svg viewBox="0 0 24 24">
                                    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                                </svg>
                                <div class="callsafe-spinner" style="display: none;"></div>
                            </div>
                            <div class="callsafe-status">Ready to Call</div>
                            <div class="callsafe-status-message">Click the button below to start your call</div>
                        </div>
                        
                        <button class="callsafe-start-btn">
                            <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
                                <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                            </svg>
                            Start Call
                        </button>
                        
                        <div class="callsafe-controls" style="display: none;">
                            <button class="callsafe-btn mute">Mute</button>
                            <button class="callsafe-btn end">End Call</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(this.modal);
        }
        
        bindEvents() {
            const trigger = this.widget.querySelector('.callsafe-trigger4');
            const closeBtn = this.modal.querySelector('.callsafe-close');
            const startBtn = this.modal.querySelector('.callsafe-start-btn');
            const muteBtn = this.modal.querySelector('.callsafe-btn.mute');
            const endBtn = this.modal.querySelector('.callsafe-btn.end');
            
            trigger.addEventListener('click', () => this.openModal());
            closeBtn.addEventListener('click', () => this.closeModal());
            startBtn.addEventListener('click', () => this.handleStartCall());
            muteBtn.addEventListener('click', () => this.toggleMute());
            endBtn.addEventListener('click', () => this.endCall());
            
            // Close modal when clicking overlay
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.closeModal();
                }
            });
        }
        
        openModal() {
            this.isModalOpen = true;
            document.body.style.overflow = 'hidden';
            this.modal.classList.add('show');
            
            // Focus management for accessibility
            setTimeout(() => {
                const startBtn = this.modal.querySelector('.callsafe-start-btn');
                if (startBtn && !startBtn.disabled) {
                    startBtn.focus();
                }
            }, 100);
        }
        
        closeModal() {
            if (this.callState.status === 'connecting' || this.callState.status === 'connected') {
                // Don't close modal during active call
                return;
            }
            
            this.isModalOpen = false;
            document.body.style.overflow = '';
            this.modal.classList.remove('show');
            
            // Return focus to trigger button
            const trigger = this.widget.querySelector('.callsafe-trigger4');
            if (trigger) trigger.focus();
        }
        
        async handleStartCall() {
            if (this.callState.isConnecting) return;
            
            await this.startCall();
        }
        
        async startCall() {
            if (this.callState.isConnecting) return;
            
            try {
                this.updateCallState({ status: 'connecting', isConnecting: true });
                
                // Request microphone access
                await this.initializeMedia();
                
                // Connect to signaling server
                await this.connectToSignaling();
                
                // Register as customer
                this.registerAsCustomer();
                
            } catch (error) {
                console.error('Failed to start call:', error);
                this.updateCallState({ 
                    status: 'failed', 
                    isConnecting: false,
                    error: error.message 
                });
            }
        }
        
        async initializeMedia() {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: true, 
                    video: false 
                });
                console.log('✅ Microphone access granted');
            } catch (error) {
                throw new Error('Please allow microphone access to make calls');
            }
        }
        
        connectToSignaling() {
            return new Promise((resolve, reject) => {
                try {
                    // Use Socket.IO library if available, otherwise fallback to WebSocket
                    if (window.io) {
                        this.socket = window.io(this.config.signalingUrl, {
                            autoConnect: true,
                            timeout: 10000,
                            transports: ['websocket', 'polling']
                        });
                    } else {
                        // Load Socket.IO dynamically
                        this.loadSocketIO().then(() => {
                            this.socket = window.io(this.config.signalingUrl, {
                                autoConnect: true,
                                timeout: 10000,
                                transports: ['websocket', 'polling']
                            });
                            this.setupSocketHandlers(resolve, reject);
                        }).catch(reject);
                        return;
                    }
                    
                    this.setupSocketHandlers(resolve, reject);
                } catch (error) {
                    reject(new Error('Failed to connect to call service'));
                }
            });
        }
        
        loadSocketIO() {
            return new Promise((resolve, reject) => {
                if (window.io) {
                    resolve();
                    return;
                }
                
                const script = document.createElement('script');
                script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load Socket.IO'));
                document.head.appendChild(script);
            });
        }
        
        setupSocketHandlers(resolve, reject) {
            this.socket.on('connect', () => {
                console.log('✅ Connected to signaling server');
                resolve();
            });
            
            this.socket.on('connect_error', (error) => {
                reject(new Error('Connection failed'));
            });
            
            this.socket.on('call_accepted', async (data) => {
                console.log('🎉 Call accepted by agent');
                try {
                    this.callState.callId = data.callId;
                    await this.createPeerConnection();
                    const offer = await this.createOffer();
                    this.socket.emit('offer', {
                        callId: data.callId,
                        offer: offer,
                        handle: this.config.handle,
                        sourceId: this.config.sourceId
                    });
                } catch (error) {
                    console.error('Failed to create offer:', error);
                    this.updateCallState({ status: 'failed', error: 'Failed to create call offer' });
                }
            });
            
            this.socket.on('answer', async (data) => {
                console.log('📥 Received answer from agent');
                try {
                    await this.peerConnection.setRemoteDescription(data.answer);
                    this.updateCallState({ status: 'connected' });
                } catch (error) {
                    console.error('Failed to set remote answer:', error);
                    this.updateCallState({ status: 'failed', error: 'Failed to connect to agent' });
                }
            });
            
            this.socket.on('ice_candidate', async (data) => {
                try {
                    await this.peerConnection.addIceCandidate(data.candidate);
                } catch (error) {
                    console.error('Failed to add ICE candidate:', error);
                }
            });
            
            this.socket.on('no_agents_available', () => {
                this.updateCallState({ 
                    status: 'failed', 
                    error: 'No agents available. Please try again later.' 
                });
            });
            
            this.socket.on('call_timeout', () => {
                this.updateCallState({ 
                    status: 'failed', 
                    error: 'Call timeout. Please try again.' 
                });
            });
            
            this.socket.on('call_disconnected', () => {
                this.updateCallState({ status: 'ended' });
            });
        }
        
        registerAsCustomer() {
            this.socket.emit('customer_connect_with_handle', {
                handle: this.config.handle,
                sourceId: this.config.sourceId
            });
        }
        
        async createPeerConnection() {
            const iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ];
            
            this.peerConnection = new RTCPeerConnection({
                iceServers: iceServers,
                iceCandidatePoolSize: 10
            });
            
            // Add local stream
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                console.log('📺 Remote stream received');
                this.remoteAudio.srcObject = event.streams[0];
            };
            
            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.callState.callId) {
                    this.socket.emit('ice_candidate', {
                        callId: this.callState.callId,
                        candidate: event.candidate,
                        handle: this.config.handle,
                        sourceId: this.config.sourceId
                    });
                }
            };
            
            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                console.log('WebRTC connection state:', state);
                
                if (state === 'connected') {
                    this.updateCallState({ status: 'connected' });
                } else if (state === 'failed' || state === 'disconnected') {
                    this.updateCallState({ status: 'failed', error: 'Connection lost' });
                }
            };
        }
        
        async createOffer() {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            return offer;
        }
        
        toggleMute() {
            if (!this.localStream) return;
            
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.callState.isMuted = !audioTrack.enabled;
                
                const muteBtn = this.modal.querySelector('.callsafe-btn.mute');
                muteBtn.textContent = this.callState.isMuted ? 'Unmute' : 'Mute';
                muteBtn.classList.toggle('active', this.callState.isMuted);
            }
        }
        
        endCall() {
            if (this.socket) {
                if (this.callState.callId) {
                    this.socket.emit('call_ended', {
                        callId: this.callState.callId,
                        handle: this.config.handle,
                        sourceId: this.config.sourceId
                    });
                }
                this.socket.disconnect();
                this.socket = null;
            }
            
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            
            this.updateCallState({ 
                status: 'idle', 
                callId: null, 
                isMuted: false,
                isConnecting: false 
            });
            
            // Close modal after call ends
            setTimeout(() => {
                this.closeModal();
            }, 1000);
        }
        
        updateCallState(updates) {
            this.callState = { ...this.callState, ...updates };
            this.updateUI();
        }
        
        updateUI() {
            const trigger = this.widget.querySelector('.callsafe-trigger4');
            const tooltip = this.widget.querySelector('.callsafe-tooltip');
            
            // Modal elements
            const statusIcon = this.modal.querySelector('.callsafe-status-icon');
            const statusText = this.modal.querySelector('.callsafe-status');
            const statusMessage = this.modal.querySelector('.callsafe-status-message');
            const startBtn = this.modal.querySelector('.callsafe-start-btn');
            const controls = this.modal.querySelector('.callsafe-controls');
            const iconSvg = statusIcon.querySelector('svg');
            const spinner = statusIcon.querySelector('.callsafe-spinner');
            
            // Reset classes
            trigger.className = 'callsafe-trigger4';
            statusIcon.className = 'callsafe-status-icon';
            
            switch (this.callState.status) {
                case 'idle':
                    // Trigger button
                    trigger.title = 'Start a call';
                    tooltip.textContent = 'Start a call';
                    
                    // Modal
                    statusIcon.classList.add('idle');
                    statusText.textContent = 'Ready to Call';
                    statusMessage.textContent = 'Click the button below to start your call';
                    startBtn.style.display = 'block';
                    startBtn.disabled = false;
                    startBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
                            <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                        </svg>
                        Start Call
                    `;
                    controls.style.display = 'none';
                    iconSvg.style.display = 'block';
                    spinner.style.display = 'none';
                    break;
                    
                case 'connecting':
                    // Trigger button
                    trigger.classList.add('connecting');
                    trigger.title = 'Connecting...';
                    tooltip.textContent = 'Connecting...';
                    
                    // Modal
                    statusIcon.classList.add('connecting');
                    statusText.textContent = 'Connecting...';
                    statusMessage.textContent = 'Looking for available agent';
                    startBtn.disabled = true;
                    startBtn.innerHTML = `
                        <div class="callsafe-spinner"></div>
                        Connecting...
                    `;
                    controls.style.display = 'none';
                    iconSvg.style.display = 'none';
                    spinner.style.display = 'block';
                    break;
                    
                case 'connected':
                    // Trigger button
                    trigger.classList.add('connected');
                    trigger.title = 'Call in progress';
                    tooltip.textContent = 'Call in progress';
                    
                    // Modal
                    statusIcon.classList.add('connected');
                    statusText.textContent = 'Connected to Agent';
                    statusMessage.textContent = 'You are now speaking with an agent';
                    startBtn.style.display = 'none';
                    controls.style.display = 'flex';
                    iconSvg.style.display = 'block';
                    spinner.style.display = 'none';
                    break;
                    
                case 'failed':
                    // Trigger button
                    trigger.classList.add('failed');
                    trigger.title = this.callState.error || 'Call failed';
                    tooltip.textContent = 'Call failed - Try again';
                    
                    // Modal
                    statusIcon.classList.add('failed');
                    statusText.textContent = 'Call Failed';
                    statusMessage.textContent = this.callState.error || 'Unable to connect. Please try again.';
                    startBtn.style.display = 'block';
                    startBtn.disabled = false;
                    startBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
                            <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                        </svg>
                        Try Again
                    `;
                    controls.style.display = 'none';
                    iconSvg.style.display = 'block';
                    spinner.style.display = 'none';
                    
                    // Auto-reset to idle after 3 seconds
                    setTimeout(() => {
                        if (this.callState.status === 'failed') {
                            this.updateCallState({ status: 'idle' });
                        }
                    }, 3000);
                    break;
                    
                case 'ended':
                    this.updateCallState({ status: 'idle' });
                    break;
            }
        }
        
        setupEventListeners() {
            // Handle escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isModalOpen) {
                    this.closeModal();
                }
            });
            
            // Handle page unload
            window.addEventListener('beforeunload', () => {
                if (this.callState.status !== 'idle') {
                    this.endCall();
                }
            });
        }
        
        destroy() {
            this.endCall();
            if (this.widget) {
                this.widget.remove();
            }
            if (this.modal) {
                this.modal.remove();
            }
            if (this.remoteAudio) {
                this.remoteAudio.remove();
            }
            const styles = document.getElementById('callsafe-embed4-styles');
            if (styles) {
                styles.remove();
            }
        }
    }
    
    // Auto-initialize widgets from script tags
    function initializeWidgets() {
        const scripts = document.querySelectorAll('script[src*="embed4.js"]');
        
        scripts.forEach(script => {
            const handle = script.getAttribute('data-handle');
            const sourceId = script.getAttribute('data-source-id');
            
            if (!handle) {
                console.warn('CallSafe embed4: data-handle attribute is required');
                return;
            }
            
            // Prevent multiple widgets from the same script
            if (script.dataset.initialized) return;
            script.dataset.initialized = 'true';
            
            new CallSafeWidget({
                handle: handle,
                sourceId: sourceId || '',
                baseUrl: script.getAttribute('data-base-url') || 'https://callsafe.tech',
                signalingUrl: script.getAttribute('data-signaling-url') || 'https://tunnel.callsafe.tech'
            });
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeWidgets);
    } else {
        initializeWidgets();
    }
    
    // Expose CallSafeWidget for manual initialization
    window.CallSafeWidget4 = CallSafeWidget;
    
})();