<script lang="ts">
  // Rationalized Embed Component for CallSafe Customer Widget
  // Uses unified call state machine and rationalized events
  
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { WebRTCManager } from '$lib/webrtc.js';
  import { SocketManager } from '$lib/socket.js';
  import { connectionMonitor } from '$lib/monitoring.js';
  import { generateUUID } from '$lib/utils/uuid.js';
  
  // Import rationalized event system
  import { 
    CallStateMachine, 
    createCallStateMachine,
    CallStateMachineHelper 
  } from '$lib/call-state-machine.js';
  import type { 
    CallPhase,
    CallStateChangedEvent,
    CallTerminatedEvent,
    CallErrorEvent,
    UIControlChangedEvent,
    WebRTCStateEvent,
    CallIdentifier
  } from '$lib/types/rationalized-events.js';
  import { createCallIdentifier, createDeviceContext } from '$lib/types/rationalized-events.js';

  // Component state
  let webrtc: WebRTCManager;
  let socket: SocketManager;
  let callStateMachine: CallStateMachine;
  
  // UI reactive state (derived from state machine)
  let isConnecting = false;
  let errorMessage = '';
  let connectionStatus = 'Disconnected';
  let remoteAudio: HTMLAudioElement;
  let connectionRetryCount = 0;
  let handle = '';
  let sourceId = '';

  // Constants
  const MAX_RETRY_ATTEMPTS = 2;
  const WEBRTC_FAILURE_DELAY = 20000;

  // Extract parameters
  $: handle = $page.params.handle || '';
  $: sourceId = $page.url.searchParams.get('sourceId') || '';

  // Reactive state derived from call state machine
  $: if (callStateMachine) {
    const state = callStateMachine.getCurrentState();
    isConnecting = ['routing', 'ringing', 'connecting'].includes(state.phase);
    connectionStatus = getConnectionStatusMessage(state.phase);
  }

  onMount(() => {
    webrtc = new WebRTCManager(true);
    socket = new SocketManager();
    
    // Enable rationalized events
    socket.enableRationalizedEvents(true);
    
    setupWebRTCHandlers();
    setupRationalizedSocketHandlers();
  });

  onDestroy(() => {
    if (callStateMachine) {
      callStateMachine.forceTerminate('component_destroyed', 'customer');
    }
    if (webrtc) {
      webrtc.endCall();
    }
    if (socket) {
      socket.disconnect();
    }
  });

  // =============================================================================
  // WEBRTC SETUP (Enhanced with State Machine Integration)
  // =============================================================================

  function setupWebRTCHandlers() {
    webrtc.setStateChangeHandler((state) => {
      if (!callStateMachine) return;
      
      console.log('📱 WebRTC state change:', state);
      
      if (state.status === 'connected') {
        connectionMonitor.recordConnectionSuccess();
        callStateMachine.transition('WEBRTC_CONNECTED');
        connectionStatus = '';
      } else if (state.status === 'failed') {
        connectionMonitor.recordConnectionFailure(state.error || 'Unknown error');
        errorMessage = state.error || 'Call failed';
        callStateMachine.transition('WEBRTC_FAILED');
      } else if (state.status === 'connecting') {
        console.log('🔄 WebRTC connecting...');
      }
    });

    webrtc.setRemoteStreamHandler((stream) => {
      if (remoteAudio) {
        remoteAudio.srcObject = stream;
      }
    });

    webrtc.setIceCandidateHandler((candidate) => {
      if (callStateMachine) {
        const state = callStateMachine.getCurrentState();
        socket.emit('webrtc.ice_candidate', {
          callId: state.identifier.callId,
          candidate: candidate,
          handle: handle,
          sourceId: sourceId
        });
      }
    });

    webrtc.setWebRTCStateChangeHandler((state, reason) => {
      console.log('📡 WebRTC state change:', state, 'reason:', reason);
      
      if (!callStateMachine) return;
      const callState = callStateMachine.getCurrentState();
      
      switch (state) {
        case 'webrtc_connected':
          if (connectionRetryCount > 0) {
            console.log('🎉 WebRTC recovery successful after', connectionRetryCount, 'retries');
            connectionRetryCount = 0;
          }
          callStateMachine.updateWebRTCQuality('good');
          socket.emit('webrtc.connected', { callId: callState.identifier.callId, handle, sourceId });
          break;
          
        case 'webrtc_failed':
          console.log('🔄 WebRTC failed, retry count:', connectionRetryCount);
          
          if (connectionRetryCount < MAX_RETRY_ATTEMPTS) {
            connectionRetryCount++;
            connectionStatus = `Connection failed, retrying... (${connectionRetryCount}/${MAX_RETRY_ATTEMPTS})`;
            callStateMachine.updateWebRTCQuality('unstable');
            
            setTimeout(() => {
              if (CallStateMachineHelper.isCallActive(callStateMachine)) {
                console.log('🔄 Retrying WebRTC connection...');
              }
            }, 3000);
          } else {
            connectionStatus = 'Connection struggling, please wait...';
            callStateMachine.updateWebRTCQuality('failed');
            
            setTimeout(() => {
              if (CallStateMachineHelper.isCallActive(callStateMachine)) {
                socket.emit('webrtc.failed', { callId: callState.identifier.callId, handle, sourceId, reason });
              }
            }, WEBRTC_FAILURE_DELAY);
          }
          break;
          
        case 'webrtc_disconnected':
          callStateMachine.updateWebRTCQuality('poor');
          socket.emit('webrtc.disconnected', { callId: callState.identifier.callId, handle, sourceId, reason });
          break;
      }
    });
  }

  // =============================================================================
  // RATIONALIZED SOCKET EVENT HANDLERS
  // =============================================================================

  function setupRationalizedSocketHandlers() {
    console.log('=== SETTING UP RATIONALIZED SOCKET HANDLERS (Customer) ===');
    console.log('Handle:', handle, 'SourceId:', sourceId);
    
    // Primary call state handler
    socket.on('call.state_changed', handleCallStateChanged);
    socket.on('call.terminated', handleCallTerminated);
    socket.on('call.error', handleCallError);
    
    // WebRTC events
    socket.on('webrtc.state_changed', handleWebRTCStateChanged);
    
    // UI control events
    socket.on('ui.control_changed', handleUIControlChanged);
    socket.on('ui.state_sync', handleUIStateSync);
    
    // Device events
    socket.on('device.call_accepted', handleDeviceCallAccepted);
    socket.on('device.call_ended', handleDeviceCallEnded);
    
    // Routing events
    socket.on('routing.call_routed', handleCallRouted);
    socket.on('routing.no_agents', handleNoAgents);
    socket.on('routing.handle_busy', handleHandleBusy);

    // WebRTC signaling (rationalized events)
    socket.on('webrtc.offer', async (data) => {
      console.log('📥 Received offer from agent:', data);
      // Legacy handler remains the same
    });

    socket.on('webrtc.answer', async (data) => {
      console.log('📥 Received answer from agent:', data);
      try {
        await webrtc.setRemoteAnswer(data.answer);
        console.log('✅ Remote answer set successfully');
      } catch (error) {
        console.error('❌ Failed to set remote answer:', error);
        errorMessage = 'Failed to connect to agent';
        if (callStateMachine) {
          callStateMachine.transition('WEBRTC_FAILED');
        }
      }
    });

    socket.on('webrtc.ice_candidate', async (data) => {
      console.log('🧊 Received ICE candidate:', data);
      try {
        await webrtc.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('❌ Failed to add ICE candidate:', error);
      }
    });
  }

  // =============================================================================
  // RATIONALIZED EVENT HANDLERS
  // =============================================================================

  function handleCallStateChanged(event: CallStateChangedEvent) {
    console.log('🎯 Call state changed:', event);
    
    if (event.changes.includes('phase')) {
      const phase = event.current.phase;
      
      switch (phase) {
        case 'routing':
          connectionStatus = 'Finding available agent...';
          break;
        case 'ringing':
          connectionStatus = 'Calling agent...';
          break;
        case 'connecting':
          connectionStatus = 'Call accepted, connecting...';
          // Start WebRTC offer process
          if (event.current.participants.agent.connected) {
            createWebRTCOffer(event.callId);
          }
          break;
        case 'active':
          connectionStatus = 'Connected to agent';
          connectionMonitor.recordConnectionSuccess();
          break;
      }
    }
    
    if (event.changes.includes('webrtc_quality')) {
      const quality = event.current.webrtcQuality;
      if (quality === 'poor' || quality === 'unstable') {
        connectionStatus = 'Connection quality poor, trying to improve...';
      }
    }
  }

  function handleCallTerminated(event: CallTerminatedEvent) {
    console.log('📞 Call terminated:', event);
    
    const reason = event.reason;
    if (reason.includes('timeout')) {
      errorMessage = 'Call timed out - no agent response';
    } else if (reason.includes('agent_disconnected')) {
      errorMessage = 'Agent disconnected from the call';
    } else if (reason.includes('agent_ended')) {
      connectionStatus = 'Call ended by agent';
    } else if (reason === 'cancelled') {
      connectionStatus = 'Call cancelled';
    } else {
      connectionStatus = 'Call ended';
    }
    
    isConnecting = false;
    
    if (webrtc) {
      webrtc.endCall();
    }
  }

  function handleCallError(event: CallErrorEvent) {
    console.error('📞 Call error:', event);
    
    switch (event.code) {
      case 'WEBRTC_FAILED':
        errorMessage = "We're having trouble with the connection. Please try again.";
        break;
      case 'NO_AGENTS':
        errorMessage = 'Sorry, all our representatives are currently busy. Please try again in a few minutes.';
        break;
      case 'CALL_TIMEOUT':
        errorMessage = 'No agent is available right now. Please try calling back later.';
        break;
      case 'HANDLE_BUSY':
        errorMessage = 'This business line is currently busy. Please try again later.';
        break;
      default:
        errorMessage = event.context?.message || 'An unexpected error occurred. Please try again.';
    }
    
    connectionStatus = 'Call failed';
    isConnecting = false;
    
    connectionMonitor.recordConnectionFailure(event.code);
    
    if (webrtc) {
      webrtc.endCall();
    }
  }

  function handleWebRTCStateChanged(event: WebRTCStateEvent) {
    console.log('🌐 WebRTC state changed:', event);
    
    if (callStateMachine) {
      callStateMachine.updateWebRTCQuality(event.current);
    }
  }

  function handleUIControlChanged(event: UIControlChangedEvent) {
    console.log('🎛️ UI control changed:', event);
    // Handle UI control changes from other devices if needed
  }

  function handleUIStateSync(event: any) {
    console.log('🔄 UI state sync:', event);
    // Sync UI state across devices
  }

  function handleDeviceCallAccepted(event: any) {
    console.log('📱 Device call accepted:', event);
    // Handle multi-device coordination
  }

  function handleDeviceCallEnded(event: any) {
    console.log('📱 Device call ended:', event);
    // Handle multi-device coordination
  }

  function handleCallRouted(event: any) {
    console.log('🚦 Call routed:', event);
    connectionStatus = 'Agent found, connecting...';
  }

  function handleNoAgents(event: any) {
    console.log('🚫 No agents available:', event);
    errorMessage = 'Sorry, all our representatives are currently busy. Please try again in a few minutes.';
    isConnecting = false;
    connectionStatus = 'Call failed - No agents available';
  }

  function handleHandleBusy(event: any) {
    console.log('📞 Handle busy:', event);
    errorMessage = 'This business line is currently busy. Please try again later.';
    isConnecting = false;
    connectionStatus = 'Business line busy';
  }

  // =============================================================================
  // CALL CONTROL METHODS (Using State Machine)
  // =============================================================================

  async function startCall() {
    console.log('=== START CALL (RATIONALIZED) ===');
    console.log('Handle:', handle, 'SourceId:', sourceId);
    
    if (isConnecting) {
      console.log('❌ Call already in progress');
      return;
    }
    
    if (!handle) {
      errorMessage = 'Invalid call link. Please check the URL and try again.';
      return;
    }
    
    try {
      // Generate unique identifiers
      const callAttemptId = generateUUID(); // Customer generates the real call ID
      const sessionId = generateUUID();
      
      // Create call identifier
      const identifier = createCallIdentifier(
        callAttemptId, // callAttemptId becomes the real call ID
        handle,
        sessionId,
        sourceId
      );
      
      // Create device context
      const deviceContext = createDeviceContext('web', 'browser', true);
      
      // Initialize call state machine
      callStateMachine = createCallStateMachine(identifier, deviceContext, true);
      
      // Set up state machine event handlers
      callStateMachine.on('call.state_changed', (event) => {
        console.log('🎯 State machine event:', event);
      });
      
      callStateMachine.on('call.terminated', (event) => {
        console.log('🔚 State machine terminated:', event);
      });
      
      console.log('🚀 Starting call process...');
      isConnecting = true;
      errorMessage = '';
      connectionStatus = 'Requesting microphone access...';
      connectionMonitor.startConnectionAttempt();

      // Request microphone permission
      await webrtc.initializeMedia({ audio: true, video: false });
      console.log('✅ Microphone access granted');
      
      // Connect to signaling server
      connectionStatus = 'Connecting to signaling server...';
      await socket.connect();
      console.log('✅ Connected to signaling server');
      
      // Transition to routing phase
      callStateMachine.transition('ROUTE_CALL');
      
      // Register as customer with handle (using rationalized event)
      connectionStatus = 'Looking for available agent...';
      socket.emit('call.initiate', { handle, sourceId, callAttemptId });
      console.log('✅ Customer call initiation sent');
      
    } catch (error) {
      console.error('❌ Failed to start call:', error);
      
      isConnecting = false;
      connectionMonitor.recordConnectionFailure(error instanceof Error ? error.message : 'Unknown error');
      
      if (webrtc) {
        webrtc.endCall();
      }
      
      if (socket) {
        socket.disconnect();
      }
      
      if (error instanceof Error && error.message.includes('microphone')) {
        errorMessage = 'Please allow microphone access to make a call. Click the microphone icon in your browser\'s address bar.';
      } else {
        errorMessage = 'Failed to start call. Please try again.';
      }
      
      connectionStatus = 'Connection failed';
      
      if (callStateMachine) {
        callStateMachine.forceTerminate('initialization_failed', 'customer');
      }
    }
  }

  async function createWebRTCOffer(callId: string) {
    if (!callStateMachine) return;
    
    try {
      console.log('📞 Creating WebRTC offer for call:', callId);
      const offer = await webrtc.createOffer(callId);
      console.log('📤 Sending offer to agent:', offer);
      socket.emit('webrtc.offer', { callId, offer, handle, sourceId });
    } catch (error) {
      console.error('❌ Failed to create offer:', error);
      errorMessage = 'Failed to create call offer';
      callStateMachine.transition('WEBRTC_FAILED');
      connectionMonitor.recordConnectionFailure(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  function endCall() {
    console.log('=== END CALL (RATIONALIZED) ===');
    
    if (!callStateMachine) {
      console.log('❌ No call state machine');
      return;
    }
    
    const state = callStateMachine.getCurrentState();
    console.log('Current call state:', state);
    
    if (socket) {
      if (!state.identifier.callId || state.identifier.callId.startsWith('temp_')) {
        // Call hasn't been assigned a server callId yet
        console.log('📞 Cancelling call request - no server callId assigned yet');
        socket.emit('call.cancel', { handle, sourceId, callAttemptId: state.identifier.sessionId });
      } else {
        // Call has server callId, send normal end call
        console.log('📞 Ending established call with callId:', state.identifier.callId);
        socket.emit('call.terminate', { 
          callId: state.identifier.callId, 
          handle: handle,
          sourceId: sourceId
        });
      }
    }
    
    if (webrtc) {
      webrtc.endCall();
    }
    
    // Transition state machine to terminated
    callStateMachine.forceTerminate('user_hangup', 'customer');
    
    isConnecting = false;
    connectionStatus = 'Call ended';
    console.log('✅ Customer call cleanup completed');
  }

  function toggleMute() {
    if (!CallStateMachineHelper.canMute(callStateMachine)) {
      console.log('❌ Mute not available in current state');
      return;
    }
    
    if (webrtc) {
      const isMuted = webrtc.toggleMute();
      
      // Update state machine
      callStateMachine.updateUIControl('mute', isMuted);
      
      // Emit UI control change (rationalized)
      const state = callStateMachine.getCurrentState();
      socket.emit('ui.control_change', {
        callId: state.identifier.callId,
        handle: handle,
        control: 'mute',
        value: isMuted,
        sourceId: state.identifier.sourceId
      });
      
      console.log('🔇 Mute state updated:', isMuted ? 'muted' : 'unmuted');
    }
  }

  function retryCall() {
    errorMessage = '';
    isConnecting = false;
    connectionStatus = 'Disconnected';
    connectionRetryCount = 0;
    
    if (callStateMachine) {
      callStateMachine.forceTerminate('retry_requested', 'customer');
      callStateMachine = null;
    }
  }

  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================

  function getConnectionStatusMessage(phase: CallPhase): string {
    switch (phase) {
      case 'initializing': return 'Starting call...';
      case 'routing': return 'Finding agent...';
      case 'ringing': return 'Calling agent...';
      case 'connecting': return 'Connecting...';
      case 'active': return 'Connected to Agent';
      case 'terminated': return 'Call ended';
      default: return 'Disconnected';
    }
  }

  function getStatusColor(phase: CallPhase): string {
    switch (phase) {
      case 'active': return 'text-green-600';
      case 'connecting': 
      case 'routing':
      case 'ringing': return 'text-yellow-600';
      case 'terminated': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  }

  function getCurrentPhase(): CallPhase {
    return callStateMachine?.getPhase() || 'terminated';
  }

  function getUIControls() {
    return callStateMachine?.getUIControls() || { 
      muteAvailable: false, 
      endCallAvailable: false, 
      muteState: false 
    };
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
        <div class="w-4 h-4 rounded-full mr-2 {getCurrentPhase() === 'active' ? 'bg-green-500' : 
                                               ['connecting', 'routing', 'ringing'].includes(getCurrentPhase()) ? 'bg-yellow-500 animate-pulse' : 
                                               getCurrentPhase() === 'terminated' && errorMessage ? 'bg-red-500' : 
                                               'bg-gray-400'}"></div>
        <span class="text-sm font-medium {getStatusColor(getCurrentPhase())}">
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
      {#if getCurrentPhase() === 'terminated' || getCurrentPhase() === 'initializing'}
        <button
          on:click={startCall}
          disabled={isConnecting || !handle}
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
      {:else if ['routing', 'ringing', 'connecting'].includes(getCurrentPhase())}
        <div class="text-center py-4">
          <div class="animate-pulse">
            <div class="w-16 h-16 bg-yellow-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-gray-600 mb-4">{getConnectionStatusMessage(getCurrentPhase())}</p>
          </div>
        </div>

        <!-- Call Controls during connecting -->
        <div class="flex space-x-4">
          <button
            on:click={toggleMute}
            disabled={!getUIControls().muteAvailable}
            class="flex-1 {getUIControls().muteState ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            {#if getUIControls().muteState}
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
            disabled={!getUIControls().endCallAvailable}
            class="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18"/>
            </svg>
            End Call
          </button>
        </div>
      {:else if getCurrentPhase() === 'active'}
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
            class="flex-1 {getUIControls().muteState ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            {#if getUIControls().muteState}
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
      {/if}
    </div>

    <!-- Debug Information (Development Only) -->
    {#if import.meta.env.DEV && callStateMachine}
      <div class="mt-8 p-4 bg-gray-100 rounded-lg text-xs">
        <p><strong>Debug:</strong></p>
        <p>Phase: {getCurrentPhase()}</p>
        <p>UI Controls: {JSON.stringify(getUIControls())}</p>
        <p>WebRTC Quality: {callStateMachine.getCurrentState().webrtcQuality}</p>
      </div>
    {/if}

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