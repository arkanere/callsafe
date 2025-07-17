<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { WebRTCManager } from '$lib/webrtc.js';
  import { SocketManager } from '$lib/socket.js';
  import { connectionMonitor } from '$lib/monitoring.js';
  import type { CallState } from '$lib/types/webrtc.js';

  let webrtc: WebRTCManager;
  let socket: SocketManager;
  let callState: CallState = {
    status: 'idle',
    isCustomer: false,
    isMuted: false
  };
  let isOnline = false;
  let incomingCalls: Array<{ callId: string; timestamp: number }> = [];
  let errorMessage = '';
  let connectionStatus = 'Disconnected';
  let remoteAudio: HTMLAudioElement;
  let ringtoneAudio: HTMLAudioElement;
  let currentCallStartTime: number | null = null;
  let callDuration = 0;
  let durationInterval: number;
  let socketConnected = false;
  let handle = '';
  
  // Hardcoded user ID for MVP - in real app this would come from session
  const userId = 1;
  
  // Extract handle from URL parameters
  $: handle = $page.params.handle || '';
  
  // Reactive statement to update connection status
  $: {
    if (socket) {
      socketConnected = socket.getConnectionStatus();
    }
  }

  onMount(() => {
    webrtc = new WebRTCManager(false);
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
      socket.goOffline();
      socket.disconnect();
    }
    if (durationInterval) {
      clearInterval(durationInterval);
    }
    // Stop ringtone when component is destroyed
    stopRingtone();
  });

  async function connectToServer() {
    try {
      connectionStatus = 'Connecting to server...';
      console.log('Attempting to connect to server...');
      await socket.connect();
      connectionStatus = 'Connected';
      socketConnected = socket.getConnectionStatus(); // Force reactive update
      console.log('Successfully connected to server');
      console.log('Socket connection status:', socket.getConnectionStatus());
      
      // Initialize media for agent
      await webrtc.initializeMedia({ audio: true, video: false });
      
    } catch (error) {
      connectionStatus = 'Connection failed';
      errorMessage = 'Failed to connect to server. Please refresh and try again.';
      console.error('Failed to connect:', error);
      console.error('Error details:', error.message, error.stack);
    }
  }

  function setupWebRTCHandlers() {
    webrtc.setStateChangeHandler((state) => {
      const previousStatus = callState.status;
      callState = state;
      
      if (state.status === 'connected') {
        connectionMonitor.recordConnectionSuccess();
        // Only start timer if we weren't already connected (prevent timer reset)
        if (previousStatus !== 'connected') {
          startCallTimer();
        }
      } else if (state.status === 'failed') {
        connectionMonitor.recordConnectionFailure(state.error || 'Unknown error');
        errorMessage = state.error || 'Call failed';
        stopCallTimer();
      } else if (state.status === 'ended') {
        stopCallTimer();
      } else if (state.status === 'connecting' && previousStatus === 'connected') {
        // Connection temporarily lost - don't stop timer, just show reconnecting
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
    console.log('=== SETTING UP SOCKET HANDLERS (Agent with handle) ===');
    console.log('Handle:', handle);
    
    socket.on('new_incoming_call', (data) => {
      console.log('📞 New incoming call received:', data);
      const call = {
        callId: data.callId,
        timestamp: Date.now()
      };
      console.log('📝 Created call object:', call);
      incomingCalls = [...incomingCalls, call];
      
      // Play ringtone for incoming call
      playRingtone();
      
      // Auto-remove call after 30 seconds if not answered
      setTimeout(() => {
        incomingCalls = incomingCalls.filter(c => c.callId !== call.callId);
        // Stop ringtone if no more incoming calls
        if (incomingCalls.length === 0) {
          stopRingtone();
        }
      }, 30000);
    });

    socket.on('call_routed', async (data) => {
      console.log('🔄 Call routed to agent:', data);
      callState = { ...callState, callId: data.callId, status: 'connecting' };
      connectionMonitor.startConnectionAttempt();
      console.log('✅ Agent call state updated to connecting');
    });

    socket.on('offer', async (data) => {
      console.log('📥 Received offer from customer:', data);
      try {
        if (callState.callId === data.callId) {
          console.log('✅ Call ID matches, creating answer...');
          const answer = await webrtc.createAnswer(data.callId, data.offer);
          console.log('📤 Sending answer to customer:', answer);
          socket.sendAnswer(data.callId, answer);
        } else {
          console.log('❌ Call ID mismatch - expected:', callState.callId, 'received:', data.callId);
        }
      } catch (error) {
        console.error('❌ Failed to create answer:', error);
        errorMessage = 'Failed to answer call';
      }
    });

    socket.on('ice_candidate', async (data) => {
      console.log('🧊 Received ICE candidate (agent):', data);
      try {
        await webrtc.addIceCandidate(data.candidate);
        console.log('✅ ICE candidate added successfully (agent)');
      } catch (error) {
        console.error('❌ Failed to add ICE candidate (agent):', error);
      }
    });

    socket.on('call_ended', () => {
      console.log('📞 Call ended by customer');
      endCall();
    });

    socket.on('call_disconnected', (reason) => {
      errorMessage = `Call disconnected: ${reason}`;
      endCall();
    });

    socket.on('network_error', (error) => {
      errorMessage = `Network error: ${error}`;
    });

    socket.on('reconnect_attempt', (attempt) => {
      connectionStatus = `Reconnecting... (attempt ${attempt})`;
    });

    socket.on('connection_failed', (reason) => {
      errorMessage = 'Lost connection to server. Please refresh the page.';
      connectionStatus = 'Connection failed';
      isOnline = false;
    });
  }

  function toggleOnlineStatus() {
    if (!socket.getConnectionStatus()) {
      errorMessage = 'Not connected to server';
      return;
    }

    if (isOnline) {
      socket.goOffline();
      isOnline = false;
      connectionStatus = 'Offline';
      // Stop ringtone when going offline
      stopRingtone();
    } else {
      if (handle) {
        console.log('👤 Agent going online with handle:', handle);
        socket.goOnlineWithHandle(handle);
      } else {
        console.log('👤 Agent going online with user ID:', userId);
        socket.goOnlineWithUser(userId);
      }
      isOnline = true;
      connectionStatus = 'Online - Waiting for calls';
      errorMessage = '';
    }
  }

  function acceptCall(callId: string) {
    console.log('=== ACCEPT CALL CLICKED ===');
    console.log('Call ID:', callId);
    console.log('Agent online status:', isOnline);
    
    if (!isOnline) {
      console.log('❌ Agent not online, cannot accept call');
      return;
    }
    
    console.log('✅ Accepting call...');
    socket.acceptCall(callId);
    console.log('📤 Accept call message sent to server');
    
    incomingCalls = incomingCalls.filter(call => call.callId !== callId);
    console.log('🗑️ Removed call from incoming calls list');
    
    // Stop ringtone when accepting call
    stopRingtone();
    
    callState = { ...callState, callId, status: 'connecting' };
    console.log('📞 Agent call state updated:', callState);
  }

  function declineCall(callId: string) {
    socket.declineCall(callId);
    incomingCalls = incomingCalls.filter(call => call.callId !== callId);
    
    // Stop ringtone when declining call or if no more incoming calls
    if (incomingCalls.length === 0) {
      stopRingtone();
    }
  }

  function endCall() {
    if (callState.callId) {
      socket.endCall();
    }
    if (webrtc) {
      webrtc.endCall();
    }
    
    stopRingtone();
    callState = { ...callState, status: 'idle', callId: undefined };
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

  function playRingtone() {
    if (ringtoneAudio) {
      ringtoneAudio.loop = true;
      ringtoneAudio.play().catch(error => {
        console.log('Could not play ringtone:', error);
      });
    }
  }

  function stopRingtone() {
    if (ringtoneAudio) {
      ringtoneAudio.pause();
      ringtoneAudio.currentTime = 0;
    }
  }

  function clearError() {
    errorMessage = '';
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

<div class="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 p-4">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="bg-white rounded-2xl shadow-xl p-6 mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <button
            on:click={backToDashboard}
            class="mr-4 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
            </svg>
          </button>
          <div>
            <h1 class="text-3xl font-bold text-gray-800">Agent Dashboard</h1>
            <p class="text-gray-600">CallSafe Business Portal</p>
            {#if handle}
              <p class="text-sm text-gray-500 mt-1">Handle: <code class="bg-gray-100 px-2 py-1 rounded">{handle}</code></p>
            {/if}
          </div>
        </div>
        
        <div class="flex items-center space-x-4">
          <!-- Connection Status -->
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full mr-2 {socketConnected ? 'bg-green-500' : 'bg-red-500'}"></div>
            <span class="text-sm font-medium {getStatusColor(connectionStatus)}">
              {connectionStatus}
            </span>
          </div>
          
          <!-- Online Toggle -->
          <button
            on:click={toggleOnlineStatus}
            disabled={!socketConnected}
            class="px-6 py-2 rounded-lg font-semibold transition-colors duration-200 {
              isOnline 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            } disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isOnline ? 'Go Offline' : 'Go Online'}
          </button>
        </div>
      </div>
    </div>

    <!-- Error Message -->
    {#if errorMessage}
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div class="flex justify-between items-start">
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
          <button
            on:click={clearError}
            class="text-red-400 hover:text-red-600"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Current Call Panel -->
      <div class="bg-white rounded-2xl shadow-xl p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Current Call</h2>
        
        {#if callState.status === 'idle'}
          <div class="text-center py-8">
            <div class="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-gray-500">
              {isOnline ? 'Waiting for incoming calls...' : 'Go online to receive calls'}
            </p>
          </div>
        {:else if callState.status === 'connecting'}
          <div class="text-center py-8">
            <div class="animate-pulse">
              <div class="w-16 h-16 bg-yellow-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              </div>
              <p class="text-gray-600">Connecting to customer...</p>
              <p class="text-sm text-gray-500 mt-2">Call ID: {callState.callId}</p>
            </div>
          </div>
        {:else if callState.status === 'connected'}
          <div class="text-center py-4">
            <div class="w-16 h-16 bg-green-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-green-600 font-semibold mb-2">Connected to Customer</p>
            <p class="text-2xl font-mono text-gray-700 mb-4">{formatDuration(callDuration)}</p>
            <p class="text-sm text-gray-500 mb-6">Call ID: {callState.callId}</p>

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
          </div>
        {/if}
      </div>

      <!-- Incoming Calls Panel -->
      <div class="bg-white rounded-2xl shadow-xl p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Incoming Calls</h2>
        
        {#if incomingCalls.length === 0}
          <div class="text-center py-8">
            <div class="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5V7.5a7.5 7.5 0 0115 0V17z"/>
              </svg>
            </div>
            <p class="text-gray-500">No incoming calls</p>
          </div>
        {:else}
          <div class="space-y-4">
            {#each incomingCalls as call (call.callId)}
              <div class="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-semibold text-gray-800">New Customer Call</p>
                    <p class="text-sm text-gray-600">Call ID: {call.callId}</p>
                    <p class="text-xs text-gray-500">
                      {new Date(call.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <div class="flex space-x-2">
                    <button
                      on:click={() => acceptCall(call.callId)}
                      disabled={callState.status !== 'idle'}
                      class="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition-colors duration-200"
                    >
                      Accept
                    </button>
                    <button
                      on:click={() => declineCall(call.callId)}
                      class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors duration-200"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Hidden audio element for remote stream -->
    <audio 
      bind:this={remoteAudio} 
      autoplay 
      hidden 
      playsinline
      muted={false}
    ></audio>
    
    <!-- Hidden audio element for ringtone -->
    <audio 
      bind:this={ringtoneAudio} 
      src="/ringtone.mp3"
      preload="auto"
      hidden
    ></audio>
  </div>
</div>