<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { WebRTCManager } from '$lib/webrtc.js';
  import { SocketManager } from '$lib/socket.js';
  import type { CallState } from '$lib/types/webrtc.js';

  let webrtc: WebRTCManager;
  let socket: SocketManager;
  let callState: CallState = {
    status: 'idle',
    isCustomer: true,
    isMuted: false
  };
  let handle = '';
  let sourceId = '';
  let isConnecting = false;
  let errorMessage = '';
  let remoteAudio: HTMLAudioElement;
  let currentCallStartTime: number | null = null;
  let callDuration = 0;
  let durationInterval: number;

  // Extract handle from URL parameters and sourceId from query params
  $: handle = $page.params.handle || '';
  $: sourceId = $page.url.searchParams.get('sourceId') || 'embed-widget';

  onMount(() => {
    webrtc = new WebRTCManager(true); // isCustomer = true
    socket = new SocketManager();
    
    setupWebRTCHandlers();
    setupSocketHandlers();
    connectToServer();
  });

  onDestroy(() => {
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
      await socket.connect();
      await webrtc.initializeMedia({ audio: true, video: false });
    } catch (error) {
      errorMessage = 'Failed to connect. Please check your microphone permissions.';
      console.error('Failed to connect:', error);
    }
  }

  function setupWebRTCHandlers() {
    webrtc.setStateChangeHandler((state) => {
      const previousStatus = callState.status;
      callState = state;
      
      if (state.status === 'connected' && previousStatus !== 'connected') {
        startCallTimer();
      } else if (state.status === 'failed') {
        errorMessage = state.error || 'Call failed';
        stopCallTimer();
      } else if (state.status === 'ended') {
        stopCallTimer();
      }
    });

    webrtc.setRemoteStreamHandler((stream) => {
      if (remoteAudio) {
        remoteAudio.srcObject = stream;
      }
    });

    webrtc.setIceCandidateHandler((candidate) => {
      if (callState.callId) {
        socket.sendIceCandidate(callState.callId, candidate, handle);
      }
    });
  }

  function setupSocketHandlers() {
    socket.on('call_routed', async (data) => {
      console.log('Call routed:', data);
      callState = { ...callState, callId: data.callId, status: 'connecting' };
    });

    socket.on('answer', async (data) => {
      console.log('Received answer from agent:', data);
      try {
        await webrtc.handleAnswer(data.answer);
      } catch (error) {
        console.error('Failed to handle answer:', error);
        errorMessage = 'Failed to connect to agent';
      }
    });

    socket.on('ice_candidate', async (data) => {
      console.log('Received ICE candidate:', data);
      try {
        await webrtc.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('Failed to add ICE candidate:', error);
      }
    });

    socket.on('call_ended', (data) => {
      console.log('Call ended by agent:', data);
      endCall();
    });

    socket.on('agent_declined', (data) => {
      console.log('Agent declined call:', data);
      errorMessage = 'Agent is currently unavailable. Please try again later.';
      endCall();
    });

    socket.on('no_agents_available', (data) => {
      console.log('No agents available:', data);
      errorMessage = 'No agents are currently available. Please try again later.';
      endCall();
    });
  }

  async function startCall() {
    if (!handle) {
      errorMessage = 'Invalid handle';
      return;
    }

    isConnecting = true;
    errorMessage = '';

    try {
      const offer = await webrtc.createOffer();
      
      socket.requestCall(handle, offer, sourceId);
      callState = { ...callState, status: 'connecting' };
    } catch (error) {
      console.error('Failed to start call:', error);
      errorMessage = 'Failed to start call. Please check your microphone permissions.';
      isConnecting = false;
    }
  }

  function endCall() {
    if (callState.callId) {
      socket.endCall({ 
        callId: callState.callId, 
        handle: handle,
        sourceId: sourceId,
        reason: 'customer_ended'
      });
    }
    
    if (webrtc) {
      webrtc.endCall();
    }
    
    callState = {
      status: 'idle',
      callId: undefined,
      isCustomer: true,
      isMuted: false
    };
    
    isConnecting = false;
    stopCallTimer();
  }

  function toggleMute() {
    if (webrtc) {
      const isMuted = webrtc.toggleMute();
      callState = { ...callState, isMuted };
    }
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
</script>

<svelte:head>
  <title>CallSafe - Quick Call</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</svelte:head>

<div class="embed-container">
  <!-- Error Message -->
  {#if errorMessage}
    <div class="error-message">
      <div class="error-icon">⚠️</div>
      <div class="error-text">{errorMessage}</div>
    </div>
  {/if}

  <!-- Call Interface -->
  <div class="call-interface">
    {#if callState.status === 'idle'}
      <div class="call-ready">
        <div class="call-icon">📞</div>
        <h2>Ready to Call</h2>
        <p>Click below to start your call</p>
        <button
          class="start-call-btn"
          on:click={startCall}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Start Call'}
        </button>
        <div class="mic-notice">Your browser will request microphone access</div>
      </div>
    {:else if callState.status === 'connecting'}
      <div class="call-connecting">
        <div class="connecting-icon">🔄</div>
        <h2>Connecting...</h2>
        <p>Please wait while we connect you</p>
        <button class="cancel-btn" on:click={endCall}>
          Cancel Call
        </button>
      </div>
    {:else if callState.status === 'connected'}
      <div class="call-active">
        <div class="connected-icon">✅</div>
        <h2>Connected</h2>
        <div class="call-timer">{formatDuration(callDuration)}</div>

        <!-- Call Controls -->
        <div class="call-controls">
          <button
            class="control-btn {callState.isMuted ? 'muted' : ''}"
            on:click={toggleMute}
          >
            {callState.isMuted ? '🔇' : '🎤'}
            {callState.isMuted ? 'Unmute' : 'Mute'}
          </button>

          <button class="control-btn end-call" on:click={endCall}>
            📞 End Call
          </button>
        </div>
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
    padding: 20px;
    min-height: 460px;
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
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
    font-size: 14px;
    max-width: 100%;
    box-sizing: border-box;
  }

  .call-interface {
    text-align: center;
    max-width: 100%;
    width: 100%;
  }

  .call-ready, .call-connecting, .call-active {
    padding: 20px;
  }

  .call-icon, .connecting-icon, .connected-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .connecting-icon {
    animation: spin 2s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 600;
    color: #1f2937;
  }

  p {
    margin: 0 0 20px 0;
    color: #6b7280;
    font-size: 16px;
  }

  .start-call-btn {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 16px 32px;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    width: 100%;
    max-width: 200px;
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

  .mic-notice {
    margin-top: 12px;
    font-size: 12px;
    color: #9ca3af;
  }

  .cancel-btn {
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 24px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .cancel-btn:hover {
    background: #dc2626;
  }

  .call-timer {
    font-size: 32px;
    font-weight: bold;
    font-family: 'Courier New', monospace;
    margin: 16px 0;
    color: #059669;
  }

  .call-controls {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .control-btn {
    background: #6b7280;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 80px;
    justify-content: center;
  }

  .control-btn:hover {
    background: #4b5563;
  }

  .control-btn.muted {
    background: #ef4444;
  }

  .control-btn.muted:hover {
    background: #dc2626;
  }

  .control-btn.end-call {
    background: #ef4444;
  }

  .control-btn.end-call:hover {
    background: #dc2626;
  }

  @media (max-width: 320px) {
    .embed-container {
      padding: 16px;
    }
    
    .call-controls {
      flex-direction: column;
      align-items: center;
    }
    
    .control-btn {
      width: 100%;
      max-width: 140px;
    }
  }
</style>