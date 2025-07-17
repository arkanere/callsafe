<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { WebRTCManager } from '$lib/webrtc.js';
  import { SocketManager } from '$lib/socket.js';
  import { connectionMonitor } from '$lib/monitoring.js';
  import type { CallState } from '$lib/types/webrtc.js';

  let webrtc: WebRTCManager;
  let socket: SocketManager;
  let callState: CallState = {
    status: 'idle',
    isCustomer: true,
    isMuted: false
  };
  let errorMessage = '';
  let isConnecting = false;
  let remoteAudio: HTMLAudioElement;
  let connectionStatus = 'Disconnected';

  onMount(() => {
    webrtc = new WebRTCManager(true);
    socket = new SocketManager();
    
    setupWebRTCHandlers();
    setupSocketHandlers();
  });

  onDestroy(() => {
    if (webrtc) {
      webrtc.endCall();
    }
    if (socket) {
      socket.disconnect();
    }
  });

  function setupWebRTCHandlers() {
    webrtc.setStateChangeHandler((state) => {
      const previousStatus = callState.status;
      callState = state;
      
      if (state.status === 'connected') {
        connectionMonitor.recordConnectionSuccess();
        // Clear any connection messages when successfully connected
        connectionStatus = '';
      } else if (state.status === 'failed') {
        connectionMonitor.recordConnectionFailure(state.error || 'Unknown error');
        errorMessage = state.error || 'Call failed';
      } else if (state.status === 'connecting' && previousStatus === 'connected') {
        // Show reconnecting message without failing the call
        connectionStatus = 'Reconnecting...';
        console.log('🔄 Connection temporarily lost, attempting to reconnect...');
      }
    });

    webrtc.setRemoteStreamHandler((stream) => {
      if (remoteAudio) {
        remoteAudio.srcObject = stream;
      }
    });

    webrtc.setIceCandidateHandler((candidate) => {
      if (callState.callId) {
        socket.sendIceCandidate(callState.callId, candidate);
      }
    });
  }

  function setupSocketHandlers() {
    console.log('=== SETTING UP SOCKET HANDLERS (Customer) ===');
    
    socket.on('call_accepted', async (data) => {
      console.log('🎉 Call accepted by agent:', data);
      connectionStatus = 'Call accepted, connecting...';
      
      try {
        // Set the call ID from the server response
        if (data.callId) {
          callState = { ...callState, callId: data.callId };
          console.log('✅ Call ID set from server:', data.callId);
        } else {
          console.error('❌ No call ID in server response');
          return;
        }
        
        console.log('📞 Creating WebRTC offer for call:', callState.callId);
        const offer = await webrtc.createOffer(callState.callId);
        console.log('📤 Sending offer to agent:', offer);
        socket.sendOffer(callState.callId, offer);
      } catch (error) {
        console.error('❌ Failed to create offer:', error);
        errorMessage = 'Failed to create call offer';
      }
    });

    socket.on('answer', async (data) => {
      console.log('📥 Received answer from agent:', data);
      try {
        await webrtc.setRemoteAnswer(data.answer);
        console.log('✅ Remote answer set successfully');
      } catch (error) {
        console.error('❌ Failed to set remote answer:', error);
        errorMessage = 'Failed to connect to agent';
      }
    });

    socket.on('ice_candidate', async (data) => {
      console.log('🧊 Received ICE candidate:', data);
      try {
        await webrtc.addIceCandidate(data.candidate);
        console.log('✅ ICE candidate added successfully');
      } catch (error) {
        console.error('❌ Failed to add ICE candidate:', error);
        console.error('Failed to add ICE candidate:', error);
      }
    });

    socket.on('no_agents_available', () => {
      errorMessage = 'Sorry, all our representatives are currently busy. Please try again in a few minutes.';
      callState = { ...callState, status: 'failed' };
      isConnecting = false;
    });

    socket.on('call_timeout', () => {
      errorMessage = 'No agent is available right now. Please try calling back later.';
      callState = { ...callState, status: 'failed' };
      isConnecting = false;
    });

    socket.on('call_disconnected', (reason) => {
      errorMessage = `Call disconnected: ${reason}`;
      callState = { ...callState, status: 'ended' };
    });

    socket.on('network_error', (error) => {
      errorMessage = "We're having trouble connecting your call. Please check your internet connection and try again.";
      callState = { ...callState, status: 'failed' };
    });

    socket.on('reconnect_attempt', (attempt) => {
      connectionStatus = `Reconnecting... (attempt ${attempt})`;
    });

    socket.on('connection_failed', (reason) => {
      errorMessage = 'Unable to connect to our service. Please try again later.';
      connectionStatus = 'Connection failed';
      isConnecting = false;
    });
  }

  async function startCall() {
    console.log('=== START CALL CLICKED ===');
    console.log('Current state - isConnecting:', isConnecting, 'callState.status:', callState.status);
    
    if (isConnecting || callState.status === 'connecting') {
      console.log('❌ Call already in progress, ignoring click');
      return;
    }
    
    console.log('🚀 Starting call process...');
    isConnecting = true;
    errorMessage = '';
    connectionStatus = 'Connecting to service...';
    connectionMonitor.startConnectionAttempt();

    try {
      console.log('🎤 Requesting microphone permission...');
      // Request microphone permission and initialize media
      connectionStatus = 'Requesting microphone access...';
      await webrtc.initializeMedia({ audio: true, video: false });
      console.log('✅ Microphone access granted');
      
      // Connect to signaling server
      console.log('🔗 Connecting to signaling server...');
      connectionStatus = 'Connecting to signaling server...';
      await socket.connect();
      console.log('✅ Connected to signaling server');
      
      // Register as customer
      console.log('👤 Registering as customer...');
      connectionStatus = 'Looking for available agent...';
      socket.connectAsCustomer();
      console.log('✅ Customer registration sent');
      
      callState = { ...callState, status: 'connecting' };
      console.log('📞 Call state updated to connecting');
      
    } catch (error) {
      isConnecting = false;
      connectionMonitor.recordConnectionFailure(error instanceof Error ? error.message : 'Unknown error');
      
      if (error instanceof Error && error.message.includes('microphone')) {
        errorMessage = 'Please allow microphone access to make a call. Click the microphone icon in your browser\'s address bar.';
      } else {
        errorMessage = 'Failed to start call. Please try again.';
      }
      
      connectionStatus = 'Connection failed';
      console.error('Failed to start call:', error);
    }
  }

  function endCall() {
    if (socket) {
      socket.endCall();
    }
    if (webrtc) {
      webrtc.endCall();
    }
    
    callState = { ...callState, status: 'ended' };
    isConnecting = false;
    connectionStatus = 'Call ended';
  }

  function toggleMute() {
    if (webrtc) {
      const isMuted = webrtc.toggleMute();
      callState = { ...callState, isMuted };
    }
  }

  function retryCall() {
    errorMessage = '';
    callState = { ...callState, status: 'idle' };
    isConnecting = false;
    connectionStatus = 'Disconnected';
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

  function backToDashboard() {
    goto('/user');
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
    <!-- Header with Back Button -->
    <div class="flex items-center justify-between mb-6">
      <button
        on:click={backToDashboard}
        class="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors duration-200"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
        </svg>
      </button>
      <h1 class="text-2xl font-bold text-gray-800">Test Customer Portal</h1>
      <div class="w-10"></div> <!-- Spacer for centering -->
    </div>

    <div class="text-center mb-8">
      <p class="text-gray-600">Anonymous Business Calling</p>
    </div>

    <!-- Call Status -->
    <div class="mb-6">
      <div class="flex items-center justify-center mb-4">
        <div class="w-4 h-4 rounded-full mr-2 {callState.status === 'connected' ? 'bg-green-500' : 
                                                 callState.status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
                                                 callState.status === 'failed' ? 'bg-red-500' : 
                                                 'bg-gray-400'}"></div>
        <span class="text-sm font-medium {getStatusColor(callState.status)}">
          {connectionStatus}
        </span>
      </div>
    </div>

    <!-- Error Message -->
    {#if errorMessage}
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm text-red-700">{errorMessage}</p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Main Call Interface -->
    <div class="space-y-4">
      {#if callState.status === 'idle' || callState.status === 'failed'}
        <button
          on:click={startCall}
          disabled={isConnecting}
          class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center"
        >
          {#if isConnecting}
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Connecting...
          {:else}
            <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            Start Call
          {/if}
        </button>

        {#if errorMessage}
          <button
            on:click={retryCall}
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
          >
            Try Again
          </button>
        {/if}
      {:else if callState.status === 'connecting'}
        <div class="text-center py-8">
          <div class="animate-pulse">
            <div class="w-16 h-16 bg-yellow-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-gray-600">Connecting to agent...</p>
          </div>
        </div>
      {:else if callState.status === 'connected'}
        <div class="text-center py-4">
          <div class="w-16 h-16 bg-green-200 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
          </div>
          <p class="text-green-600 font-semibold mb-4">Connected to Agent</p>
        </div>

        <!-- Call Controls -->
        <div class="flex space-x-4">
          <button
            on:click={toggleMute}
            class="flex-1 {callState.isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            {#if callState.isMuted}
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clip-rule="evenodd"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
              </svg>
              Unmute
            {:else}
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
              </svg>
              Mute
            {/if}
          </button>

          <button
            on:click={endCall}
            class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18"/>
            </svg>
            End Call
          </button>
        </div>
      {:else if callState.status === 'ended'}
        <div class="text-center py-8">
          <div class="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18"/>
            </svg>
          </div>
          <p class="text-gray-600 mb-4">Call Ended</p>
          <button
            on:click={retryCall}
            class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
          >
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

    <!-- Footer -->
    <div class="mt-8 pt-6 border-t border-gray-200">
      <p class="text-xs text-gray-500 text-center">
        Secure • Anonymous • Private
      </p>
    </div>
  </div>
</div>