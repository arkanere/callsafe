(function() {
    'use strict';
    
    // CallSafe Embed Widget (Native Implementation)
    class CallSafeWidget {
        constructor(config) {
            this.config = {
                handle: config.handle || '',
                sourceId: config.sourceId || '',
                baseUrl: config.baseUrl || 'https://callsafe.tech',
                signalingUrl: config.signalingUrl || 'https://tunnel.callsafe.tech'
            };
            
            this.widget = null;
            this.socket = null;
            this.peerConnection = null;
            this.localStream = null;
            this.remoteAudio = null;
            
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
            if (document.getElementById('callsafe-embed3-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'callsafe-embed3-styles';
            styles.textContent = `
                .callsafe-widget3 {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .callsafe-trigger3 {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #1e40af);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                }
                
                .callsafe-trigger3:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 25px rgba(59, 130, 246, 0.6);
                }
                
                .callsafe-trigger3.connecting {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    animation: pulse 2s infinite;
                }
                
                .callsafe-trigger3.connected {
                    background: linear-gradient(135deg, #10b981, #059669);
                }
                
                .callsafe-trigger3.failed {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                }
                
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                
                .callsafe-trigger3 svg {
                    width: 24px;
                    height: 24px;
                    fill: white;
                    transition: transform 0.3s ease;
                }
                
                .callsafe-spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-top: 2px solid white;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                
                .callsafe-controls {
                    position: absolute;
                    bottom: 75px;
                    right: 0;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
                    padding: 16px;
                    min-width: 200px;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(10px);
                    transition: all 0.3s ease;
                }
                
                .callsafe-controls.show {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }
                
                .callsafe-controls::after {
                    content: '';
                    position: absolute;
                    top: 100%;
                    right: 20px;
                    border: 8px solid transparent;
                    border-top-color: white;
                }
                
                .callsafe-status {
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: #374151;
                }
                
                .callsafe-buttons {
                    display: flex;
                    gap: 8px;
                }
                
                .callsafe-btn {
                    flex: 1;
                    padding: 8px 12px;
                    border: none;
                    border-radius: 8px;
                    font-size: 12px;
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
                
                .callsafe-trigger3:hover .callsafe-tooltip {
                    opacity: 1;
                    transform: translateY(0);
                }
                
                @media (max-width: 640px) {
                    .callsafe-widget3 {
                        bottom: 15px;
                        right: 15px;
                    }
                    
                    .callsafe-trigger3 {
                        width: 56px;
                        height: 56px;
                    }
                    
                    .callsafe-controls {
                        right: -8px;
                        min-width: 180px;
                    }
                }
            `;
            
            document.head.appendChild(styles);
        }
        
        createWidget() {
            this.widget = document.createElement('div');
            this.widget.className = 'callsafe-widget3';
            
            this.widget.innerHTML = `
                <button class="callsafe-trigger3" title="Start a call">
                    <svg class="callsafe-icon" viewBox="0 0 24 24">
                        <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    <div class="callsafe-spinner" style="display: none;"></div>
                    <div class="callsafe-tooltip">Start a call</div>
                </button>
                
                <div class="callsafe-controls">
                    <div class="callsafe-status">Connected</div>
                    <div class="callsafe-buttons">
                        <button class="callsafe-btn mute">Mute</button>
                        <button class="callsafe-btn end">End Call</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(this.widget);
            
            // Create hidden audio element for remote stream
            this.remoteAudio = document.createElement('audio');
            this.remoteAudio.autoplay = true;
            this.remoteAudio.style.display = 'none';
            document.body.appendChild(this.remoteAudio);
            
            this.bindEvents();
        }
        
        bindEvents() {
            const trigger = this.widget.querySelector('.callsafe-trigger3');
            const muteBtn = this.widget.querySelector('.callsafe-btn.mute');
            const endBtn = this.widget.querySelector('.callsafe-btn.end');
            
            trigger.addEventListener('click', () => this.handleTriggerClick());
            muteBtn.addEventListener('click', () => this.toggleMute());
            endBtn.addEventListener('click', () => this.endCall());
        }
        
        async handleTriggerClick() {
            if (this.callState.status === 'idle' || this.callState.status === 'failed') {
                await this.startCall();
            } else if (this.callState.status === 'connected' || this.callState.status === 'connecting') {
                this.endCall();
            }
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
                    this.updateCallState({ status: 'failed' });
                }
            });
            
            this.socket.on('answer', async (data) => {
                console.log('📥 Received answer from agent');
                try {
                    await this.peerConnection.setRemoteDescription(data.answer);
                    this.updateCallState({ status: 'connected' });
                } catch (error) {
                    console.error('Failed to set remote answer:', error);
                    this.updateCallState({ status: 'failed' });
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
                    error: 'No agents available' 
                });
            });
            
            this.socket.on('call_timeout', () => {
                this.updateCallState({ 
                    status: 'failed', 
                    error: 'Call timeout' 
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
                    this.updateCallState({ status: 'failed' });
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
                
                const muteBtn = this.widget.querySelector('.callsafe-btn.mute');
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
        }
        
        updateCallState(updates) {
            this.callState = { ...this.callState, ...updates };
            this.updateUI();
        }
        
        updateUI() {
            const trigger = this.widget.querySelector('.callsafe-trigger3');
            const icon = this.widget.querySelector('.callsafe-icon');
            const spinner = this.widget.querySelector('.callsafe-spinner');
            const controls = this.widget.querySelector('.callsafe-controls');
            const tooltip = this.widget.querySelector('.callsafe-tooltip');
            const status = this.widget.querySelector('.callsafe-status');
            
            // Reset classes
            trigger.className = 'callsafe-trigger3';
            
            switch (this.callState.status) {
                case 'idle':
                    trigger.title = 'Start a call';
                    tooltip.textContent = 'Start a call';
                    icon.style.display = 'block';
                    spinner.style.display = 'none';
                    controls.classList.remove('show');
                    break;
                    
                case 'connecting':
                    trigger.classList.add('connecting');
                    trigger.title = 'Connecting...';
                    tooltip.textContent = 'Connecting...';
                    icon.style.display = 'none';
                    spinner.style.display = 'block';
                    controls.classList.remove('show');
                    break;
                    
                case 'connected':
                    trigger.classList.add('connected');
                    trigger.title = 'Call in progress';
                    tooltip.textContent = 'Call in progress';
                    icon.style.display = 'block';
                    spinner.style.display = 'none';
                    controls.classList.add('show');
                    status.textContent = 'Connected to Agent';
                    break;
                    
                case 'failed':
                    trigger.classList.add('failed');
                    trigger.title = this.callState.error || 'Call failed - Click to retry';
                    tooltip.textContent = 'Call failed - Click to retry';
                    icon.style.display = 'block';
                    spinner.style.display = 'none';
                    controls.classList.remove('show');
                    
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
            // Handle page visibility changes
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.callState.status === 'connected') {
                    // Optionally pause/resume call based on visibility
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
            if (this.remoteAudio) {
                this.remoteAudio.remove();
            }
            const styles = document.getElementById('callsafe-embed3-styles');
            if (styles) {
                styles.remove();
            }
        }
    }
    
    // Auto-initialize widgets from script tags
    function initializeWidgets() {
        const scripts = document.querySelectorAll('script[src*="embed3.js"]');
        
        scripts.forEach(script => {
            const handle = script.getAttribute('data-handle');
            const sourceId = script.getAttribute('data-source-id');
            
            if (!handle) {
                console.warn('CallSafe embed3: data-handle attribute is required');
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
    window.CallSafeWidget3 = CallSafeWidget;
    
})();