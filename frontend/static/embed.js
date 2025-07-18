// embed.js - The main widget file hosted on your servers
(function() {
  'use strict';
  
  // Prevent multiple instances
  if (window.CallWidgetLoaded) return;
  window.CallWidgetLoaded = true;
  
  // Get configuration
  const config = window.CallWidgetConfig || {};
  const BUTTON_TEXT = config.buttonText || 'Call Us';
  const POSITION = config.position || 'bottom-right';
  const THEME = config.theme || 'light';
  const HANDLE = config.handle || '';
  
  // CSS Styles
  const styles = `
    .call-widget-btn {
      position: fixed;
      z-index: 999999;
      padding: 12px 20px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 25px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,123,255,0.3);
      transition: all 0.3s ease;
      user-select: none;
    }
    
    .call-widget-btn:hover {
      background: #0056b3;
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,123,255,0.4);
    }
    
    .call-widget-btn.bottom-right {
      bottom: 20px;
      right: 20px;
    }
    
    .call-widget-btn.bottom-left {
      bottom: 20px;
      left: 20px;
    }
    
    .call-widget-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000000;
      display: none;
      align-items: center;
      justify-content: center;
    }
    
    .call-widget-content {
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    }
    
    .call-widget-close {
      position: absolute;
      top: 12px;
      right: 16px;
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
    }
    
    .call-widget-status {
      text-align: center;
      margin: 20px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .call-widget-controls {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 20px;
    }
    
    .call-widget-control-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
    
    .call-widget-call-btn {
      background: #28a745;
      color: white;
    }
    
    .call-widget-end-btn {
      background: #dc3545;
      color: white;
    }
    
    .call-widget-mute-btn {
      background: #6c757d;
      color: white;
    }
    
    @media (max-width: 480px) {
      .call-widget-btn {
        bottom: 10px;
        right: 10px;
        left: 10px;
        width: auto;
      }
      .call-widget-btn.bottom-left {
        left: 10px;
        right: auto;
        width: auto;
      }
    }
  `;
  
  // Add styles to page
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
  
  // WebRTC variables
  let localStream = null;
  let peerConnection = null;
  let socket = null;
  let isCalling = false;
  let isMuted = false;
  
  // WebRTC configuration
  const pcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      // Add your TURN servers here if needed
      // { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' }
    ]
  };
  
  // Create call button
  function createCallButton() {
    const button = document.createElement('button');
    button.className = `call-widget-btn ${POSITION}`;
    button.textContent = BUTTON_TEXT;
    button.onclick = openCallModal;
    document.body.appendChild(button);
    return button;
  }
  
  // Create call modal
  function createCallModal() {
    const modal = document.createElement('div');
    modal.className = 'call-widget-modal';
    modal.innerHTML = `
      <div class="call-widget-content">
        <button class="call-widget-close" onclick="window.CallWidget.closeModal()">&times;</button>
        <div class="call-widget-status">
          <h3>Ready to Call</h3>
          <p>Click the button below to start your call</p>
        </div>
        <div class="call-widget-controls">
          <button class="call-widget-control-btn call-widget-call-btn" onclick="window.CallWidget.startCall()">
            Start Call
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }
  
  // Initialize WebSocket connection
  function initializeSocket() {
    // Replace with your WebSocket server URL
    socket = new WebSocket('wss://api.callsafe.tech/ws');
    
    socket.onopen = function() {
      console.log('WebSocket connected');
    };
    
    socket.onmessage = async function(event) {
      const message = JSON.parse(event.data);
      await handleSignalingMessage(message);
    };
    
    socket.onclose = function() {
      console.log('WebSocket disconnected');
    };
    
    socket.onerror = function(error) {
      console.error('WebSocket error:', error);
    };
  }
  
  // Handle signaling messages
  async function handleSignalingMessage(message) {
    switch (message.type) {
      case 'offer':
        await handleOffer(message.offer);
        break;
      case 'answer':
        await handleAnswer(message.answer);
        break;
      case 'ice-candidate':
        await handleIceCandidate(message.candidate);
        break;
      case 'call-ended':
        endCall();
        break;
    }
  }
  
  // WebRTC functions
  async function startCall() {
    try {
      updateStatus('Requesting microphone access...');
      
      // Get user media
      localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
      
      // Create peer connection
      peerConnection = new RTCPeerConnection(pcConfig);
      
      // Add local stream
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
      
      // Handle ICE candidates
      peerConnection.onicecandidate = function(event) {
        if (event.candidate && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate
          }));
        }
      };
      
      // Handle remote stream
      peerConnection.ontrack = function(event) {
        const remoteAudio = document.createElement('audio');
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        document.body.appendChild(remoteAudio);
      };
      
      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      socket.send(JSON.stringify({
        type: 'offer',
        offer: offer,
        handle: HANDLE
      }));
      
      isCalling = true;
      updateStatus('Connecting...', true);
      
    } catch (error) {
      console.error('Error starting call:', error);
      updateStatus('Error: Could not access microphone');
    }
  }
  
  async function handleOffer(offer) {
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.send(JSON.stringify({
      type: 'answer',
      answer: answer
    }));
  }
  
  async function handleAnswer(answer) {
    await peerConnection.setRemoteDescription(answer);
    updateStatus('Call connected!', true);
  }
  
  async function handleIceCandidate(candidate) {
    await peerConnection.addIceCandidate(candidate);
  }
  
  function endCall() {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'end-call' }));
    }
    
    // Remove remote audio elements
    document.querySelectorAll('audio').forEach(audio => {
      if (audio.srcObject) audio.remove();
    });
    
    isCalling = false;
    isMuted = false;
    updateStatus('Call ended');
    
    setTimeout(() => {
      closeModal();
    }, 2000);
  }
  
  function toggleMute() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMuted = !audioTrack.enabled;
        updateMuteButton();
      }
    }
  }
  
  function updateMuteButton() {
    const muteBtn = document.querySelector('.call-widget-mute-btn');
    if (muteBtn) {
      muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    }
  }
  
  function updateStatus(message, showControls = false) {
    const statusDiv = document.querySelector('.call-widget-status');
    const controlsDiv = document.querySelector('.call-widget-controls');
    
    if (statusDiv) {
      statusDiv.innerHTML = `<h3>${message}</h3>`;
    }
    
    if (controlsDiv && showControls) {
      controlsDiv.innerHTML = `
        <button class="call-widget-control-btn call-widget-mute-btn" onclick="window.CallWidget.toggleMute()">
          ${isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button class="call-widget-control-btn call-widget-end-btn" onclick="window.CallWidget.endCall()">
          End Call
        </button>
      `;
    }
  }
  
  function openCallModal() {
    const modal = document.querySelector('.call-widget-modal');
    if (modal) {
      modal.style.display = 'flex';
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        initializeSocket();
      }
    }
  }
  
  function closeModal() {
    const modal = document.querySelector('.call-widget-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    
    if (isCalling) {
      endCall();
    }
  }
  
  // Initialize widget
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    
    createCallButton();
    createCallModal();
    
    // Close modal when clicking outside
    document.addEventListener('click', function(e) {
      const modal = document.querySelector('.call-widget-modal');
      if (e.target === modal) {
        closeModal();
      }
    });
  }
  
  // Expose public API
  window.CallWidget = {
    startCall: startCall,
    endCall: endCall,
    toggleMute: toggleMute,
    openModal: openCallModal,
    closeModal: closeModal
  };
  
  // Initialize
  init();
  
})();