(function() {
    'use strict';
    
    // CallSafe Multi-Device Aware Widget
    class MultiDeviceCallWidget {
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
            
            // Multi-device state
            this.handleState = {
                devices: { android: null, web: null },
                callState: { status: 'available' },
                lastUpdated: null
            };
            
            // Timer variables
            this.currentCallStartTime = null;
            this.callDuration = 0;
            this.durationInterval = null;
            
            this.callState = {
                status: 'idle', // idle, checking, connecting, connected, ended, failed
                callId: null,
                isMuted: false,
                isConnecting: false,
                error: null
            };
            
            this.init();
        }
        
        init() {
            this.createStyles();
            this.createWidget();
            this.setupEventListeners();
        }
        
        createStyles() {
            if (document.getElementById('callsafe-embed5-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'callsafe-embed5-styles';
            styles.textContent = `
                .callsafe-widget5 {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .callsafe-trigger5 {
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
                
                .callsafe-trigger5:hover {
                    transform: scale(1.05);
                    box-shadow: 0 6px 25px rgba(59, 130, 246, 0.6);
                }
                
                .callsafe-trigger5.checking {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    animation: pulse 2s infinite;
                }
                
                .callsafe-trigger5.connecting {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    animation: pulse 2s infinite;
                }
                
                .callsafe-trigger5.connected {
                    background: linear-gradient(135deg, #10b981, #059669);
                }
                
                .callsafe-trigger5.failed {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                }
                
                .callsafe-trigger5.busy {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    cursor: not-allowed;
                }
                
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                
                .callsafe-trigger5 svg {
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
                    max-width: 420px;
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
                
                .callsafe-timer {
                    font-size: 24px;
                    font-weight: bold;
                    color: #10b981;
                    margin: 8px 0;
                    font-family: 'Courier New', monospace;
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
                
                .callsafe-status-icon.checking {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    animation: pulse 2s infinite;
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
                
                .callsafe-status-icon.busy {
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
                
                .callsafe-device-info {
                    background: #f8fafc;
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 16px;
                    border-left: 4px solid #3b82f6;
                }
                
                .callsafe-device-info-title {
                    font-size: 12px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 4px;
                }
                
                .callsafe-device-info-text {
                    font-size: 11px;
                    color: #6b7280;
                    line-height: 1.4;
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
                
                .callsafe-retry-btn {
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
                
                .callsafe-retry-btn:hover {
                    background: linear-gradient(135deg, #2563eb, #1d4ed8);
                    transform: translateY(-1px);
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
                
                @media (max-width: 640px) {
                    .callsafe-widget5 {
                        bottom: 15px;
                        right: 15px;
                    }
                    
                    .callsafe-trigger5 {
                        height: 44px;
                        padding: 0 12px;
                        border-radius: 22px;
                        gap: 6px;
                    }
                    
                    .callsafe-trigger5 svg {
                        width: 16px;
                        height: 16px;
                    }
                    
                    .callsafe-text {
                        font-size: 12px;
                    }
                    
                    .callsafe-modal-content {
                        width: 95%;
                        max-width: 350px;
                    }
                }
            `;
            
            document.head.appendChild(styles);
        }
        
        createWidget() {
            // Create trigger button
            this.widget = document.createElement('div');
            this.widget.className = 'callsafe-widget5';
            
            this.widget.innerHTML = `
                <button class="callsafe-trigger5">
                    <svg class="callsafe-icon" viewBox="0 0 24 24">
                        <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    <span class="callsafe-text">Call Now</span>
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
                        <p class="callsafe-modal-subtitle">Secure Business Communication</p>
                    </div>
                    
                    <div class="callsafe-modal-body">
                        <div class="callsafe-device-info" style="display: none;">
                            <div class="callsafe-device-info-title">Multi-Device Support</div>
                            <div class="callsafe-device-info-text">This business can receive calls on mobile app and web. Your call will be answered on the first available device.</div>
                        </div>
                        
                        <div class="callsafe-call-status">
                            <div class="callsafe-status-icon idle">
                                <svg viewBox="0 0 24 24">
                                    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                                </svg>
                                <div class="callsafe-spinner" style="display: none;"></div>
                            </div>
                            <div class="callsafe-status">Ready to Call</div>
                            <div class="callsafe-status-message">Click to start your call</div>
                            <div class="callsafe-timer" style="display: none;">00:00</div>
                        </div>
                        
                        <button class="callsafe-start-btn">
                            <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
                                <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                            </svg>
                            Start Call
                        </button>
                        
                        <button class="callsafe-retry-btn" style="display: none;">
                            <svg viewBox="0 0 24 24" style="width: 20px; height: 20px; fill: currentColor;">
                                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            Try Again
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
            const trigger = this.widget.querySelector('.callsafe-trigger5');
            const closeBtn = this.modal.querySelector('.callsafe-close');
            const startBtn = this.modal.querySelector('.callsafe-start-btn');
            const retryBtn = this.modal.querySelector('.callsafe-retry-btn');
            const muteBtn = this.modal.querySelector('.callsafe-btn.mute');
            const endBtn = this.modal.querySelector('.callsafe-btn.end');
            
            trigger.addEventListener('click', () => this.handleTriggerClick());
            closeBtn.addEventListener('click', () => this.closeModal());
            startBtn.addEventListener('click', () => this.startCall());
            retryBtn.addEventListener('click', () => this.retryCall());
            muteBtn.addEventListener('click', () => this.toggleMute());
            endBtn.addEventListener('click', () => this.endCall());
            
            // Close modal when clicking overlay
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.closeModal();
                }
            });
        }
        
        async handleTriggerClick() {
            // First check if handle is busy
            await this.checkHandleStatus();
            
            // Open modal
            this.openModal();
        }
        
        async checkHandleStatus() {
            console.log('🔍 Checking handle status for:', this.config.handle);
            this.updateCallState({ status: 'checking' });
            
            try {
                // Try to get handle status from API
                const response = await fetch(`${this.config.baseUrl}/api/handle/${this.config.handle}/status`);
                
                if (response.ok) {
                    const data = await response.json();
                    this.handleState = data;
                    
                    console.log('📱 Handle state:', this.handleState);
                    
                    // Update UI based on handle state
                    if (this.handleState.callState.status === 'busy') {
                        this.updateCallState({ 
                            status: 'busy',
                            error: `Business is currently on another call (${this.handleState.callState.acceptedBy} device)`
                        });
                        return;
                    }
                    
                    // Show multi-device info if multiple devices available
                    const deviceCount = Object.keys(this.handleState.devices).filter(key => 
                        this.handleState.devices[key]?.online
                    ).length;
                    
                    if (deviceCount > 1) {
                        const deviceInfo = this.modal.querySelector('.callsafe-device-info');
                        if (deviceInfo) {
                            deviceInfo.style.display = 'block';
                        }
                    }
                    
                } else {
                    console.log('⚠️ Could not get handle status, proceeding with call');
                }
                
                this.updateCallState({ status: 'idle' });
                
            } catch (error) {
                console.log('⚠️ Error checking handle status:', error);
                this.updateCallState({ status: 'idle' });
            }
        }
        
        openModal() {
            this.isModalOpen = true;
            document.body.style.overflow = 'hidden';
            this.modal.classList.add('show');
            
            // Focus management for accessibility
            setTimeout(() => {
                const startBtn = this.modal.querySelector('.callsafe-start-btn');
                if (startBtn && startBtn.style.display !== 'none') {
                    startBtn.focus();
                }
            }, 100);
        }
        
        closeModal() {
            if (this.callState.status === 'connecting' || this.callState.status === 'connected') {
                // Don't close modal during active call
                return;
            }
            
            this.stopCallTimer();
            this.updateCallState({ 
                status: 'idle', 
                error: null, 
                isConnecting: false,
                callId: null 
            });
            
            this.isModalOpen = false;
            document.body.style.overflow = '';
            this.modal.classList.remove('show');
            
            // Return focus to trigger button
            const trigger = this.widget.querySelector('.callsafe-trigger5');
            if (trigger) trigger.focus();
        }
        
        async startCall() {
            if (this.callState.isConnecting) return;
            
            try {
                this.updateCallState({ 
                    status: 'connecting', 
                    isConnecting: true
                });
                
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
                    // Use Socket.IO library if available, otherwise load it
                    if (window.io) {
                        this.socket = window.io(this.config.signalingUrl, {
                            autoConnect: true,
                            timeout: 10000,
                            transports: ['websocket', 'polling']
                        });
                    } else {
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
            
            this.socket.on('call.state_changed', async (data) => {
                if (data.current?.phase === 'connecting') {
                console.log('🎉 Call accepted by agent');
                try {
                    this.callState.callId = data.callId;
                    await this.createPeerConnection();
                    const offer = await this.createOffer();
                    this.socket.emit('webrtc.offer', {
                        callId: data.callId,
                        offer: offer,
                        handle: this.config.handle,
                        sourceId: this.config.sourceId
                    });
                } catch (error) {
                    console.error('Failed to create offer:', error);
                    this.updateCallState({ 
                        status: 'failed', 
                        isConnecting: false, 
                        error: 'Failed to create call offer' 
                    });
                }
            });
            
            this.socket.on('webrtc.answer', async (data) => {
                console.log('📥 Received answer from agent');
                try {
                    await this.peerConnection.setRemoteDescription(data.answer);
                    this.updateCallState({ status: 'connected' });
                } catch (error) {
                    console.error('Failed to set remote answer:', error);
                    this.updateCallState({ 
                        status: 'failed', 
                        isConnecting: false, 
                        error: 'Failed to connect to agent' 
                    });
                }
            });
            
            this.socket.on('webrtc.ice_candidate', async (data) => {
                console.log('🧊 Received ICE candidate');
                try {
                    await this.peerConnection.addIceCandidate(data.candidate);
                } catch (error) {
                    console.error('Failed to add ICE candidate:', error);
                }
            });
            
            this.socket.on('call.terminated', () => {
                console.log('📞 Call ended by agent');
                this.updateCallState({ 
                    status: 'ended', 
                    isConnecting: false,
                    error: 'Call ended by agent'
                });
                this.cleanup();
            });
            
            this.socket.on('call.error', (data) => {
                if (data.code === 'CALL_TIMEOUT') {
                    console.log('⏰ Call timed out');
                    this.updateCallState({ 
                        status: 'failed', 
                        isConnecting: false,
                        error: 'No agent available. Please try again later.'
                    });
                    this.cleanup();
                }
            });
            
            this.socket.on('routing.no_agents', () => {
                console.log('👥 No agents available');
                this.updateCallState({ 
                    status: 'failed', 
                    isConnecting: false,
                    error: 'All representatives are currently busy. Please try again in a few minutes.'
                });
                this.cleanup();
            });
            
            this.socket.on('routing.handle_busy', (data) => {
                console.log('📞 Handle is busy:', data);
                this.updateCallState({ 
                    status: 'busy', 
                    isConnecting: false,
                    error: `Business is currently busy (${data.acceptedBy} device). Please try again later.`
                });
                this.cleanup();
            });
        }
        
        registerAsCustomer() {
            this.socket.emit('call.initiate', {
                handle: this.config.handle,
                sourceId: this.config.sourceId,
                callAttemptId: this.generateCallAttemptId()
            });
        }
        
        generateCallAttemptId() {
            return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        async createPeerConnection() {
            const iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ];
            
            this.peerConnection = new RTCPeerConnection({ iceServers });
            
            // Add local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }
            
            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                console.log('📺 Received remote stream');
                if (this.remoteAudio && event.streams[0]) {
                    this.remoteAudio.srcObject = event.streams[0];
                }
            };
            
            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.socket) {
                    this.socket.emit('webrtc.ice_candidate', {
                        callId: this.callState.callId,
                        candidate: event.candidate,
                        handle: this.config.handle,
                        sourceId: this.config.sourceId
                    });
                }
            };
            
            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                console.log('🔗 Connection state:', this.peerConnection.connectionState);
                
                if (this.peerConnection.connectionState === 'connected') {
                    this.updateCallState({ status: 'connected' });
                    this.startCallTimer();
                } else if (this.peerConnection.connectionState === 'failed' || 
                          this.peerConnection.connectionState === 'disconnected') {
                    this.updateCallState({ 
                        status: 'failed', 
                        isConnecting: false,
                        error: 'Connection failed'
                    });
                }
            };
        }
        
        async createOffer() {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            return offer;
        }
        
        startCallTimer() {
            this.currentCallStartTime = Date.now();
            this.durationInterval = setInterval(() => {
                this.callDuration = Math.floor((Date.now() - this.currentCallStartTime) / 1000);
                this.updateTimer();
            }, 1000);
        }
        
        stopCallTimer() {
            if (this.durationInterval) {
                clearInterval(this.durationInterval);
                this.durationInterval = null;
            }
            this.currentCallStartTime = null;
            this.callDuration = 0;
        }
        
        updateTimer() {
            const timer = this.modal.querySelector('.callsafe-timer');
            if (timer) {
                const minutes = Math.floor(this.callDuration / 60);
                const seconds = this.callDuration % 60;
                timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }
        
        toggleMute() {
            if (!this.localStream) return;
            
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.callState.isMuted = !audioTrack.enabled;
                
                const muteBtn = this.modal.querySelector('.callsafe-btn.mute');
                if (muteBtn) {
                    muteBtn.textContent = this.callState.isMuted ? 'Unmute' : 'Mute';
                    muteBtn.classList.toggle('active', this.callState.isMuted);
                }
            }
        }
        
        endCall() {
            if (this.socket && this.callState.callId) {
                this.socket.emit('call.terminate', {
                    callId: this.callState.callId,
                    handle: this.config.handle,
                    sourceId: this.config.sourceId
                });
            }
            
            this.updateCallState({ 
                status: 'ended', 
                isConnecting: false,
                error: 'Call ended'
            });
            
            this.cleanup();
            
            setTimeout(() => {
                this.closeModal();
            }, 2000);
        }
        
        retryCall() {
            this.cleanup();
            this.updateCallState({ 
                status: 'idle', 
                error: null, 
                isConnecting: false,
                callId: null 
            });
            this.startCall();
        }
        
        cleanup() {
            this.stopCallTimer();
            
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }
            
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
        }
        
        updateCallState(newState) {
            this.callState = { ...this.callState, ...newState };
            this.updateUI();
        }
        
        updateUI() {
            const trigger = this.widget.querySelector('.callsafe-trigger5');
            const statusIcon = this.modal.querySelector('.callsafe-status-icon');
            const status = this.modal.querySelector('.callsafe-status');
            const statusMessage = this.modal.querySelector('.callsafe-status-message');
            const startBtn = this.modal.querySelector('.callsafe-start-btn');
            const retryBtn = this.modal.querySelector('.callsafe-retry-btn');
            const controls = this.modal.querySelector('.callsafe-controls');
            const timer = this.modal.querySelector('.callsafe-timer');
            const spinner = this.modal.querySelector('.callsafe-spinner');
            
            // Update trigger button
            trigger.className = `callsafe-trigger5 ${this.callState.status}`;
            
            // Update status icon
            statusIcon.className = `callsafe-status-icon ${this.callState.status}`;
            
            // Update text content
            switch (this.callState.status) {
                case 'idle':
                    trigger.querySelector('.callsafe-text').textContent = 'Call Now';
                    status.textContent = 'Ready to Call';
                    statusMessage.textContent = 'Click to start your call';
                    startBtn.style.display = 'block';
                    retryBtn.style.display = 'none';
                    controls.style.display = 'none';
                    timer.style.display = 'none';
                    spinner.style.display = 'none';
                    break;
                    
                case 'checking':
                    trigger.querySelector('.callsafe-text').textContent = 'Checking...';
                    status.textContent = 'Checking Availability';
                    statusMessage.textContent = 'Checking if agents are available...';
                    startBtn.style.display = 'none';
                    retryBtn.style.display = 'none';
                    controls.style.display = 'none';
                    timer.style.display = 'none';
                    spinner.style.display = 'block';
                    break;
                    
                case 'connecting':
                    trigger.querySelector('.callsafe-text').textContent = 'Connecting...';
                    status.textContent = 'Connecting';
                    statusMessage.textContent = 'Finding an available agent...';
                    startBtn.style.display = 'none';
                    retryBtn.style.display = 'none';
                    controls.style.display = 'none';
                    timer.style.display = 'none';
                    spinner.style.display = 'block';
                    break;
                    
                case 'connected':
                    trigger.querySelector('.callsafe-text').textContent = 'Connected';
                    status.textContent = 'Connected';
                    statusMessage.textContent = 'You are now speaking with an agent';
                    startBtn.style.display = 'none';
                    retryBtn.style.display = 'none';
                    controls.style.display = 'flex';
                    timer.style.display = 'block';
                    spinner.style.display = 'none';
                    break;
                    
                case 'failed':
                    trigger.querySelector('.callsafe-text').textContent = 'Try Again';
                    status.textContent = 'Call Failed';
                    statusMessage.textContent = this.callState.error || 'Something went wrong';
                    startBtn.style.display = 'none';
                    retryBtn.style.display = 'block';
                    controls.style.display = 'none';
                    timer.style.display = 'none';
                    spinner.style.display = 'none';
                    break;
                    
                case 'ended':
                    trigger.querySelector('.callsafe-text').textContent = 'Call Again';
                    status.textContent = 'Call Ended';
                    statusMessage.textContent = 'Call has been terminated';
                    startBtn.style.display = 'none';
                    retryBtn.style.display = 'block';
                    controls.style.display = 'none';
                    timer.style.display = 'none';
                    spinner.style.display = 'none';
                    break;
                    
                case 'busy':
                    trigger.querySelector('.callsafe-text').textContent = 'Line Busy';
                    status.textContent = 'Line Busy';
                    statusMessage.textContent = this.callState.error || 'Business line is currently busy';
                    startBtn.style.display = 'none';
                    retryBtn.style.display = 'block';
                    controls.style.display = 'none';
                    timer.style.display = 'none';
                    spinner.style.display = 'none';
                    break;
            }
        }
        
        setupEventListeners() {
            // Handle page unload
            window.addEventListener('beforeunload', () => {
                this.cleanup();
            });
            
            // Handle visibility change
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.callState.status === 'connected') {
                    console.log('📱 Page hidden during call - maintaining connection');
                }
            });
        }
    }
    
    // Global initialization function
    window.initCallSafeWidget = function(config) {
        if (!config || !config.handle) {
            console.error('CallSafe Widget: handle is required');
            return;
        }
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                new MultiDeviceCallWidget(config);
            });
        } else {
            new MultiDeviceCallWidget(config);
        }
    };
    
    // Auto-initialize if config is provided in script tag
    const scriptTag = document.currentScript;
    if (scriptTag) {
        const handle = scriptTag.getAttribute('data-handle');
        const sourceId = scriptTag.getAttribute('data-source-id');
        const baseUrl = scriptTag.getAttribute('data-base-url');
        const signalingUrl = scriptTag.getAttribute('data-signaling-url');
        
        if (handle) {
            window.initCallSafeWidget({
                handle,
                sourceId,
                baseUrl,
                signalingUrl
            });
        }
    }
})();