<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { MessageTypes, PROTOCOL_VERSION, MediaToggleAction } from '@callsafe/protocol';
  import { AuthManager } from '$lib/managers/auth-manager';
  import { ConnectionManager } from '$lib/managers/connection-manager';
  import { WebRTCManager } from '$lib/managers/webrtc-manager';
  import { WsTransport } from '$lib/transport/ws-transport';
  import { callState } from '$lib/stores/call-state';
  import { generateDeviceId } from '$lib/utils/uuid';

  // Extract parameters
  let handle = $page.params.handle || '';
  let sourceId = $page.url.searchParams.get('sourceId') || '';

  // Connection management
  let connectionManager: ConnectionManager;
  let webrtcManager: WebRTCManager | null = null;
  let socket: WsTransport | null = null;
  let socketConnected = false;
  let errorMessage = '';
  let connectionStatus = 'Disconnected';

  // Call state
  let isOnline = false;
  let incomingCalls: Array<{ callId: string; sourceId: string; callType: 'voice' | 'video'; timestamp: number }> = [];
  let callHistory: any[] = [];
  let currentCallStartTime: number | null = null;
  let callDuration = 0;
  let durationInterval: any = null;

  // UI state
  let currentPhase = 'terminated';
  let currentCallType: 'voice' | 'video' = 'voice';
  let isMuted = false;
  let isCameraEnabled = true;
  let autoplayBlocked = false;

  // Streams held in state so the video elements re-bind whenever Svelte
  // recreates them on phase transitions (the 'active' branch mounts a fresh
  // <video> after remote tracks have already arrived during 'connecting').
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

  onMount(async () => {
    const isAuthenticated = await AuthManager.isAuthenticated();
    if (!isAuthenticated) {
      goto('/');
      return;
    }

    loadCallHistory();
    await initializeConnection();
  });

  onDestroy(() => {
    cleanup();
  });

  async function initializeConnection() {
    try {
      connectionManager = new ConnectionManager();
      socket = await connectionManager.connect();

      socketConnected = true;
      connectionStatus = 'Connected';
      errorMessage = '';

      // Request microphone permission (enables audio autoplay)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });

        stream.getTracks().forEach(track => track.stop());

        console.log('[CONNECTION] initializeConnection(): Microphone permission granted - audio autoplay enabled');
      } catch (micError) {
        console.warn('[CONNECTION] initializeConnection(): Microphone permission denied:', micError);
        errorMessage = 'Microphone access required for calls. Please refresh and allow microphone access.';
      }

      setupSocketEventHandlers();
      await registerDevice();

    } catch (error) {
      console.error('[CONNECTION] initializeConnection(): Connection failed:', error);
      errorMessage = 'Failed to connect to server';
      socketConnected = false;
      connectionStatus = 'Failed';
    }
  }

  function setupSocketEventHandlers() {
    if (!socket) return;

    // Incoming call handler
    socket.on(MessageTypes.CALL_INCOMING, (raw) => {
      const data = raw as { callAttemptId: string; sourceId: string; callType?: string; timestamp: number };
      console.log('[CONNECTION] setupSocketEventHandlers(): Incoming call:', data);

      const incomingCallType = (data.callType === 'video' ? 'video' : 'voice') as 'voice' | 'video';

      incomingCalls = [...incomingCalls, {
        callId: data.callAttemptId,
        sourceId: data.sourceId,
        callType: incomingCallType,
        timestamp: data.timestamp
      }];

      playIncomingCallSound();

      callState.update(state => ({
        ...state,
        currentCall: {
          callAttemptId: data.callAttemptId,
          sourceId: data.sourceId,
          callType: incomingCallType,
          state: 'incoming',
          startTime: data.timestamp,
          duration: 0
        },
        ui: {
          ...state.ui,
          showIncomingCallModal: true
        }
      }));
    });

    // Call accepted handler
    socket.on(MessageTypes.CALL_ACCEPTED, async (_raw) => {
      console.log('[CONNECTION] setupSocketEventHandlers(): Call accepted');
      currentPhase = 'connecting';
    });

    // WebRTC offer handler (agent receives offer from customer)
    socket.on(MessageTypes.WEBRTC_OFFER, async (raw) => {
      const data = raw as { offer: RTCSessionDescription; callAttemptId: string };
      console.log('[CONNECTION] setupSocketEventHandlers(): Received WebRTC offer');

      if (webrtcManager) {
        try {
          await webrtcManager.createAnswer(data.offer, data.callAttemptId);

          currentPhase = 'active';
          startCallTimer();

          callState.update(state => ({
            ...state,
            currentCall: state.currentCall ? {
              ...state.currentCall,
              state: 'connected'
            } : null
          }));
        } catch (error) {
          console.error('[CONNECTION] setupSocketEventHandlers(): Failed to create WebRTC answer:', error);
          handleCallFailure('Failed to establish connection');
        }
      } else {
        console.error('[CONNECTION] setupSocketEventHandlers(): WebRTC manager not initialized when receiving offer');
        handleCallFailure('Failed to establish connection');
      }
    });

    // WebRTC answer handler
    socket.on(MessageTypes.WEBRTC_ANSWER, async (raw) => {
      const data = raw as { answer: RTCSessionDescription; callAttemptId: string };
      console.log('[CONNECTION] setupSocketEventHandlers(): Received WebRTC answer');

      if (webrtcManager) {
        try {
          await webrtcManager.setRemoteDescription(data.answer);
          currentPhase = 'active';
          startCallTimer();
        } catch (error) {
          console.error('[CONNECTION] setupSocketEventHandlers(): WebRTC set remote description failed:', error);
          handleCallFailure('Failed to establish connection');
        }
      }
    });

    // ICE candidate handler
    socket.on(MessageTypes.WEBRTC_ICE_CANDIDATE, async (raw) => {
      const data = raw as { candidate: RTCIceCandidate; callAttemptId: string };
      if (webrtcManager) {
        try {
          await webrtcManager.addIceCandidate(data.candidate);
        } catch (error) {
          console.error('[CONNECTION] setupSocketEventHandlers(): Failed to add ICE candidate:', error);
        }
      }
    });

    // Call ended handler
    socket.on(MessageTypes.CALL_ENDED, (raw) => {
      const data = raw as { callAttemptId: string; timestamp: number; duration: number; reason: string; endedBy: string };
      console.log('[CONNECTION] setupSocketEventHandlers(): Call ended:', data);

      saveCallToHistory({
        callAttemptId: data.callAttemptId,
        sourceId: getCurrentCall()?.sourceId || 'unknown',
        startTime: currentCallStartTime || data.timestamp,
        endTime: data.timestamp,
        duration: data.duration,
        endedBy: data.endedBy,
        device: 'web',
        status: 'completed'
      });

      resetCallUI();
    });

    // Call failed handler
    socket.on(MessageTypes.CALL_FAILED, (raw) => {
      const data = raw as { reason?: string };
      console.log('[CONNECTION] setupSocketEventHandlers(): Call failed:', data);

      let msg = 'Call connection failed. Please try again.';
      switch (data.reason) {
        case 'media_permission_denied':
          msg = 'The other party could not access their microphone or camera.';
          break;
        case 'peer_disconnected':
          msg = 'The other party lost their connection.';
          break;
        case 'connection_failed':
        case 'internal_error':
        default:
          break;
      }

      // The call is already terminal server-side — reset locally without
      // echoing call:end back.
      errorMessage = msg;
      setTimeout(() => {
        resetCallUI();
        errorMessage = '';
      }, 3000);
    });

    // Call timeout handler (terminal: ringing or connecting phase expired server-side)
    socket.on(MessageTypes.CALL_TIMEOUT, (raw) => {
      const data = raw as { callAttemptId: string; phase: string; timeoutDuration: number; timestamp: number };
      console.log('[CONNECTION] setupSocketEventHandlers(): Call timeout:', data);

      if (data.phase === 'ringing') {
        stopIncomingCallSound();
        incomingCalls = incomingCalls.filter(call => call.callId !== data.callAttemptId);
        callState.update(state => ({
          ...state,
          currentCall: state.currentCall?.callAttemptId === data.callAttemptId ? null : state.currentCall,
          ui: { ...state.ui, showIncomingCallModal: false }
        }));
      } else {
        resetCallUI();
      }

      errorMessage = 'Call timed out';
      setTimeout(() => {
        errorMessage = '';
      }, 3000);
    });

    // Call cancelled handler
    socket.on(MessageTypes.CALL_CANCELLED, (raw) => {
      const data = raw as { callAttemptId: string; reason: string };
      console.log('[CONNECTION] setupSocketEventHandlers(): Call cancelled:', data);

      stopIncomingCallSound();
      incomingCalls = incomingCalls.filter(call => call.callId !== data.callAttemptId);

      let statusMessage = '';
      switch (data.reason) {
        case 'cancelled_by_caller':
          statusMessage = 'Customer cancelled the call';
          break;
        case 'answered_elsewhere':
          statusMessage = 'Call answered on another device';
          break;
        default:
          statusMessage = 'Call was cancelled';
      }

      if (webrtcManager) {
        webrtcManager.cleanup();
        webrtcManager = null;
      }
      remoteVideoStream = null;
      localVideoStream = null;

      callState.update(state => ({
        ...state,
        currentCall: state.currentCall?.callAttemptId === data.callAttemptId ? null : state.currentCall,
        ui: {
          ...state.ui,
          showIncomingCallModal: false,
          showCallControls: false,
          status: isOnline ? 'available' : 'unavailable'
        }
      }));

      if (data.reason !== 'answered_elsewhere') {
        errorMessage = statusMessage;
        setTimeout(() => {
          errorMessage = '';
        }, 3000);
      }

      setTimeout(() => {
        currentPhase = 'terminated';
        currentCallType = 'voice';
        isCameraEnabled = true;
        currentCallStartTime = null;
        callDuration = 0;
        isMuted = false;

        if (durationInterval) {
          clearInterval(durationInterval);
          durationInterval = null;
        }
      }, 1000);
    });

    // Connection lifecycle events
    socket.on('open', (data) => {
      socketConnected = true;
      connectionStatus = 'Connected';
      errorMessage = '';

      // The transport re-opened a fresh socket: the server no longer knows us,
      // so the device:connect handshake must be redone with a fresh token.
      if (data.reconnected) {
        registerDevice();
      }
    });

    socket.on('close', () => {
      socketConnected = false;
      connectionStatus = 'Disconnected';
      isOnline = false;
    });
  }

  async function registerDevice() {
    if (!socket) return;

    const deviceId = generateDeviceId();

    // The signaling server enforces deviceId == token.device_id, so the
    // token must be minted for this device.
    const tokenResponse = await fetch(`/api/socket-token?deviceId=${deviceId}`, { credentials: 'include' });
    if (!tokenResponse.ok) {
      console.error('[CONNECTION] registerDevice(): Failed to get auth token');
      errorMessage = 'Authentication failed. Please refresh the page.';
      return;
    }
    const { token } = await tokenResponse.json();

    socket.emit(MessageTypes.DEVICE_CONNECT, {
      deviceType: 'web',
      deviceId,
      protocolVersion: PROTOCOL_VERSION,
      token,
      timestamp: Date.now()
    });

    try {
      await socket.waitFor(MessageTypes.DEVICE_CONNECTED);
    } catch (error) {
      console.error('[CONNECTION] registerDevice(): device:connect handshake failed:', error);
      errorMessage = 'Authentication failed. Please refresh the page.';
      return;
    }

    socket.emit(MessageTypes.DEVICE_STATUS, {
      status: 'available',
      timestamp: Date.now()
    });

    isOnline = true;
    connectionStatus = 'Online - Waiting for calls';
  }

  function toggleOnlineStatus() {
    if (!handle || !socket) {
      errorMessage = 'No handle specified or not connected';
      return;
    }

    const newStatus = !isOnline;

    socket.emit(MessageTypes.DEVICE_STATUS, {
      status: newStatus ? 'available' : 'unavailable',
      timestamp: Date.now()
    });

    isOnline = newStatus;
    connectionStatus = isOnline ? 'Online - Waiting for calls' : 'Connected';
    errorMessage = '';

    callState.update(state => ({
      ...state,
      ui: {
        ...state.ui,
        status: newStatus ? 'available' : 'unavailable'
      }
    }));
  }

  async function acceptCall(callId: string, callType: 'voice' | 'video' = 'voice') {
    if (!socket) return;

    currentPhase = 'connecting';
    currentCallType = callType;
    isCameraEnabled = true;

    try {
      webrtcManager = new WebRTCManager(socket);
      webrtcManager.onAutoplayBlocked = () => { autoplayBlocked = true; };
      // For video calls, route streams through component state (attachStream
      // action) — the manager's default DOM query runs while the 'active'
      // branch (and its <video> elements) doesn't exist yet.
      if (callType === 'video') {
        webrtcManager.onRemoteStream = (stream) => {
          remoteVideoStream = stream;
        };
      }
      await webrtcManager.initialize(callId, callType);
      if (callType === 'video') {
        localVideoStream = webrtcManager.getLocalStream();
      }
    } catch (error) {
      console.error('[CONNECTION] acceptCall(): WebRTC initialization failed:', error);
      handleCallFailure(callType === 'video' ? 'Failed to initialize camera/audio' : 'Failed to initialize audio');
      return;
    }

    socket.emit(MessageTypes.CALL_ACCEPT, {
      callAttemptId: callId,
      mediaCapabilities: {
        canSend: callType === 'video' ? ['audio', 'video'] : ['audio'],
        canReceive: callType === 'video' ? ['audio', 'video'] : ['audio']
      },
      timestamp: Date.now()
    });

    incomingCalls = incomingCalls.filter(call => call.callId !== callId);
    stopIncomingCallSound();
    currentCallStartTime = Date.now();

    callState.update(state => ({
      ...state,
      ui: {
        ...state.ui,
        showIncomingCallModal: false,
        showCallControls: true,
        status: 'busy'
      }
    }));
  }

  function declineCall(callId: string) {
    if (!socket) return;

    socket.emit(MessageTypes.CALL_REJECT, {
      callAttemptId: callId,
      timestamp: Date.now()
    });

    incomingCalls = incomingCalls.filter(call => call.callId !== callId);
    stopIncomingCallSound();

    callState.update(state => ({
      ...state,
      ui: {
        ...state.ui,
        showIncomingCallModal: false
      }
    }));
  }

  function endCall() {
    if (getCurrentCall() && socket) {
      socket.emit(MessageTypes.CALL_END, {
        callAttemptId: getCurrentCall()?.callAttemptId,
        timestamp: Date.now()
      });
    }

    resetCallUI();
  }

  // Local-only teardown: safe to run when the call already terminated
  // server-side (call:ended, call:timeout) without echoing call:end back.
  function resetCallUI() {
    stopIncomingCallSound();
    incomingCalls = [];
    remoteVideoStream = null;
    localVideoStream = null;

    if (webrtcManager) {
      webrtcManager.cleanup();
      webrtcManager = null;
    }

    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }

    currentPhase = 'terminated';
    currentCallType = 'voice';
    isCameraEnabled = true;
    currentCallStartTime = null;
    callDuration = 0;
    isMuted = false;

    callState.update(state => ({
      ...state,
      currentCall: null,
      ui: {
        ...state.ui,
        showCallControls: false,
        showIncomingCallModal: false,
        status: isOnline ? 'available' : 'unavailable',
        isMuted: false
      }
    }));
  }

  function resumeAutoplay() {
    webrtcManager?.resumePlayback();
    autoplayBlocked = false;
  }

  function toggleMute() {
    if (!webrtcManager) return;

    isMuted = webrtcManager.toggleMute();

    callState.update(state => ({
      ...state,
      ui: {
        ...state.ui,
        isMuted
      }
    }));
  }

  function toggleCamera() {
    if (!webrtcManager || currentCallType !== 'video') return;

    const isDisabled = webrtcManager.toggleCamera();
    isCameraEnabled = !isDisabled;

    if (socket && getCurrentCall()) {
      socket.emit(MessageTypes.MEDIA_TOGGLE, {
        callAttemptId: getCurrentCall()!.callAttemptId,
        action: isDisabled ? MediaToggleAction.DISABLE_CAMERA : MediaToggleAction.ENABLE_CAMERA,
        timestamp: Date.now()
      });
    }
  }

  function getCurrentCall() {
    const state = $callState;
    return state.currentCall;
  }

  function handleCallFailure(message: string) {
    errorMessage = message;

    if (webrtcManager) {
      webrtcManager.cleanup();
      webrtcManager = null;
    }

    setTimeout(() => {
      endCall();
      errorMessage = '';
    }, 3000);
  }

  function startCallTimer() {
    if (durationInterval) return;

    durationInterval = setInterval(() => {
      if (currentCallStartTime) {
        callDuration = Math.floor((Date.now() - currentCallStartTime) / 1000);
      }
    }, 1000);
  }

  function playIncomingCallSound() {
    if (typeof document === 'undefined') return;

    const audioElement = document.querySelector('audio[src="/ringtone.mp3"]') as HTMLAudioElement;
    if (audioElement) {
      audioElement.loop = true;
      audioElement.play().catch(error => {
        console.log('[CONNECTION] playIncomingCallSound(): Could not play ringtone:', error);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Incoming Call', {
            body: 'You have an incoming call',
            icon: '/favicon.svg'
          });
        }
      });
    }
  }

  function saveCallToHistory(callRecord: any) {
    callHistory = [callRecord, ...callHistory.slice(0, 49)];
    localStorage.setItem(`callsafe_history_${handle}`, JSON.stringify(callHistory));
  }

  function stopIncomingCallSound() {
    if (typeof document === 'undefined') return;

    const audioElement = document.querySelector('audio[src="/ringtone.mp3"]') as HTMLAudioElement;
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      audioElement.loop = false;
    }
  }

  function loadCallHistory() {
    try {
      const saved = localStorage.getItem(`callsafe_history_${handle}`);
      if (saved) {
        callHistory = JSON.parse(saved);
      }
    } catch (error) {
      console.error('[CONNECTION] loadCallHistory(): Failed to load call history:', error);
    }
  }

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'Connected': return 'text-green-600';
      case 'Online - Waiting for calls': return 'text-green-600';
      case 'Disconnected': return 'text-red-600';
      case 'Failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  }

  function clearError() {
    errorMessage = '';
  }

  function backToDashboard() {
    goto('/user');
  }

  function cleanup() {
    autoplayBlocked = false;
    remoteVideoStream = null;
    localVideoStream = null;

    if (durationInterval) {
      clearInterval(durationInterval);
    }

    if (webrtcManager) {
      webrtcManager.cleanup();
    }

    if (connectionManager) {
      connectionManager.disconnect();
    }

    stopIncomingCallSound();
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 p-4">
  <div class="max-w-4xl mx-auto">
    <!-- Breadcrumb Navigation -->
    <nav class="mb-4" aria-label="Breadcrumb">
      <ol class="flex items-center space-x-2 text-sm text-gray-600">
        <li>
          <button
            on:click={backToDashboard}
            class="hover:text-blue-600 transition-colors duration-200 font-medium"
          >
            Dashboard
          </button>
        </li>
        <li>
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </li>
        <li class="text-gray-900 font-medium">
          Agent Portal
          {#if handle}
            <span class="text-gray-500 font-normal">({handle})</span>
          {/if}
        </li>
      </ol>
    </nav>

    <!-- Header -->
    <div class="bg-white rounded-2xl shadow-xl p-6 mb-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="text-3xl font-bold text-gray-800">Agent Dashboard</h1>
          <p class="text-gray-600">CallSafe Business Portal</p>
        </div>

        <button
          on:click={toggleOnlineStatus}
          disabled={!socketConnected || !handle}
          class="px-6 py-2 rounded-lg font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed {isOnline ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}"
        >
          {isOnline ? 'Go Offline' : 'Go Online'}
        </button>
      </div>

      {#if handle || sourceId}
        <div class="flex items-center space-x-4 mb-4">
          {#if handle}
            <div class="flex items-center">
              <span class="text-sm text-gray-500 mr-2">Handle:</span>
              <code class="bg-gray-100 px-2 py-1 rounded text-sm">{handle}</code>
            </div>
          {/if}
          {#if sourceId}
            <div class="flex items-center">
              <span class="text-sm text-gray-500 mr-2">Source:</span>
              <code class="bg-blue-100 px-2 py-1 rounded text-sm">{sourceId}</code>
            </div>
          {/if}
        </div>
      {/if}

      <div class="pt-4 border-t border-gray-200">
        <div class="flex items-center justify-between space-x-6">
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full mr-2 {socketConnected ? 'bg-green-500' : 'bg-red-500'}"></div>
            <span class="text-sm font-medium {getStatusColor(connectionStatus)}">
              {connectionStatus}
            </span>
          </div>

          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full mr-2 {socketConnected ? 'bg-green-500' : 'bg-red-500'}"></div>
            <span class="text-sm font-medium text-gray-700">
              💻 Web Dashboard ({socketConnected ? 'Online' : 'Offline'})
            </span>
          </div>

          <div class="flex items-center">
            <span class="text-sm font-medium text-gray-600 mr-2">Handle:</span>
            <span class="text-sm font-semibold {currentPhase === 'active' ? 'text-red-600' : 'text-green-600'}">
              {currentPhase === 'active' ? 'Busy' : 'Available'}
            </span>
          </div>
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

        {#if currentPhase === 'terminated'}
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
        {:else if currentPhase === 'connecting'}
          <div class="text-center py-8">
            <div class="animate-pulse">
              <div class="w-16 h-16 {currentCallType === 'video' ? 'bg-blue-200' : 'bg-yellow-200'} rounded-full mx-auto mb-4 flex items-center justify-center">
                {#if currentCallType === 'video'}
                  <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                {:else}
                  <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                  </svg>
                {/if}
              </div>
              <p class="text-gray-600">Connecting to customer...</p>
            </div>
          </div>
        {:else if currentPhase === 'active'}
          <div class="py-2 sm:py-4">

            <!-- Autoplay blocked prompt -->
            {#if autoplayBlocked}
              <button
                on:click={resumeAutoplay}
                class="w-full mb-4 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
              >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
                </svg>
                Tap to enable audio
              </button>
            {/if}

            <!-- Video area (video calls only) -->
            {#if currentCallType === 'video'}
              <div class="relative rounded-xl overflow-hidden bg-gray-900 mb-4" style="min-height: 200px;">
                <video data-remote use:attachStream={remoteVideoStream} autoplay playsinline class="w-full h-full object-cover"></video>
                <video data-local use:attachStream={localVideoStream} autoplay playsinline muted class="absolute bottom-2 right-2 w-24 rounded-lg object-cover bg-gray-800 border border-gray-600"></video>
              </div>
            {/if}

            <div class="text-center mb-4">
              <div class="w-12 h-12 sm:w-16 sm:h-16 {currentCallType === 'video' ? 'bg-blue-200' : 'bg-green-200'} rounded-full mx-auto mb-2 sm:mb-4 flex items-center justify-center">
                {#if currentCallType === 'video'}
                  <svg class="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                {:else}
                  <svg class="w-6 h-6 sm:w-8 sm:h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                  </svg>
                {/if}
              </div>
              <p class="{currentCallType === 'video' ? 'text-blue-600' : 'text-green-600'} font-semibold mb-2">Connected to Customer</p>
              <p class="text-xl sm:text-2xl font-mono text-green-700 font-bold mb-2 sm:mb-4 border border-green-200 bg-green-50 px-2 py-1 rounded">{formatDuration(callDuration)}</p>
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

              {#if currentCallType === 'video'}
                <button
                  on:click={toggleCamera}
                  class="flex-1 {!isCameraEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
                >
                  {#if !isCameraEnabled}
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
              <div class="border {call.callType === 'video' ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'} rounded-lg p-4 animate-pulse">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      {#if call.callType === 'video'}
                        <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                        </svg>
                        <p class="font-semibold text-gray-800">Incoming Video Call</p>
                      {:else}
                        <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                        </svg>
                        <p class="font-semibold text-gray-800">Incoming Voice Call</p>
                      {/if}
                    </div>
                    <p class="text-sm text-gray-600">Call ID: {call.callId.slice(-8)}</p>
                    {#if call.sourceId}
                      <p class="text-sm text-blue-600">Source: {call.sourceId}</p>
                    {/if}
                    <p class="text-xs text-gray-500">
                      {new Date(call.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <div class="flex space-x-2">
                    <button
                      on:click={() => acceptCall(call.callId, call.callType)}
                      disabled={currentPhase !== 'terminated'}
                      class="{call.callType === 'video' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition-colors duration-200"
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

    <!-- Call History Section -->
    <div class="bg-white rounded-2xl shadow-xl p-6 mt-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-4">Recent Calls</h2>

      {#if callHistory.length === 0}
        <div class="text-center py-8">
          <div class="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2"/>
            </svg>
          </div>
          <p class="text-gray-500">No recent calls</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each callHistory as call}
            <div class="border border-gray-200 rounded-lg p-4">
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-3 h-3 rounded-full {call.status === 'completed' ? 'bg-green-500' : call.status === 'timeout' ? 'bg-yellow-500' : call.status === 'cancelled' ? 'bg-gray-500' : call.status === 'missed' ? 'bg-orange-500' : 'bg-red-500'}"></div>
                    <span class="font-medium text-sm capitalize">
                      {call.status === 'completed' ? 'Completed' : call.status === 'timeout' ? 'Timeout' : call.status === 'cancelled' ? 'Cancelled' : call.status === 'missed' ? 'Missed Call' : 'Failed'}
                    </span>
                  </div>
                  <div class="text-xs text-gray-600 mb-1">
                    {new Date(call.startTime).toLocaleString()}
                  </div>
                  {#if call.sourceId}
                    <div class="text-xs text-blue-600">Source: {call.sourceId}</div>
                  {/if}
                </div>
                <div class="text-right ml-4">
                  {#if call.duration > 0}
                    <div class="text-sm font-mono font-semibold text-gray-700">
                      {formatDuration(call.duration)}
                    </div>
                  {/if}
                  <div class="text-xs text-gray-500 mt-1">
                    #{call.callAttemptId.slice(-6)}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Hidden audio elements -->
    <audio autoplay hidden playsinline muted={false}></audio>
    <audio src="/ringtone.mp3" preload="auto" hidden></audio>
  </div>
</div>
