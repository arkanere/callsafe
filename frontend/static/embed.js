(function() {
    'use strict';
    
    console.log('🚀 CallSafe Embed: Script started loading');
    
    // Prevent multiple initializations
    if (window.CallSafeEmbedLoaded) {
        console.log('⚠️ CallSafe Embed: Already loaded, skipping initialization');
        return;
    }
    window.CallSafeEmbedLoaded = true;
    console.log('✅ CallSafe Embed: Initialization flag set');
    
    // Configuration from script tag
    const script = document.currentScript || document.querySelector('script[data-handle]');
    console.log('🔍 CallSafe Embed: Script element found:', script);
    
    const handle = script?.getAttribute('data-handle');
    const sourceId = script?.getAttribute('data-source-id') || 'embed-widget';
    
    console.log('📋 CallSafe Embed: Configuration:', { handle, sourceId });
    
    if (!handle) {
        console.error('❌ CallSafe Embed: data-handle attribute is required');
        console.log('💡 CallSafe Embed: Make sure your script tag includes data-handle="your-handle"');
        return;
    }
    
    console.log('✅ CallSafe Embed: Handle validated, proceeding with initialization');
    
    // CallSafe configuration  
    const CALLSAFE_API_URL = 'https://callsafe.tech';
    const SIGNALING_SERVER = 'https://tunnel.callsafe.tech';
    console.log('🌐 CallSafe Embed: API URL set to:', CALLSAFE_API_URL);
    const WIDGET_ID = 'callsafe-widget-' + handle;
    const MODAL_ID = 'callsafe-modal-' + handle;
    
    // Prevent duplicate widgets
    if (document.getElementById(WIDGET_ID)) {
        console.log('⚠️ CallSafe Embed: Widget already exists, skipping creation');
        return;
    }
    console.log('✅ CallSafe Embed: No existing widget found, proceeding with creation');

    // Global state for the call
    let socket = null;
    let peerConnection = null;
    let localStream = null;
    let isCallActive = false;
    let callId = null;

    // CSS styles for the widget
    const widgetCSS = `
        .callsafe-widget {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .callsafe-button {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            border: none;
            border-radius: 50px;
            padding: 16px 24px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
            text-decoration: none;
        }
        
        .callsafe-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
            background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
        }
        
        .callsafe-button:active {
            transform: translateY(0);
        }
        
        .callsafe-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.75);
            z-index: 1000000;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .callsafe-modal.show {
            display: flex;
        }
        
        .callsafe-modal-content {
            background: white;
            border-radius: 16px;
            width: 90%;
            max-width: 400px;
            max-height: 90vh;
            overflow: hidden;
            position: relative;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .callsafe-modal-header {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .callsafe-close {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s ease;
        }
        
        .callsafe-close:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        .callsafe-call-interface {
            padding: 30px;
            text-align: center;
        }
        
        .callsafe-status {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #374151;
        }
        
        .callsafe-status.connecting {
            color: #f59e0b;
        }
        
        .callsafe-status.connected {
            color: #10b981;
        }
        
        .callsafe-status.error {
            color: #ef4444;
        }
        
        .callsafe-start-btn {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border: none;
            border-radius: 12px;
            padding: 16px 32px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 10px;
        }
        
        .callsafe-start-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
        }
        
        .callsafe-end-btn {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            border: none;
            border-radius: 12px;
            padding: 16px 32px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin: 10px;
        }
        
        .callsafe-end-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
        }
        
        .callsafe-audio {
            display: none;
        }
        
        .callsafe-spinner {
            border: 3px solid #f3f4f6;
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: callsafe-spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes callsafe-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 480px) {
            .callsafe-modal-content {
                width: 95%;
                max-height: 95vh;
            }
            
            .callsafe-widget {
                bottom: 16px;
                right: 16px;
            }
            
            .callsafe-button {
                padding: 14px 20px;
                font-size: 15px;
            }
        }
    `;
    
    // Phone icon SVG
    const phoneIcon = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
        </svg>
    `;
    
    // Close icon SVG
    const closeIcon = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `;

    // Load Socket.IO dynamically
    function loadSocketIO() {
        return new Promise((resolve, reject) => {
            if (window.io) {
                resolve(window.io);
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
            script.onload = () => resolve(window.io);
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // WebRTC Configuration
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
                urls: 'turn:a.relay.metered.ca:80',
                username: '***REDACTED***',
                credential: 'AjJtOG9DbHp3OVZPK2ZG'
            }
        ]
    };

    // Initialize media (microphone)
    async function initializeMedia() {
        try {
            console.log('🎤 CallSafe Embed: Requesting microphone access');
            localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: false 
            });
            console.log('✅ CallSafe Embed: Microphone access granted');
            return true;
        } catch (error) {
            console.error('❌ CallSafe Embed: Microphone access denied:', error);
            updateStatus('Failed to access microphone. Please check permissions.', 'error');
            return false;
        }
    }

    // Create peer connection
    function createPeerConnection() {
        console.log('🔗 CallSafe Embed: Creating peer connection');
        peerConnection = new RTCPeerConnection(rtcConfig);
        
        // Add local stream
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('🔊 CallSafe Embed: Received remote stream');
            const remoteAudio = document.getElementById('callsafe-remote-audio');
            if (remoteAudio) {
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.play();
            }
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && socket) {
                console.log('🧊 CallSafe Embed: Sending ICE candidate');
                socket.emit('ice-candidate', {
                    callId: callId,
                    candidate: event.candidate
                });
            }
        };
        
        return peerConnection;
    }

    // Connect to signaling server
    async function connectToSignalingServer() {
        try {
            console.log('🔌 CallSafe Embed: Connecting to signaling server');
            const io = await loadSocketIO();
            socket = io(SIGNALING_SERVER);
            
            socket.on('connect', () => {
                console.log('✅ CallSafe Embed: Connected to signaling server');
            });
            
            socket.on('call-accepted', async (data) => {
                console.log('📞 CallSafe Embed: Call accepted by agent');
                updateStatus('Call accepted! Connecting...', 'connecting');
                
                // Create offer
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                socket.emit('offer', {
                    callId: callId,
                    offer: offer
                });
            });
            
            socket.on('answer', async (data) => {
                console.log('📞 CallSafe Embed: Received answer from agent');
                await peerConnection.setRemoteDescription(data.answer);
                updateStatus('Connected! You can now speak.', 'connected');
                isCallActive = true;
            });
            
            socket.on('ice-candidate', async (data) => {
                console.log('🧊 CallSafe Embed: Received ICE candidate');
                await peerConnection.addIceCandidate(data.candidate);
            });
            
            socket.on('call-ended', () => {
                console.log('📴 CallSafe Embed: Call ended by agent');
                endCall();
            });
            
            socket.on('agent-busy', () => {
                console.log('😔 CallSafe Embed: No agents available');
                updateStatus('No agents available. Please try again later.', 'error');
            });
            
            return true;
        } catch (error) {
            console.error('❌ CallSafe Embed: Failed to connect to signaling server:', error);
            updateStatus('Failed to connect. Please try again.', 'error');
            return false;
        }
    }

    // Start call
    async function startCall() {
        console.log('🚀 CallSafe Embed: Starting call');
        updateStatus('Requesting microphone access...', 'connecting');
        
        // Request microphone access
        const hasMedia = await initializeMedia();
        if (!hasMedia) return;
        
        updateStatus('Connecting to server...', 'connecting');
        
        // Connect to signaling server
        const connected = await connectToSignalingServer();
        if (!connected) return;
        
        // Create peer connection
        createPeerConnection();
        
        updateStatus('Looking for available agents...', 'connecting');
        
        // Generate call ID and request call
        callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        socket.emit('request-call', {
            callId: callId,
            handle: handle,
            sourceId: sourceId
        });
        
        // Show end call button
        showEndCallButton();
    }

    // End call
    function endCall() {
        console.log('📴 CallSafe Embed: Ending call');
        
        isCallActive = false;
        
        // Close peer connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // Stop local stream
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        // Disconnect socket
        if (socket) {
            socket.emit('end-call', { callId: callId });
            socket.disconnect();
            socket = null;
        }
        
        updateStatus('Call ended', 'error');
        showStartCallButton();
        
        // Auto close modal after 2 seconds
        setTimeout(() => {
            closeModal();
        }, 2000);
    }

    // Update status display
    function updateStatus(message, type = '') {
        const statusEl = document.querySelector('.callsafe-status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'callsafe-status ' + type;
        }
    }

    // Show start call button
    function showStartCallButton() {
        const interface = document.querySelector('.callsafe-call-interface');
        if (interface) {
            interface.innerHTML = `
                <div class="callsafe-status">Ready to make a call</div>
                <button class="callsafe-start-btn" onclick="window.CallSafeEmbed.startCall()">
                    Start Call
                </button>
            `;
        }
    }

    // Show end call button with spinner
    function showEndCallButton() {
        const interface = document.querySelector('.callsafe-call-interface');
        if (interface) {
            interface.innerHTML = `
                <div class="callsafe-spinner"></div>
                <div class="callsafe-status connecting">Connecting...</div>
                <button class="callsafe-end-btn" onclick="window.CallSafeEmbed.endCall()">
                    Cancel Call
                </button>
                <audio id="callsafe-remote-audio" class="callsafe-audio" autoplay></audio>
            `;
        }
    }
    
    // Create and inject CSS
    function injectCSS() {
        console.log('🎨 CallSafe Embed: Injecting CSS styles');
        const style = document.createElement('style');
        style.textContent = widgetCSS;
        document.head.appendChild(style);
        console.log('✅ CallSafe Embed: CSS styles injected successfully');
    }
    
    // Create the floating widget
    function createWidget() {
        console.log('🔨 CallSafe Embed: Creating widget element');
        const widget = document.createElement('div');
        widget.id = WIDGET_ID;
        widget.className = 'callsafe-widget';
        console.log('📦 CallSafe Embed: Widget element created with ID:', WIDGET_ID);
        
        const button = document.createElement('button');
        button.className = 'callsafe-button';
        button.innerHTML = phoneIcon + '<span>Quick Call</span>';
        button.onclick = openModal;
        console.log('🔘 CallSafe Embed: Button created with click handler');
        
        widget.appendChild(button);
        document.body.appendChild(widget);
        console.log('✅ CallSafe Embed: Widget successfully added to DOM');
    }
    
    // Create the modal
    function createModal() {
        console.log('🖼️ CallSafe Embed: Creating modal element');
        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'callsafe-modal';
        modal.onclick = function(e) {
            if (e.target === modal) {
                closeModal();
            }
        };
        console.log('📱 CallSafe Embed: Modal element created with ID:', MODAL_ID);
        
        const modalContent = document.createElement('div');
        modalContent.className = 'callsafe-modal-content';
        
        const header = document.createElement('div');
        header.className = 'callsafe-modal-header';
        header.innerHTML = `
            <div>
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Quick Call</h3>
                <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Connect instantly via your browser</p>
            </div>
            <button class="callsafe-close" onclick="window.CallSafeEmbed.closeModal()">${closeIcon}</button>
        `;
        
        const callInterface = document.createElement('div');
        callInterface.className = 'callsafe-call-interface';
        callInterface.innerHTML = `
            <div class="callsafe-status">Ready to make a call</div>
            <button class="callsafe-start-btn" onclick="window.CallSafeEmbed.startCall()">
                Start Call
            </button>
        `;
        
        modalContent.appendChild(header);
        modalContent.appendChild(callInterface);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        console.log('✅ CallSafe Embed: Modal successfully added to DOM');
    }
    
    // Open modal function
    function openModal() {
        console.log('🔄 CallSafe Embed: Opening modal');
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
            console.log('✅ CallSafe Embed: Modal opened successfully');
            
            // Reset to initial state
            showStartCallButton();
            
            // Track embed click event
            if (window.gtag) {
                console.log('📊 CallSafe Embed: Tracking click event');
                window.gtag('event', 'callsafe_embed_click', {
                    'source_id': sourceId,
                    'handle': handle
                });
            }
        } else {
            console.error('❌ CallSafe Embed: Modal element not found!');
        }
    }
    
    // Close modal function
    function closeModal() {
        console.log('🔄 CallSafe Embed: Closing modal');
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
            
            // End any active call
            if (isCallActive) {
                endCall();
            }
        }
    }

    // Expose functions globally
    window.CallSafeEmbed = {
        openModal: openModal,
        closeModal: closeModal,
        startCall: startCall,
        endCall: endCall
    };

    // Handle escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
    
    // Initialize when DOM is ready
    function init() {
        console.log('🎯 CallSafe Embed: Starting initialization');
        console.log('📄 CallSafe Embed: Document ready state:', document.readyState);
        console.log('🏗️ CallSafe Embed: Body element exists:', !!document.body);
        
        try {
            injectCSS();
            createWidget();
            createModal();
            
            console.log(`🎉 CallSafe Embed: Successfully initialized for handle: ${handle}, sourceId: ${sourceId}`);
        } catch (error) {
            console.error('💥 CallSafe Embed: Initialization failed:', error);
        }
    }
    
    // Initialize
    console.log('⏳ CallSafe Embed: Checking document ready state');
    if (document.readyState === 'loading') {
        console.log('📋 CallSafe Embed: Document still loading, waiting for DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', init);
    } else {
        console.log('📋 CallSafe Embed: Document already loaded, initializing immediately');
        init();
    }
    
})();