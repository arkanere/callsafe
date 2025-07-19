<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { WebRTCManager } from '$lib/webrtc.js';
  import { SocketManager } from '$lib/socket.js';
  import { connectionMonitor } from '$lib/monitoring.js';
  import type { CallState } from '$lib/types/webrtc.js';

  let webrtc: WebRTCManager;
  let socket: SocketManager;
  let callState: CallState = {
    status: 'idle',
    isCustomer: true,
    isMuted: false,
    sourceId: ''
  };
  let handle = '';
  let sourceId = '';
  let isConnecting = false;
  let errorMessage = '';
  let connectionStatus = 'Ready to call';
  let remoteAudio: HTMLAudioElement;
  let currentCallStartTime: number | null = null;
  let callDuration = 0;
  let durationInterval: number;
  let retryCount = 0;
  const maxRetries = 3;

  // Extract handle from URL parameters and sourceId from query params
  $: handle = $page.params.handle || '';
  $: sourceId = $page.url.searchParams.get('sourceId') || 'embed-widget';

  onMount(() => {
    console.log('🎯 Embed route mounted with handle:', handle, 'sourceId:', sourceId);
    webrtc = new WebRTCManager(true); // isCustomer = true
    socket = new SocketManager();
    
    // Update callState with sourceId
    callState = { ...callState, sourceId };
    
    setupWebRTCHandlers();
    setupSocketHandlers();
    
    // Auto-connect to server for faster call initiation
    connectToServer();
  });

  onDestroy(() => {
    console.log('🧹 Embed route cleanup');
    if (webrtc) {
      webrtc.endCall();
    }
    if (socket) {
      socket.disconnect();
    }
    if (durationInterval) {
      clearInterval(durationInterval);
    }
  });

  async function connectToServer() {
    try {
      console.log('🔗 Pre-connecting to signaling server');
      await socket.connect();
      console.log('✅ Pre-connected to signaling server');
      connectionStatus = 'Ready to call';
    } catch (error) {
      console.error('❌ Failed to pre-connect:', error);
      connectionStatus = 'Connection issue - will retry when calling';
    }
  }

  function setupWebRTCHandlers() {
    webrtc.setStateChangeHandler((state) => {
      const previousStatus = callState.status;
      callState = { ...callState, ...state };
      console.log('📱 Embed call state updated:', callState);
      
      if (state.status === 'connected' && previousStatus !== 'connected') {
        connectionMonitor.recordConnectionSuccess();
        connectionStatus = 'Connected';
        startCallTimer();
        retryCount = 0; // Reset retry count on successful connection
      } else if (state.status === 'failed') {
        connectionMonitor.recordConnectionFailure(state.error || 'Unknown error');
        errorMessage = state.error || 'Call failed';
        connectionStatus = 'Call failed';
        stopCallTimer();
      } else if (state.status === 'ended') {
        connectionStatus = 'Call ended';
        stopCallTimer();
      } else if (state.status === 'connecting' && previousStatus === 'connected') {
        // Show reconnecting message without failing the call
        connectionStatus = 'Reconnecting...';
        console.log('🔄 Connection temporarily lost, attempting to reconnect...');
      }
    });

    webrtc.setRemoteStreamHandler((stream) => {
      console.log('🔊 Embed received remote stream');
      if (remoteAudio) {
        remoteAudio.srcObject = stream;
      }
    });

    webrtc.setIceCandidateHandler((candidate) => {
      if (callState.callId) {
        console.log('🧊 Embed sending ICE candidate');
        socket.sendIceCandidate(callState.callId, candidate, handle, sourceId);
      }
    });
  }

  function setupSocketHandlers() {
    console.log('=== SETTING UP EMBED SOCKET HANDLERS ===');
    console.log('Handle:', handle);
    console.log('SourceId:', sourceId);
    
    // Use the same event handlers as /user/call/[handle] for consistency
    socket.on('call_accepted', async (data) => {
      console.log('🎉 Embed: Call accepted by agent:', data);
      connectionStatus = 'Call accepted, connecting...';
      isConnecting = false; // Allow UI updates
      
      try {
        // Set the call ID from the server response
        if (data.callId) {
          callState = { ...callState, callId: data.callId };
          console.log('✅ Embed: Call ID set from server:', data.callId);
        } else {
          console.error('❌ Embed: No call ID in server response');
          throw new Error('No call ID received from server');
        }
        
        console.log('📞 Embed: Creating WebRTC offer for call:', callState.callId);
        const offer = await webrtc.createOffer(callState.callId);
        console.log('📤 Embed: Sending offer to agent:', offer);
        socket.sendOffer(callState.callId, offer, handle, sourceId);
        
        callState = { ...callState, status: 'connecting' };
        connectionStatus = 'Connecting audio...';
      } catch (error) {
        console.error('❌ Embed: Failed to create offer:', error);
        errorMessage = 'Failed to create call offer';
        connectionStatus = 'Failed to create offer';
        callState = { ...callState, status: 'failed' };
      }
    });

    socket.on('answer', async (data) => {
      console.log('📥 Embed: Received answer from agent:', data);
      try {
        await webrtc.setRemoteAnswer(data.answer);
        console.log('✅ Embed: Remote answer set successfully');
        connectionStatus = 'Audio connected';
      } catch (error) {
        console.error('❌ Embed: Failed to set remote answer:', error);
        errorMessage = 'Failed to connect to agent';
        connectionStatus = 'Failed to connect audio';
      }
    });

    socket.on('ice_candidate', async (data) => {
      console.log('🧊 Embed: Received ICE candidate:', data);
      try {
        await webrtc.addIceCandidate(data.candidate);
        console.log('✅ Embed: ICE candidate added successfully');
      } catch (error) {
        console.error('❌ Embed: Failed to add ICE candidate:', error);
      }
    });

    socket.on('call_ended', (data) => {
      console.log('📴 Embed: Call ended by agent:', data);
      endCall('Agent ended the call');
    });

    socket.on('agent_declined', (data) => {
      console.log('😔 Embed: Agent declined call:', data);
      errorMessage = 'Agent is currently unavailable. Please try again later.';
      connectionStatus = 'Agent unavailable';
      callState = { ...callState, status: 'failed' };
      isConnecting = false;
    });

    socket.on('no_agents_available', (data) => {
      console.log('😔 Embed: No agents available:', data);
      errorMessage = 'No agents are currently available. Please try again later.';
      connectionStatus = 'No agents available';
      callState = { ...callState, status: 'failed' };
      isConnecting = false;
    });

    socket.on('call_timeout', () => {
      console.log('⏰ Embed: Call timeout');
      errorMessage = 'No agent is available right now. Please try calling back later.';
      connectionStatus = 'Call timeout';
      callState = { ...callState, status: 'failed' };
      isConnecting = false;
    });

    socket.on('call_disconnected', (reason) => {
      console.log('📴 Embed: Call disconnected:', reason);
      endCall(`Call disconnected: ${reason}`);
    });

    socket.on('network_error', (error) => {
      console.log('🌐 Embed: Network error:', error);
      errorMessage = "We're having trouble connecting your call. Please check your internet connection and try again.";
      connectionStatus = 'Network error';
      callState = { ...callState, status: 'failed' };
      isConnecting = false;
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log('🔄 Embed: Reconnect attempt:', attempt);
      connectionStatus = `Reconnecting... (attempt ${attempt})`;
    });

    socket.on('connection_failed', (reason) => {
      console.log('❌ Embed: Connection failed:', reason);
      errorMessage = 'Unable to connect to our service. Please try again later.';
      connectionStatus = 'Connection failed';
      isConnecting = false;
    });

    socket.on('handle_not_found', () => {
      console.log('🔍 Embed: Handle not found');
      errorMessage = 'Invalid call link. Please check the URL and try again.';
      connectionStatus = 'Invalid handle';
      callState = { ...callState, status: 'failed' };
      isConnecting = false;
    });
  }

  async function startCall() {
    console.log('=== EMBED: START CALL CLICKED ===');
    console.log('Handle:', handle);
    console.log('SourceId:', sourceId);
    console.log('Current state - isConnecting:', isConnecting, 'callState.status:', callState.status);
    
    if (isConnecting || callState.status === 'connecting') {
      console.log('❌ Embed: Call already in progress, ignoring click');
      return;
    }
    
    if (!handle) {
      errorMessage = 'Invalid call link. Please check the URL and try again.';
      connectionStatus = 'Invalid handle';
      return;
    }
    
    console.log('🚀 Embed: Starting call process...');
    isConnecting = true;
    errorMessage = '';
    connectionStatus = 'Connecting to service...';
    connectionMonitor.startConnectionAttempt();
    
    // Reset mute state for new call
    callState = { ...callState, isMuted: false, status: 'connecting' };

    try {
      console.log('🎤 Embed: Requesting microphone permission...');
      // Request microphone permission and initialize media
      connectionStatus = 'Requesting microphone access...';
      await webrtc.initializeMedia({ audio: true, video: false });
      console.log('✅ Embed: Microphone access granted');
      
      // Ensure socket connection
      if (!socket.getConnectionStatus()) {
        console.log('🔗 Embed: Connecting to signaling server...');
        connectionStatus = 'Connecting to signaling server...';
        await socket.connect();
        console.log('✅ Embed: Connected to signaling server');
      }
      
      // Register as customer with handle (use same method as /user/call/[handle])
      console.log('👤 Embed: Registering as customer with handle:', handle, 'sourceId:', sourceId);
      connectionStatus = 'Looking for available agent...';
      socket.connectAsCustomerWithHandle(handle, sourceId);
      console.log('✅ Embed: Customer registration sent with handle:', handle, 'sourceId:', sourceId);
      
      // Don't set isConnecting = false here, wait for server response
      console.log('📞 Embed: Waiting for agent response...');
      
    } catch (error) {
      console.error('❌ Embed: Failed to start call:', error);
      isConnecting = false;
      connectionMonitor.recordConnectionFailure(error instanceof Error ? error.message : 'Unknown error');
      
      if (error instanceof Error && error.message.includes('microphone')) {
        errorMessage = 'Please allow microphone access to make a call. Click the microphone icon in your browser\'s address bar.';
        connectionStatus = 'Microphone access denied';
      } else {
        errorMessage = 'Failed to start call. Please try again.';
        connectionStatus = 'Connection failed';
      }
      
      callState = { ...callState, status: 'failed' };
    }
  }

  function endCall(reason?: string) {
    console.log('📴 Embed: Ending call, reason:', reason);
    
    if (socket && callState.callId) {
      // Send end call with all available identifiers
      socket.endCall({ 
        callId: callState.callId, 
        handle: handle,
        sourceId: sourceId,
        reason: reason || 'customer_ended'
      });
    }
    
    if (webrtc) {
      webrtc.endCall();
    }
    
    callState = { 
      ...callState, 
      status: 'ended',
      callId: undefined 
    };
    
    isConnecting = false;
    connectionStatus = reason || 'Call ended';
    stopCallTimer();
  }

  function toggleMute() {
    if (webrtc) {
      const isMuted = webrtc.toggleMute();
      callState = { ...callState, isMuted };
      console.log('🔇 Embed: Mute state updated:', isMuted ? 'muted' : 'unmuted');
    }
  }

  function retryCall() {
    if (retryCount >= maxRetries) {
      errorMessage = 'Maximum retry attempts reached. Please refresh the page and try again.';
      return;
    }
    
    retryCount++;
    console.log('🔄 Embed: Retry attempt', retryCount);
    errorMessage = '';
    callState = { ...callState, status: 'idle', isMuted: false };
    isConnecting = false;
    connectionStatus = 'Ready to call';
    
    // Wait a moment before allowing retry
    setTimeout(() => {
      startCall();
    }, 1000);
  }

  function startCallTimer() {
    currentCallStartTime = Date.now();
    durationInterval = setInterval(() => {
      if (currentCallStartTime) {
        callDuration = Math.floor((Date.now() - currentCallStartTime) / 1000);
      }
    }, 1000);
  }

  function stopCallTimer() {
    if (durationInterval) {
      clearInterval(durationInterval);
    }
    currentCallStartTime = null;
    callDuration = 0;
  }

  function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'failed': return 'text-red-600';
      case 'ended': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  }

  // Communicate with parent window for embed analytics
  function notifyParent(eventType: string, data: any = {}) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'callsafe-embed-event',
          eventType,
          data: {
            handle,
            sourceId,
            callId: callState.callId,
            ...data
          }
        }, '*');
      }
    } catch (error) {
      console.log('Could not notify parent window:', error);
    }
  }

  // Notify parent of important events
  $: {
    if (callState.status === 'connected') {
      notifyParent('call-connected', { duration: callDuration });
    } else if (callState.status === 'ended') {
      notifyParent('call-ended', { duration: callDuration });
    } else if (callState.status === 'failed') {
      notifyParent('call-failed', { error: errorMessage });
    }
  }
</script>

<svelte:head>
  <title>CallSafe - Quick Call</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</svelte:head>

<div class="embed-container">
  <!-- Connection Status Bar -->
  <div class="status-bar">
    <div class="status-indicator {callState.status === 'connected' ? 'connected' : 
                                   callState.status === 'connecting' ? 'connecting' : 
                                   callState.status === 'failed' ? 'failed' : 'idle'}"></div>
    <span class="status-text {getStatusColor(callState.status)}">{connectionStatus}</span>
    {#if callState.status === 'connected' && callDuration > 0}
      <span class="call-timer">{formatDuration(callDuration)}</span>
    {/if}
  </div>

  <!-- Error Message -->
  {#if errorMessage}
    <div class="error-message">
      <div class="error-icon">⚠️</div>
      <div class="error-text">{errorMessage}</div>
      {#if retryCount < maxRetries}
        <button class="error-retry-btn" on:click={retryCall}>
          Retry ({maxRetries - retryCount} left)
        </button>
      {/if}
    </div>
  {/if}

  <!-- Call Interface -->
  <div class="call-interface">
    {#if callState.status === 'idle' || callState.status === 'failed'}
      <div class="call-ready">
        <div class="call-icon">📞</div>
        <h2>Ready to Call</h2>
        <p>Click below to start your call</p>
        <button
          class="start-call-btn"
          on:click={startCall}
          disabled={isConnecting || !handle}
        >
          {#if isConnecting}
            <div class="btn-spinner"></div>
            Connecting...
          {:else}
            Start Call
          {/if}
        </button>
        <div class="mic-notice">Your browser will request microphone access</div>
      </div>
    {:else if callState.status === 'connecting'}
      <div class="call-connecting">
        <div class="connecting-icon">🔄</div>
        <h2>Connecting...</h2>
        <p>Please wait while we connect you</p>
        
        <!-- Call Controls during connecting -->
        <div class="call-controls">
          <button
            class="control-btn mute-btn {callState.isMuted ? 'muted' : ''}"
            on:click={toggleMute}
            title={callState.isMuted ? 'Unmute' : 'Mute'}
          >
            {callState.isMuted ? '🔇' : '🎤'}
          </button>
          
          <button class="control-btn cancel-btn" on:click={() => endCall('User cancelled')}>
            Cancel Call
          </button>
        </div>
      </div>
    {:else if callState.status === 'connected'}
      <div class="call-active">
        <div class="connected-icon">✅</div>
        <h2>Connected</h2>
        <div class="call-duration">{formatDuration(callDuration)}</div>

        <!-- Call Controls -->
        <div class="call-controls">
          <button
            class="control-btn mute-btn {callState.isMuted ? 'muted' : ''}"
            on:click={toggleMute}
            title={callState.isMuted ? 'Unmute' : 'Mute'}
          >
            {callState.isMuted ? '🔇' : '🎤'}
            <span class="control-label">{callState.isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button class="control-btn end-call-btn" on:click={() => endCall('User ended call')}>
            📞 End Call
          </button>
        </div>
      </div>
    {:else if callState.status === 'ended'}
      <div class="call-ended">
        <div class="ended-icon">📴</div>
        <h2>Call Ended</h2>
        <p>Thank you for using CallSafe</p>
        <button class="start-call-btn" on:click={retryCall}>
          Make Another Call
        </button>
      </div>
    {/if}
  </div>

  <!-- Hidden audio element for remote stream -->
  <audio 
    bind:this={remoteAudio} 
    autoplay 
    hidden 
    playsinline
    muted={false}
  ></audio>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .embed-container {
    padding: 16px;
    min-height: 440px;
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: white;
    border-radius: 8px;
    margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    font-size: 13px;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-indicator.idle {
    background: #9ca3af;
  }

  .status-indicator.connecting {
    background: #f59e0b;
    animation: pulse 2s infinite;
  }

  .status-indicator.connected {
    background: #10b981;
  }

  .status-indicator.failed {
    background: #ef4444;
  }

  .status-text {
    flex: 1;
    font-weight: 500;
  }

  .call-timer {
    font-family: 'Courier New', monospace;
    font-weight: bold;
    color: #059669;
    font-size: 12px;
  }

  .error-message {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #dc2626;
    font-size: 13px;
  }

  .error-retry-btn {
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
    margin-left: auto;
  }

  .error-retry-btn:hover {
    background: #b91c1c;
  }

  .call-interface {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
  }

  .call-ready, .call-connecting, .call-active, .call-ended {
    padding: 20px;
  }

  .call-icon, .connecting-icon, .connected-icon, .ended-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .connecting-icon {
    animation: spin 2s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  h2 {
    margin: 0 0 8px 0;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
  }

  p {
    margin: 0 0 16px 0;
    color: #6b7280;
    font-size: 14px;
  }

  .start-call-btn {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 14px 28px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    width: 100%;
    max-width: 180px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .start-call-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
  }

  .start-call-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .mic-notice {
    margin-top: 8px;
    font-size: 11px;
    color: #9ca3af;
  }

  .call-duration {
    font-size: 24px;
    font-weight: bold;
    font-family: 'Courier New', monospace;
    margin: 12px 0;
    color: #059669;
  }

  .call-controls {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 16px;
  }

  .control-btn {
    background: #6b7280;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 70px;
    justify-content: center;
  }

  .control-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .mute-btn.muted {
    background: #ef4444;
  }

  .mute-btn.muted:hover {
    background: #dc2626;
  }

  .cancel-btn, .end-call-btn {
    background: #ef4444;
  }

  .cancel-btn:hover, .end-call-btn:hover {
    background: #dc2626;
  }

  .control-label {
    font-size: 11px;
  }

  @media (max-width: 350px) {
    .embed-container {
      padding: 12px;
    }
    
    .call-controls {
      flex-direction: column;
      align-items: center;
    }
    
    .control-btn {
      width: 100%;
      max-width: 120px;
    }
    
    .control-label {
      display: none;
    }
  }
</style>