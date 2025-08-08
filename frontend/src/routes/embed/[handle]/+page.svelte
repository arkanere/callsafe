<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { io, type Socket } from 'socket.io-client';
  import { env } from '$env/dynamic/public';
  import { WebRTCManager } from '$lib/managers/webrtc-manager';
  import { customerCallState } from '$lib/stores/call-state';
  import { generateUUID } from '$lib/utils/uuid';
  import type {
    CallAcceptedEvent,
    CallEndedEvent,
    CallFailedEvent,
    CallBusyEvent,
    CallUnavailableEvent,
    CallTimeoutEvent,
    WebRTCOfferEvent,
    WebRTCAnswerEvent,
    WebRTCIceCandidateEvent
  } from '$lib/types/events';

  // Extract parameters - handle comes from URL path parameter for customer calls
  let handle = $page.params.handle || '';
  let sourceId = $page.url.searchParams.get('sourceId') || 'website';

  // Connection management
  let socket: Socket | null = null;
  let webrtcManager: WebRTCManager | null = null;

  // Call state
  let callAttemptId: string | null = null;
  let callState: 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed' = 'idle';
  let statusMessage = '';
  let isMuted = false;
  let showCallButton = true;
  let showCallControls = false;
  let cleanupTimeout: any = null;

  onMount(() => {
    console.log('[EMBED PAGE] onMount(): Component mounted');
    console.log('[EMBED PAGE] onMount(): Handle:', handle);
    console.log('[EMBED PAGE] onMount(): Source ID:', sourceId);
    
    // Initialize customer call state
    customerCallState.update(state => ({
      ...state,
      handle,
      sourceId
    }));
    
    console.log('[EMBED PAGE] onMount(): Customer call state initialized');
  });

  onDestroy(() => {
    console.log('[EMBED PAGE] onDestroy(): Component destroying, cleaning up');
    cleanup();
  });

  async function initiateCall() {
    console.log('[EMBED PAGE] initiateCall(): Initiate call requested, current state:', callState);
    if (callState !== 'idle') {
      console.log('[EMBED PAGE] initiateCall(): Call already in progress, ignoring');
      return;
    }

    console.log('[EMBED PAGE] initiateCall(): Starting call initiation process');
    try {
      callAttemptId = generateUUID();
      console.log('[EMBED PAGE] initiateCall(): Generated call attempt ID:', callAttemptId);
      
      console.log('[EMBED PAGE] initiateCall(): Requesting user media access');
      // Get user media first
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      console.log('[EMBED PAGE] initiateCall(): User media obtained successfully');

      console.log('[EMBED PAGE] initiateCall(): Updating UI state to connecting');
      // Update UI state
      callState = 'connecting';
      statusMessage = 'Finding agent...';
      showCallButton = false;
      showCallControls = true;

      customerCallState.update(state => ({
        ...state,
        callAttemptId,
        state: 'connecting',
        webrtc: {
          ...state.webrtc,
          localStream: stream
        },
        ui: {
          ...state.ui,
          showCallButton: false,
          showCallControls: true,
          statusMessage: 'Finding agent...'
        }
      }));

      console.log('[EMBED PAGE] initiateCall(): Connecting to signaling server');
      // Connect to signaling server
      await connectToSignalingServer();
      console.log('[EMBED PAGE] initiateCall(): Connected to signaling server');

      console.log('[EMBED PAGE] initiateCall(): Initializing WebRTC');
      // Initialize WebRTC
      await initializeCustomerWebRTC(callAttemptId, stream);
      console.log('[EMBED PAGE] initiateCall(): WebRTC initialized');

      console.log('[EMBED PAGE] initiateCall(): Sending call initiate event');
      // Send call initiate - handle is from URL path parameter
      socket!.emit('call:initiate', {
        callAttemptId,
        handle,
        sourceId,
        timestamp: Date.now()
      });
      console.log('[EMBED PAGE] initiateCall(): Call initiate event sent');

    } catch (error) {
      console.error('[EMBED PAGE] initiateCall(): Error during call initiation:', error);
      handleMediaAccessError(error);
    }
  }

  async function connectToSignalingServer(): Promise<void> {
    console.log('[EMBED PAGE] connectToSignalingServer(): Attempting to connect to signaling server');
    return new Promise((resolve, reject) => {
      const socketUrl = env.VITE_SIGNALING_SERVER_URL || 'https://tunnel.callsafe.tech';
      socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 30000 // 30-second timeout for consistency
      });
      console.log('[EMBED PAGE] connectToSignalingServer(): Socket.io instance created');

      socket.on('connect', () => {
        console.log('[EMBED PAGE] connectToSignalingServer(): Socket connected successfully');
        setupSocketEventHandlers();
        resolve();
      });

      socket.on('connect_error', (error) => {
        console.error('[EMBED PAGE] connectToSignalingServer(): Socket connection error:', error);
        reject(error);
      });
    });
  }

  function setupSocketEventHandlers() {
    console.log('[EMBED PAGE] setupSocketEventHandlers(): Setting up socket event handlers');
    if (!socket) {
      console.error('[EMBED PAGE] setupSocketEventHandlers(): Socket is null, cannot setup handlers');
      return;
    }

    // Call accepted
    socket.on('call:accepted', async (data: CallAcceptedEvent) => {
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call accepted event received:', data);
      callState = 'ringing';
      statusMessage = 'Agent accepted, connecting...';

      customerCallState.update(state => ({
        ...state,
        state: 'ringing',
        ui: {
          ...state.ui,
          statusMessage: 'Agent accepted, connecting...'
        }
      }));

      console.log('[EMBED PAGE] setupSocketEventHandlers(): Creating WebRTC offer');
      // Create and send WebRTC offer
      if (webrtcManager) {
        try {
          await webrtcManager.createOffer(data.callAttemptId);
          console.log('[EMBED PAGE] setupSocketEventHandlers(): WebRTC offer created successfully');
        } catch (error) {
          console.error('[EMBED PAGE] setupSocketEventHandlers(): Failed to create WebRTC offer:', error);
          handleConnectionFailure();
        }
      } else {
        console.error('[EMBED PAGE] setupSocketEventHandlers(): WebRTC manager is null');
      }
    });

    // WebRTC answer
    socket.on('webrtc:answer', async (data: WebRTCAnswerEvent) => {
      console.log('[EMBED PAGE] setupSocketEventHandlers(): WebRTC answer received:', data);
      if (webrtcManager) {
        try {
          await webrtcManager.setRemoteDescription(data.answer);
          console.log('[EMBED PAGE] setupSocketEventHandlers(): Remote description set successfully');
          // Server handles timeout management - connection is progressing
        } catch (error) {
          console.error('[EMBED PAGE] setupSocketEventHandlers(): Failed to set remote description:', error);
          handleConnectionFailure();
        }
      } else {
        console.error('[EMBED PAGE] setupSocketEventHandlers(): WebRTC manager is null when processing answer');
      }
    });

    // ICE candidate
    socket.on('webrtc:ice-candidate', async (data: WebRTCIceCandidateEvent) => {
      console.log('[EMBED PAGE] setupSocketEventHandlers(): ICE candidate received:', data);
      if (webrtcManager) {
        try {
          await webrtcManager.addIceCandidate(data.candidate);
          console.log('[EMBED PAGE] setupSocketEventHandlers(): ICE candidate added successfully');
        } catch (error) {
          console.error('[EMBED PAGE] setupSocketEventHandlers(): Failed to add ICE candidate:', error);
        }
      } else {
        console.error('[EMBED PAGE] setupSocketEventHandlers(): WebRTC manager is null when processing ICE candidate');
      }
    });

    // Call failures
    socket.on('call:busy', (data: CallBusyEvent) => {
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call busy event received:', data);
      handleCallFailure('All agents are busy. Please try again later.');
    });

    socket.on('call:unavailable', (data: CallUnavailableEvent) => {
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call unavailable event received:', data);
      handleCallFailure('No agents available right now.');
    });

    socket.on('call:timeout', (data: CallTimeoutEvent) => {
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call timeout event received:', data);
      handleCallFailure('No response from agents. Please try again.');
    });

    // Call failed (WebRTC connection failures and timeouts)
    socket.on('call:failed', (data: CallFailedEvent) => {
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call failed event received:', data);
      const message = data?.reason === 'connection_timeout'
        ? 'Connection timeout. Please try again.'
        : 'Connection failed. Please try again.';
      handleCallFailure(message);
    });

    // Call ended
    socket.on('call:ended', (data: CallEndedEvent) => {
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call ended event received:', data);
      
      // Clear any pending cleanup timeout since server responded
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }
      
      cleanup(); // Call cleanup directly - server already confirmed call end
    });
    
    console.log('[EMBED PAGE] setupSocketEventHandlers(): All socket event handlers setup complete');
  }

  async function initializeCustomerWebRTC(callId: string, localStream: MediaStream) {
    webrtcManager = new WebRTCManager(socket!);
    
    // Initialize with local stream
    await webrtcManager.initialize(callId);

    // Set up connection success handler
    const checkConnection = () => {
      const connectionState = webrtcManager?.getConnectionState();
      if (connectionState === 'connected') {
        callState = 'connected';
        statusMessage = 'Connected to agent';
        
        customerCallState.update(state => ({
          ...state,
          state: 'connected',
          ui: {
            ...state.ui,
            statusMessage: 'Connected to agent'
          }
        }));
      }
    };

    // Check connection state periodically
    const connectionCheckInterval = setInterval(() => {
      checkConnection();
      if (callState === 'connected' || callState === 'ended' || callState === 'failed') {
        clearInterval(connectionCheckInterval);
      }
    }, 1000);

    customerCallState.update(state => ({
      ...state,
      webrtc: {
        ...state.webrtc,
        peerConnection: webrtcManager?.getConnectionState() ? webrtcManager as any : null
      }
    }));
  }

  function handleConnectionFailure() {
    console.error('[EMBED PAGE] handleConnectionFailure(): Customer WebRTC connection failed');

    // Emit call:failed event
    if (socket && callAttemptId) {
      socket.emit('call:failed', {
        callAttemptId: callAttemptId,
        reason: 'connection_failed',  
        timestamp: Date.now()
      });
    }

    // UI cleanup will be handled by call:failed event from server
  }

  function handleCallFailure(message: string) {
    callState = 'failed';
    statusMessage = message;
    showCallControls = false;

    customerCallState.update(state => ({
      ...state,
      state: 'failed',
      ui: {
        ...state.ui,
        statusMessage: message,
        showCallControls: false
      }
    }));

    // Auto-reset after 3 seconds
    setTimeout(() => resetCustomerCallState(), 3000);
  }

  function handleMediaAccessError(error: Error) {
    console.error('[EMBED PAGE] handleMediaAccessError(): Media access error:', error);

    callState = 'failed';
    statusMessage = 'Please allow microphone access to make calls.';
    showCallButton = true;
    showCallControls = false;

    customerCallState.update(state => ({
      ...state,
      state: 'failed',
      ui: {
        ...state.ui,
        statusMessage: 'Please allow microphone access to make calls.',
        showCallControls: false,
        showCallButton: true
      }
    }));
  }

  function endCall() {
    if (socket && callAttemptId) {
      socket.emit('call:end', {
        callAttemptId,
        initiator: 'customer',
        reason: 'user_action',
        timestamp: Date.now()
      });
      // Don't cleanup here - wait for server's call:ended response to confirm
      
      // Failsafe: cleanup after 5 seconds if server doesn't respond
      cleanupTimeout = setTimeout(() => {
        console.log('[EMBED PAGE] endCall(): Server didn\'t respond to call:end, forcing cleanup');
        cleanup();
      }, 5000);
    } else {
      // If no socket or callAttemptId, cleanup immediately
      cleanup();
    }
  }

  function toggleMute() {
    if (!webrtcManager) return;

    isMuted = webrtcManager.toggleMute();

    customerCallState.update(state => ({
      ...state,
      ui: {
        ...state.ui,
        isMuted
      }
    }));
  }

  function resetCustomerCallState() {
    callState = 'idle';
    callAttemptId = null;
    statusMessage = '';
    isMuted = false;
    showCallButton = true;
    showCallControls = false;

    customerCallState.update(state => ({
      ...state,
      callAttemptId: null,
      state: 'idle',
      ui: {
        ...state.ui,
        showCallButton: true,
        showCallControls: false,
        statusMessage: '',
        isMuted: false
      }
    }));
  }

  function cleanup() {
    // Clear any pending cleanup timeout
    if (cleanupTimeout) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }

    // Stop media streams and close connections
    if (webrtcManager) {
      webrtcManager.cleanup();
      webrtcManager = null;
    }

    // Disconnect socket
    if (socket) {
      socket.disconnect();
      socket = null;
    }

    // Reset state
    resetCustomerCallState();
  }

  function getStatusColor(state: string) {
    switch (state) {
      case 'connected': return 'text-green-600';
      case 'connecting':
      case 'ringing': return 'text-yellow-600';
      case 'failed': return 'text-red-600';
      case 'ended': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
    <div class="text-center mb-8">
      <h1 class="text-3xl font-bold text-gray-800 mb-2">CallSafe</h1>
      <p class="text-gray-600">Anonymous Business Calling</p>
      {#if handle}
        <p class="text-sm text-gray-500 mt-2">Handle: <code class="bg-gray-100 px-2 py-1 rounded">{handle}</code></p>
      {/if}
      {#if sourceId}
        <p class="text-sm text-gray-500 mt-1">Source: <code class="bg-blue-100 px-2 py-1 rounded">{sourceId}</code></p>
      {/if}
    </div>

    <!-- Call Status -->
    <div class="mb-6">
      <div class="flex items-center justify-center mb-4">
        <div class="w-4 h-4 rounded-full mr-2 {callState === 'connected' ? 'bg-green-500' : ['connecting', 'ringing'].includes(callState) ? 'bg-yellow-500 animate-pulse' : callState === 'failed' ? 'bg-red-500' : 'bg-gray-400'}"></div>
        <span class="text-sm font-medium {getStatusColor(callState)}">
          {statusMessage || 'Ready to call'}
        </span>
      </div>
    </div>

    <!-- Main Call Interface -->
    <div class="space-y-4">
      {#if callState === 'idle'}
        <button
          on:click={initiateCall}
          disabled={!handle}
          class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center"
        >
          <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
          </svg>
          Start Call
        </button>
      {:else if callState === 'connecting' || callState === 'ringing'}
        <div class="text-center py-4">
          <div class="animate-pulse">
            <div class="w-16 h-16 bg-yellow-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-gray-600 mb-4">{statusMessage}</p>
          </div>
        </div>

        <!-- Call Controls during connecting -->
        <div class="flex space-x-4">
          <button
            on:click={toggleMute}
            class="flex-1 {isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            {#if isMuted}
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
      {:else if callState === 'connected'}
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
            class="flex-1 {isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            {#if isMuted}
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
      {:else if callState === 'failed'}
        <div class="text-center py-4">
          <div class="w-16 h-16 bg-red-200 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </div>
          <p class="text-red-600 font-semibold mb-4">{statusMessage}</p>
        </div>

        <button
          on:click={resetCustomerCallState}
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
        >
          Try Again
        </button>
      {:else if callState === 'ended'}
        <div class="text-center py-4">
          <div class="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18"/>
            </svg>
          </div>
          <p class="text-gray-600 font-semibold mb-4">Call Ended</p>
        </div>

        <button
          on:click={resetCustomerCallState}
          class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
        >
          Start New Call
        </button>
      {/if}
    </div>

    <!-- Hidden audio element for remote stream -->
    <audio 
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