<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { MessageTypes, MediaToggleAction, PROTOCOL_VERSION } from '@callsafe/protocol';
  import { WsTransport } from '$lib/transport/ws-transport';
  import { WebRTCManager } from '$lib/managers/webrtc-manager';
  import { customerCallState } from '$lib/stores/call-state';
  import { generateUUID } from '$lib/utils/uuid';

  // Extract parameters - handle comes from URL path parameter for customer calls
  let handle = $page.params.handle || '';
  let sourceId = $page.url.searchParams.get('sourceId') || 'website';

  // Connection management
  let socket: WsTransport | null = null;
  let webrtcManager: WebRTCManager | null = null;

  // Call state
  let callAttemptId: string | null = null;
  let accepted = false;
  let callState: 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed' = 'idle';
  let callType: 'voice' | 'video' = 'voice';
  let statusMessage = '';
  let isMuted = false;
  let isVideoEnabled = true;
  let showCallButton = true;
  let showCallControls = false;
  let cleanupTimeout: any = null;
  let autoplayBlocked = false;

  // Streams held in state so the video elements re-bind whenever Svelte
  // recreates them on call-state transitions (ringing -> connected re-renders
  // a fresh <video>, which would otherwise lose its srcObject).
  let remoteVideoStream: MediaStream | null = null;
  let localVideoStream: MediaStream | null = null;

  function attachStream(node: HTMLVideoElement, stream: MediaStream | null) {
    const set = (s: MediaStream | null) => {
      if (node.srcObject !== s) {
        node.srcObject = s;
        if (s) node.play().catch(() => { autoplayBlocked = true; });
      }
    };
    set(stream);
    return { update: set };
  }

  onMount(() => {
    console.log('[EMBED PAGE] onMount(): Component mounted');
    console.log('[EMBED PAGE] onMount(): Handle:', handle);
    console.log('[EMBED PAGE] onMount(): Source ID:', sourceId);

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

  async function initiateCall(type: 'voice' | 'video') {
    console.log('[EMBED PAGE] initiateCall(): Initiate call requested, type:', type, 'current state:', callState);
    if (callState !== 'idle') {
      console.log('[EMBED PAGE] initiateCall(): Call already in progress, ignoring');
      return;
    }

    callType = type;

    console.log('[EMBED PAGE] initiateCall(): Starting call initiation process');
    try {
      callAttemptId = generateUUID();
      console.log('[EMBED PAGE] initiateCall(): Generated call attempt ID:', callAttemptId);

      console.log('[EMBED PAGE] initiateCall(): Updating UI state to connecting');
      callState = 'connecting';
      statusMessage = 'Finding agent...';
      showCallButton = false;
      showCallControls = true;

      customerCallState.update(state => ({
        ...state,
        callAttemptId,
        callType: type,
        state: 'connecting',
        ui: {
          ...state.ui,
          showCallButton: false,
          showCallControls: true,
          statusMessage: 'Finding agent...',
          isVideoEnabled: true
        }
      }));

      console.log('[EMBED PAGE] initiateCall(): Fetching guest token');
      const guest = await fetchGuestToken(getServerUrl(), handle);

      console.log('[EMBED PAGE] initiateCall(): Connecting to signaling server');
      await connectToSignalingServer();
      console.log('[EMBED PAGE] initiateCall(): Connected to signaling server');

      console.log('[EMBED PAGE] initiateCall(): Authenticating (device:connect)');
      socket!.emit(MessageTypes.DEVICE_CONNECT, {
        deviceType: 'web',
        deviceId: guest.deviceId,
        token: guest.token,
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now()
      });
      await socket!.waitFor(MessageTypes.DEVICE_CONNECTED);
      console.log('[EMBED PAGE] initiateCall(): Authenticated');

      console.log('[EMBED PAGE] initiateCall(): Initializing WebRTC');
      await initializeCustomerWebRTC(callAttemptId, type);
      console.log('[EMBED PAGE] initiateCall(): WebRTC initialized');

      console.log('[EMBED PAGE] initiateCall(): Sending call initiate event');
      socket!.emit(MessageTypes.CALL_INITIATE, {
        callAttemptId,
        handle,
        callType: type,
        mediaCapabilities: {
          canSend: type === 'video' ? ['audio', 'video'] : ['audio'],
          canReceive: type === 'video' ? ['audio', 'video'] : ['audio']
        },
        timestamp: Date.now()
      });
      console.log('[EMBED PAGE] initiateCall(): Call initiate event sent');

    } catch (error) {
      console.error('[EMBED PAGE] initiateCall(): Error during call initiation:', error);
      const err = error as Error;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        handleMediaAccessError(err);
      } else {
        // Guest-token fetch, socket, or auth handshake failure
        socket?.disconnect();
        socket = null;
        handleCallFailure('Unable to connect. Please try again.');
      }
    }
  }

  function getServerUrl(): string {
    return import.meta.env.VITE_SIGNALING_SERVER_URL || 'https://tunnel.callsafe.tech';
  }

  async function fetchGuestToken(serverUrl: string, businessHandle: string): Promise<{ token: string; deviceId: string }> {
    const response = await fetch(`${serverUrl}/api/v1/guest-token?handle=${encodeURIComponent(businessHandle)}`);
    if (!response.ok) {
      throw new Error(`Guest token request failed: ${response.status}`);
    }
    return response.json();
  }

  async function connectToSignalingServer(): Promise<void> {
    console.log('[EMBED PAGE] connectToSignalingServer(): Attempting to connect to signaling server');
    const wsUrl = getServerUrl().replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/ws';

    // A guest call cannot survive a socket loss (no call:reconnect support),
    // so a blind reconnect would only produce an unauthenticated socket.
    socket = new WsTransport(wsUrl, { autoReconnect: false });
    console.log('[EMBED PAGE] connectToSignalingServer(): WsTransport instance created');

    setupSocketEventHandlers();

    await socket.connect();
    console.log('[EMBED PAGE] connectToSignalingServer(): Connected successfully');
  }

  function setupSocketEventHandlers() {
    console.log('[EMBED PAGE] setupSocketEventHandlers(): Setting up socket event handlers');
    if (!socket) {
      console.error('[EMBED PAGE] setupSocketEventHandlers(): Socket is null, cannot setup handlers');
      return;
    }

    // Call initiated (server ack: business devices are now ringing)
    socket.on(MessageTypes.CALL_INITIATED, (raw) => {
      const data = raw as { callAttemptId: string; devicesNotified: number; timestamp: number };
      if (data.callAttemptId !== callAttemptId) return;
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call initiated ack received:', data);
      statusMessage = 'Ringing...';

      customerCallState.update(state => ({
        ...state,
        ui: {
          ...state.ui,
          statusMessage: 'Ringing...'
        }
      }));
    });

    // Call accepted
    socket.on(MessageTypes.CALL_ACCEPTED, async (raw) => {
      const data = raw as { callAttemptId: string; acceptingDeviceId: string; timestamp: number };
      if (data.callAttemptId !== callAttemptId) return;
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call accepted event received:', data);
      accepted = true;
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
    socket.on(MessageTypes.WEBRTC_ANSWER, async (raw) => {
      const data = raw as { answer: RTCSessionDescription; callAttemptId: string };
      console.log('[EMBED PAGE] setupSocketEventHandlers(): WebRTC answer received:', data);
      if (webrtcManager) {
        try {
          await webrtcManager.setRemoteDescription(data.answer);
          console.log('[EMBED PAGE] setupSocketEventHandlers(): Remote description set successfully');
        } catch (error) {
          console.error('[EMBED PAGE] setupSocketEventHandlers(): Failed to set remote description:', error);
          handleConnectionFailure();
        }
      } else {
        console.error('[EMBED PAGE] setupSocketEventHandlers(): WebRTC manager is null when processing answer');
      }
    });

    // ICE candidate
    socket.on(MessageTypes.WEBRTC_ICE_CANDIDATE, async (raw) => {
      const data = raw as { candidate: RTCIceCandidate; callAttemptId: string };
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
    socket.on(MessageTypes.CALL_BUSY, (raw) => {
      const data = raw as { callAttemptId: string };
      if (data.callAttemptId !== callAttemptId) return;
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call busy event received');
      handleCallFailure('All agents are busy. Please try again later.');
    });

    socket.on(MessageTypes.CALL_UNAVAILABLE, (raw) => {
      const data = raw as { callAttemptId: string; reason: string };
      if (data.callAttemptId !== callAttemptId) return;
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call unavailable event received:', data);
      handleCallFailure('No agents available right now.');
    });

    socket.on(MessageTypes.CALL_TIMEOUT, (raw) => {
      const data = raw as { callAttemptId: string; phase: string; timeoutDuration: number };
      if (data.callAttemptId !== callAttemptId) return;
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call timeout event received:', data);
      handleCallFailure('No response from agents. Please try again.');
    });

    socket.on(MessageTypes.CALL_FAILED, (raw) => {
      const data = raw as { callAttemptId: string; reason?: string };
      if (data.callAttemptId !== callAttemptId) return;
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call failed event received:', data);
      let message = 'Connection failed. Please try again.';
      switch (data.reason) {
        case 'media_permission_denied':
          message = 'The agent could not access their microphone or camera.';
          break;
        case 'peer_disconnected':
          message = 'The agent lost their connection.';
          break;
        case 'connection_failed':
        case 'internal_error':
        default:
          break;
      }
      handleCallFailure(message);
    });

    // Call ended
    socket.on(MessageTypes.CALL_ENDED, (raw) => {
      const data = raw as { callAttemptId: string; duration: number; reason: string; endedBy: string };
      if (data.callAttemptId !== callAttemptId) return;
      console.log('[EMBED PAGE] setupSocketEventHandlers(): Call ended event received:', data);

      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }

      cleanup();
    });

    console.log('[EMBED PAGE] setupSocketEventHandlers(): All socket event handlers setup complete');
  }

  async function initializeCustomerWebRTC(callId: string, type: 'voice' | 'video') {
    webrtcManager = new WebRTCManager(socket!);
    webrtcManager.onAutoplayBlocked = () => { autoplayBlocked = true; };

    // For video calls, route streams through component state (attachStream
    // action) instead of one-shot DOM queries; voice keeps the manager's
    // default audio-element handling.
    if (type === 'video') {
      webrtcManager.onRemoteStream = (stream) => {
        remoteVideoStream = stream;
      };
    }

    await webrtcManager.initialize(callId, type);

    if (type === 'video') {
      localVideoStream = webrtcManager.getLocalStream();
    }

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

    if (socket && callAttemptId) {
      socket.emit(MessageTypes.CALL_FAILED, {
        callAttemptId: callAttemptId,
        reason: 'connection_failed',
        timestamp: Date.now()
      });
    }
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

    setTimeout(() => resetCustomerCallState(), 3000);
  }

  function handleMediaAccessError(error: Error) {
    console.error('[EMBED PAGE] handleMediaAccessError(): Media access error:', error);

    callState = 'failed';
    showCallButton = true;
    showCallControls = false;

    const isCameraError = (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') && callType === 'video';
    statusMessage = isCameraError
      ? 'Please allow camera and microphone access for video calls.'
      : 'Please allow microphone access to make calls.';

    customerCallState.update(state => ({
      ...state,
      state: 'failed',
      ui: {
        ...state.ui,
        statusMessage,
        showCallControls: false,
        showCallButton: true
      }
    }));
  }

  function endCall() {
    if (socket && callAttemptId) {
      if (!accepted) {
        // Pre-accept the call is still initiated/ringing: call:end would be
        // an invalid transition — the caller abandons with call:cancel.
        socket.emit(MessageTypes.CALL_CANCEL, {
          callAttemptId,
          timestamp: Date.now()
        });
        cleanup();
      } else {
        socket.emit(MessageTypes.CALL_END, {
          callAttemptId,
          timestamp: Date.now()
        });

        cleanupTimeout = setTimeout(() => {
          console.log('[EMBED PAGE] endCall(): Server didn\'t respond to call:end, forcing cleanup');
          cleanup();
        }, 5000);
      }
    } else {
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

  function toggleCamera() {
    if (!webrtcManager || callType !== 'video') return;

    const isDisabled = webrtcManager.toggleCamera();
    isVideoEnabled = !isDisabled;

    customerCallState.update(state => ({
      ...state,
      ui: {
        ...state.ui,
        isVideoEnabled
      }
    }));

    if (socket && callAttemptId) {
      socket.emit(MessageTypes.MEDIA_TOGGLE, {
        callAttemptId,
        action: isDisabled ? MediaToggleAction.DISABLE_CAMERA : MediaToggleAction.ENABLE_CAMERA,
        timestamp: Date.now()
      });
    }
  }

  function resetCustomerCallState() {
    callState = 'idle';
    callAttemptId = null;
    accepted = false;
    callType = 'voice';
    statusMessage = '';
    isMuted = false;
    isVideoEnabled = true;
    showCallButton = true;
    showCallControls = false;

    customerCallState.update(state => ({
      ...state,
      callAttemptId: null,
      callType: 'voice',
      state: 'idle',
      ui: {
        ...state.ui,
        showCallButton: true,
        showCallControls: false,
        statusMessage: '',
        isMuted: false,
        isVideoEnabled: true
      }
    }));
  }

  function resumeAutoplay() {
    webrtcManager?.resumePlayback();
    autoplayBlocked = false;
  }

  function cleanup() {
    autoplayBlocked = false;
    remoteVideoStream = null;
    localVideoStream = null;

    if (cleanupTimeout) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }

    if (webrtcManager) {
      webrtcManager.cleanup();
      webrtcManager = null;
    }

    if (socket) {
      socket.disconnect();
      socket = null;
    }

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

    <!-- Autoplay blocked prompt -->
    {#if autoplayBlocked && ['connecting', 'ringing', 'connected'].includes(callState)}
      <div class="mb-4">
        <button
          on:click={resumeAutoplay}
          class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
        >
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
          </svg>
          Tap to enable audio
        </button>
      </div>
    {/if}

    <!-- Main Call Interface -->
    <div class="space-y-4">
      {#if callState === 'idle'}
        <!-- Voice Call button -->
        <button
          on:click={() => initiateCall('voice')}
          disabled={!handle}
          class="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center"
        >
          <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
          </svg>
          Voice Call
        </button>

        <!-- Video Call button -->
        <button
          on:click={() => initiateCall('video')}
          disabled={!handle}
          class="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center"
        >
          <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
          Video Call
        </button>

      {:else if callState === 'connecting' || callState === 'ringing'}

        <!-- Video preview area (video calls only) -->
        {#if callType === 'video'}
          <div class="relative rounded-xl overflow-hidden bg-gray-900 mb-4" style="min-height: 200px;">
            <video data-remote use:attachStream={remoteVideoStream} autoplay playsinline class="w-full h-full object-cover"></video>
            <video data-local use:attachStream={localVideoStream} autoplay playsinline muted class="absolute bottom-2 right-2 w-24 rounded-lg object-cover bg-gray-800 border border-gray-600"></video>
          </div>
        {/if}

        <div class="text-center py-4">
          <div class="animate-pulse">
            <div class="w-16 h-16 {callType === 'video' ? 'bg-blue-200' : 'bg-yellow-200'} rounded-full mx-auto mb-4 flex items-center justify-center">
              {#if callType === 'video'}
                <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              {:else}
                <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              {/if}
            </div>
            <p class="text-gray-600 mb-4">{statusMessage}</p>
          </div>
        </div>

        <!-- Call Controls during connecting -->
        <div class="flex space-x-2">
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

          {#if callType === 'video'}
            <button
              on:click={toggleCamera}
              class="flex-1 {!isVideoEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
            >
              {#if !isVideoEnabled}
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2zM3 3l18 18"/>
                </svg>
                Camera Off
              {:else}
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                Camera
              {/if}
            </button>
          {/if}

          <button
            on:click={endCall}
            class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18"/>
            </svg>
            End
          </button>
        </div>

      {:else if callState === 'connected'}

        <!-- Video area (video calls only) -->
        {#if callType === 'video'}
          <div class="relative rounded-xl overflow-hidden bg-gray-900 mb-4" style="min-height: 200px;">
            <video data-remote use:attachStream={remoteVideoStream} autoplay playsinline class="w-full h-full object-cover"></video>
            <video data-local use:attachStream={localVideoStream} autoplay playsinline muted class="absolute bottom-2 right-2 w-24 rounded-lg object-cover bg-gray-800 border border-gray-600"></video>
          </div>
        {/if}

        <div class="text-center py-4">
          <div class="w-16 h-16 {callType === 'video' ? 'bg-blue-200' : 'bg-green-200'} rounded-full mx-auto mb-4 flex items-center justify-center">
            {#if callType === 'video'}
              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            {:else}
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            {/if}
          </div>
          <p class="{callType === 'video' ? 'text-blue-600' : 'text-green-600'} font-semibold mb-4">Connected to Agent</p>
        </div>

        <!-- Call Controls -->
        <div class="flex space-x-2">
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

          {#if callType === 'video'}
            <button
              on:click={toggleCamera}
              class="flex-1 {!isVideoEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
            >
              {#if !isVideoEnabled}
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2zM3 3l18 18"/>
                </svg>
                Camera Off
              {:else}
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                Camera
              {/if}
            </button>
          {/if}

          <button
            on:click={endCall}
            class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18"/>
            </svg>
            End
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

    <!-- Hidden audio element for voice calls -->
    {#if callType !== 'video'}
      <audio autoplay hidden playsinline muted={false}></audio>
    {/if}

    <!-- Footer -->
    <div class="mt-8 pt-6 border-t border-gray-200">
      <p class="text-xs text-gray-500 text-center">
        Secure • Anonymous • Private
      </p>
    </div>
  </div>
</div>
