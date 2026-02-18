<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { MessageTypes, PROTOCOL_VERSION } from '@callsafe/protocol';
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
  let incomingCalls: any[] = [];
  let callHistory: any[] = [];
  let currentCallStartTime: number | null = null;
  let callDuration = 0;
  let durationInterval: any = null;

  // UI state
  let currentPhase = 'terminated';
  let isMuted = false;

  onMount(async () => {
    // Check authentication
    const isAuthenticated = await AuthManager.isAuthenticated();
    if (!isAuthenticated) {
      goto('/');
      return;
    }

    // Load call history from localStorage
    loadCallHistory();

    // Initialize connection
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

      // Request microphone permission directly (enables audio autoplay)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });

        // Stop the stream immediately - we just needed permission
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
      const data = raw as { callAttemptId: string; sourceId: string; timestamp: number };
      console.log('[CONNECTION] setupSocketEventHandlers(): === INCOMING CALL DATA FORMAT ===');
      console.log('[CONNECTION] setupSocketEventHandlers(): Raw data received:', data);
      console.log('[CONNECTION] setupSocketEventHandlers(): Data type:', typeof data);
      console.log('[CONNECTION] setupSocketEventHandlers(): Data keys:', Object.keys(data));
      console.log('[CONNECTION] setupSocketEventHandlers(): Data values:', Object.values(data));
      console.log('[CONNECTION] setupSocketEventHandlers(): JSON stringified:', JSON.stringify(data, null, 2));
      console.log('[CONNECTION] setupSocketEventHandlers(): === END INCOMING CALL DATA ===');
      console.log('[CONNECTION] setupSocketEventHandlers(): Incoming call:', data);

      incomingCalls = [...incomingCalls, {
        callId: data.callAttemptId,
        sourceId: data.sourceId,
        timestamp: data.timestamp
      }];

      // Play incoming call sound
      playIncomingCallSound();

      callState.update(state => ({
        ...state,
        currentCall: {
          callAttemptId: data.callAttemptId,
          sourceId: data.sourceId,
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

    // Call accepted handler (confirmation from server)
    socket.on(MessageTypes.CALL_ACCEPTED, async (_raw) => {
      console.log('[CONNECTION] setupSocketEventHandlers(): Call accepted');
      // WebRTC is already initialized when accepting the call
      // This event confirms the call was accepted on the server side
      currentPhase = 'connecting';
    });

    // WebRTC offer handler (business receives offer from customer)
    socket.on(MessageTypes.WEBRTC_OFFER, async (raw) => {
      const data = raw as { offer: RTCSessionDescription; callAttemptId: string };
      console.log('[CONNECTION] setupSocketEventHandlers(): Received WebRTC offer');

      if (webrtcManager) {
        try {
          await webrtcManager.createAnswer(data.offer, data.callAttemptId);

          // Update call state to active once answer is sent
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
      const data = raw as { callAttemptId: string; timestamp: number; duration: number };
      console.log('[CONNECTION] setupSocketEventHandlers(): Call ended:', data);

      // Save to call history
      saveCallToHistory({
        callAttemptId: data.callAttemptId,
        sourceId: getCurrentCall()?.sourceId || 'unknown',
        startTime: currentCallStartTime || data.timestamp,
        endTime: data.timestamp,
        duration: data.duration,
        device: 'web',
        status: 'completed'
      });

      endCall();
    });

    // Call failed handler
    socket.on(MessageTypes.CALL_FAILED, (raw) => {
      const data = raw as { reason?: string };
      console.log('[CONNECTION] setupSocketEventHandlers(): Call failed:', data);

      const msg = data.reason === 'connection_timeout'
        ? 'Call connection timed out. Please try again.'
        : 'Call connection failed. Please try again.';

      handleCallFailure(msg);
    });

    // Call cancelled handler
    socket.on(MessageTypes.CALL_CANCELLED, (raw) => {
      const data = raw as { callAttemptId: string; reason: string };
      console.log('[CONNECTION] setupSocketEventHandlers(): Call cancelled:', data);

      // Stop any playing ringtone
      stopIncomingCallSound();

      // Remove from incoming calls UI
      incomingCalls = incomingCalls.filter(call => call.callId !== data.callAttemptId);

      // Update UI to show cancellation reason
      let statusMessage = '';
      switch (data.reason) {
        case 'customer_cancelled':
          statusMessage = 'Customer cancelled the call';
          break;
        case 'other_device_accepted':
          statusMessage = 'Call answered on another device';
          break;
        case 'timeout':
          statusMessage = 'Call timed out';
          break;
        default:
          statusMessage = 'Call was cancelled';
      }

      // Clean up any WebRTC resources if they were initialized
      if (webrtcManager) {
        webrtcManager.cleanup();
        webrtcManager = null;
      }

      // Update call state
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

      // Show brief notification if this was an incoming call that got cancelled
      if (data.reason !== 'other_device_accepted') {
        errorMessage = statusMessage;
        setTimeout(() => {
          errorMessage = '';
        }, 3000);
      }

      // Reset call state after brief delay
      setTimeout(() => {
        currentPhase = 'terminated';
        currentCallStartTime = null;
        callDuration = 0;
        isMuted = false;

        // Stop call timer if running
        if (durationInterval) {
          clearInterval(durationInterval);
          durationInterval = null;
        }
      }, 1000);
    });

    // Connection lifecycle events
    socket.on('open', () => {
      socketConnected = true;
      connectionStatus = 'Connected';
      errorMessage = '';
    });

    socket.on('close', () => {
      socketConnected = false;
      connectionStatus = 'Disconnected';
      isOnline = false;
    });
  }

  async function registerDevice() {
    if (!socket) return;

    // Fetch JWT for server-side authentication
    const tokenResponse = await fetch('/api/socket-token', { credentials: 'include' });
    if (!tokenResponse.ok) {
      console.error('[CONNECTION] registerDevice(): Failed to get auth token');
      errorMessage = 'Authentication failed. Please refresh the page.';
      return;
    }
    const { token } = await tokenResponse.json();

    socket.emit(MessageTypes.DEVICE_CONNECT, {
      deviceType: 'web',
      deviceId: generateDeviceId(),
      pushToken: null,
      protocolVersion: PROTOCOL_VERSION,
      token,
      timestamp: Date.now()
    });

    // Set device as online by default after successful connection
    socket.emit(MessageTypes.DEVICE_STATUS, {
      deviceId: generateDeviceId(),
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
      deviceId: generateDeviceId(),
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

  async function acceptCall(callId: string) {
    if (!socket) return;

    currentPhase = 'connecting';

    // Initialize WebRTC immediately when accepting the call (before sending call:accept)
    try {
      webrtcManager = new WebRTCManager(socket);
      await webrtcManager.initialize(callId);
    } catch (error) {
      console.error('[CONNECTION] acceptCall(): WebRTC initialization failed:', error);
      handleCallFailure('Failed to initialize audio');
      return;
    }

    socket.emit(MessageTypes.CALL_ACCEPT, {
      callAttemptId: callId,
      deviceType: 'web',
      deviceId: generateDeviceId(),
      timestamp: Date.now()
    });

    // Remove from incoming calls and stop ringtone
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
      deviceType: 'web',
      timestamp: Date.now()
    });

    // Remove from incoming calls and stop ringtone
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
        initiator: 'business',
        reason: 'user_action',
        timestamp: Date.now()
      });
    }

    // Stop any playing ringtone
    stopIncomingCallSound();

    // Clear any pending incoming calls UI
    incomingCalls = [];

    // Clean up WebRTC
    if (webrtcManager) {
      webrtcManager.cleanup();
      webrtcManager = null;
    }

    // Stop call timer
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }

    // Reset state
    currentPhase = 'terminated';
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

  function getCurrentCall() {
    const state = $callState;
    return state.currentCall;
  }

  function handleCallFailure(message: string) {
    errorMessage = message;

    // Clean up WebRTC
    if (webrtcManager) {
      webrtcManager.cleanup();
      webrtcManager = null;
    }

    // Reset state
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
    if (typeof document === 'undefined') return; // Skip on server-side

    const audioElement = document.querySelector('audio[src="/ringtone.mp3"]') as HTMLAudioElement;
    if (audioElement) {
      audioElement.loop = true;
      audioElement.play().catch(error => {
        console.log('[CONNECTION] playIncomingCallSound(): Could not play ringtone:', error);
        // Fallback: Show visual notification if audio fails
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
    callHistory = [callRecord, ...callHistory.slice(0, 49)]; // Keep last 50 calls
    localStorage.setItem(`callsafe_history_${handle}`, JSON.stringify(callHistory));
  }

  function stopIncomingCallSound() {
    if (typeof document === 'undefined') return; // Skip on server-side

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
    if (durationInterval) {
      clearInterval(durationInterval);
    }

    if (webrtcManager) {
      webrtcManager.cleanup();
    }

    if (connectionManager) {
      connectionManager.disconnect();
    }

    // Stop any playing ringtone
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
      <!-- Top Section: Title + Toggle -->
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

      <!-- Middle Section: Handle and Source ID -->
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

      <!-- Bottom Section: Unified Status Bar -->
      <div class="pt-4 border-t border-gray-200">
        <div class="flex items-center justify-between space-x-6">
          <!-- Connection Status -->
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full mr-2 {socketConnected ? 'bg-green-500' : 'bg-red-500'}"></div>
            <span class="text-sm font-medium {getStatusColor(connectionStatus)}">
              {connectionStatus}
            </span>
          </div>

          <!-- Device Status -->
          <div class="flex items-center">
            <div class="w-3 h-3 rounded-full mr-2 {socketConnected ? 'bg-green-500' : 'bg-red-500'}"></div>
            <span class="text-sm font-medium text-gray-700">
              💻 Web Dashboard ({socketConnected ? 'Online' : 'Offline'})
            </span>
          </div>

          <!-- Handle Status -->
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
              <div class="w-16 h-16 bg-yellow-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              </div>
              <p class="text-gray-600">Connecting to customer...</p>
            </div>
          </div>
        {:else if currentPhase === 'active'}
          <div class="text-center py-2 sm:py-4">
            <div class="w-12 h-12 sm:w-16 sm:h-16 bg-green-200 rounded-full mx-auto mb-2 sm:mb-4 flex items-center justify-center">
              <svg class="w-6 h-6 sm:w-8 sm:h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-green-600 font-semibold mb-2">Connected to Customer</p>
            <p class="text-xl sm:text-2xl font-mono text-green-700 font-bold mb-2 sm:mb-4 border border-green-200 bg-green-50 px-2 py-1 rounded">{formatDuration(callDuration)}</p>

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
              <div class="border border-blue-200 rounded-lg p-4 bg-blue-50 animate-pulse">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-semibold text-gray-800">New Customer Call</p>
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
                      on:click={() => acceptCall(call.callId)}
                      disabled={currentPhase !== 'terminated'}
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
    <audio
      autoplay
      hidden
      playsinline
      muted={false}
    ></audio>

    <audio
      src="/ringtone.mp3"
      preload="auto"
      hidden
    ></audio>
  </div>
</div>
