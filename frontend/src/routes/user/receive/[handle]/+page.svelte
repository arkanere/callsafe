<script lang="ts">
  // Rationalized Agent Portal Component for CallSafe
  // Uses unified call state machine and rationalized events
  
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { WebRTCManager } from '$lib/webrtc.js';
  import { SocketManager } from '$lib/socket.js';
  import { connectionMonitor } from '$lib/monitoring.js';
  
  // Import rationalized event system
  import { 
    CallStateMachine, 
    createCallStateMachine,
    CallStateMachineHelper 
  } from '$lib/call-state-machine.js';
  import type { 
    CallPhase,
    CallQuality,
    CallStateChangedEvent,
    CallTerminatedEvent,
    CallErrorEvent,
    UIControlChangedEvent,
    WebRTCStateEvent,
    DeviceCallEvent,
    DeviceStatusEvent,
    CallIdentifier
  } from '$lib/types/rationalized-events.js';
  import { createCallIdentifier, createDeviceContext } from '$lib/types/rationalized-events.js';
  import { 
    setCurrentHandle, 
    clearCurrentHandle, 
    currentHandleState, 
    currentDevices, 
    currentCallState, 
    isCurrentHandleBusy, 
    availableDevices,
    multiDeviceCoordinator 
  } from '$lib/stores/multi-device.js';

  // Component state
  let webrtc: WebRTCManager;
  let socket: SocketManager;
  let callStateMachine: CallStateMachine | null = null;
  
  // Agent state
  let isOnline = false;
  let errorMessage = '';
  let connectionStatus = 'Disconnected';
  let socketConnected = false;
  let handle = '';
  let sourceId = '';
  
  // Call management
  let incomingCalls: Array<{ 
    callId: string; 
    timestamp: number; 
    sourceId?: string;
    handle: string;
  }> = [];
  let callHistory: Array<{
    callId: string;
    timestamp: string;
    duration: number;
    status: string;
    sourceId: string;
    reason: string;
  }> = [];
  
  // UI elements
  let remoteAudio: HTMLAudioElement;
  let ringtoneAudio: HTMLAudioElement;
  let currentCallStartTime: number | null = null;
  let callDuration = 0;
  let durationInterval: number;

  // Extract parameters
  $: handle = $page.params.handle || '';
  $: sourceId = $page.url.searchParams.get('sourceId') || '';

  // Multi-device reactive states
  $: handleState = $currentHandleState;
  $: devices = $currentDevices;
  $: handleCallState = $currentCallState;
  $: handleBusy = $isCurrentHandleBusy;
  $: deviceList = $availableDevices;

  // Reactive state variables that will trigger UI updates
  let currentPhase: CallPhase = 'terminated';
  let uiControls = { muteAvailable: false, endCallAvailable: false, muteState: false };
  let webrtcQuality: CallQuality = 'good';
  let stateUpdateCounter = 0; // This will trigger reactivity when incremented

  // Reactive state derived from call state machine
  $: if (callStateMachine && stateUpdateCounter >= 0) {
    const state = callStateMachine.getCurrentState();
    currentPhase = state.phase;
    uiControls = state.uiControls;
    webrtcQuality = state.webrtcQuality;
    callDuration = CallStateMachineHelper.getCallDuration(callStateMachine);
    
    // Update connection status based on phase
    if (currentPhase === 'connecting') {
      connectionStatus = 'Connecting to customer...';
    } else if (currentPhase === 'active') {
      connectionStatus = 'Call in progress';
    }
  }
  
  // Function to trigger UI updates when state machine changes
  function updateUI() {
    stateUpdateCounter++;
  }
  
  function getAgentCallPhase(): CallPhase {
    return currentPhase;
  }

  function getAgentUIControls() {
    return uiControls;
  }

  onMount(() => {
    webrtc = new WebRTCManager(false);
    socket = new SocketManager();
    
    setupWebRTCHandlers();
    setupRationalizedSocketHandlers();
    connectToServer();
  });

  onDestroy(() => {
    if (callStateMachine) {
      callStateMachine.forceTerminate('component_destroyed', 'agent');
    }
    if (webrtc) {
      webrtc.endCall();
    }
    if (socket) {
      socket.emit('device.unregister', { handle, deviceType: 'web' });
      socket.emit('device.offline', { handle });
      socket.disconnect();
    }
    if (durationInterval) {
      clearInterval(durationInterval);
    }
    stopRingtone();
    clearCurrentHandle();
  });

  // =============================================================================
  // CONNECTION AND INITIALIZATION
  // =============================================================================

  async function connectToServer() {
    try {
      connectionStatus = 'Connecting to server...';
      await socket.connect();
      connectionStatus = 'Connected';
      socketConnected = socket.getConnectionStatus();
      
      // Initialize media for agent
      await webrtc.initializeMedia({ audio: true, video: false });
      
      // Set current handle in multi-device store
      if (handle) {
        setCurrentHandle(handle);
        loadCallHistory();
        
        // Automatically go online and register web device
        console.log('👤 Agent automatically going online with handle:', handle);
        socket.emit('device.register', { handle, sourceId, deviceType: 'web' });
        socket.emit('device.sync_request', { handle });
        isOnline = true;
        connectionStatus = 'Online - Waiting for calls';
        errorMessage = '';
      }
      
    } catch (error) {
      connectionStatus = 'Connection failed';
      errorMessage = 'Failed to connect to server. Please refresh and try again.';
      console.error('Failed to connect:', error);
    }
  }

  // =============================================================================
  // WEBRTC SETUP (Enhanced with State Machine Integration)
  // =============================================================================

  function setupWebRTCHandlers() {
    webrtc.setStateChangeHandler((state) => {
      if (!callStateMachine) return;
      
      const previousPhase = callStateMachine.getPhase();
      
      if (state.status === 'connected') {
        connectionMonitor.recordConnectionSuccess();
        callStateMachine.transition('WEBRTC_CONNECTED');
        updateUI(); // Trigger UI reactivity
        if (previousPhase !== 'active') {
          startCallTimer();
        }
      } else if (state.status === 'failed') {
        connectionMonitor.recordConnectionFailure(state.error || 'Unknown error');
        errorMessage = state.error || 'Call failed';
        callStateMachine.transition('WEBRTC_FAILED');
        updateUI(); // Trigger UI reactivity
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
      if (callStateMachine) {
        const state = callStateMachine.getCurrentState();
        socket.emit('webrtc.ice_candidate', {
          callId: state.identifier.callId,
          candidate: candidate,
          handle: handle,
          sourceId: state.identifier.sourceId
        });
      }
    });
  }

  // =============================================================================
  // RATIONALIZED SOCKET EVENT HANDLERS
  // =============================================================================

  function setupRationalizedSocketHandlers() {
    console.log('=== SETTING UP RATIONALIZED SOCKET HANDLERS (Agent) ===');
    console.log('Handle:', handle);
    
    // Primary call state handler
    socket.on('call.state_changed', handleCallStateChanged);
    socket.on('call.terminated', handleCallTerminated);
    socket.on('call.error', handleCallError);
    
    // WebRTC events
    socket.on('webrtc.state_changed', handleWebRTCStateChanged);
    
    // UI control events
    socket.on('ui.control_changed', handleUIControlChanged);
    socket.on('ui.state_sync', handleUIStateSync);
    
    // Device coordination events
    socket.on('device.call_accepted', handleDeviceCallAccepted);
    socket.on('device.call_ended', handleDeviceCallEnded);
    socket.on('device.status_changed', handleDeviceStatusChanged);
    socket.on('device.sync_required', handleDeviceSyncRequired);
    
    // Routing events for new incoming calls
    socket.on('routing.call_routed', handleIncomingCall);
    
    // Device events
    socket.on('device.registered', (data) => {
      console.log('✅ Device successfully registered:', data);
      connectionStatus = 'Registered - Ready to receive calls';
      isOnline = true;
    });

    // WebRTC signaling (rationalized events)
    socket.on('webrtc.offer', async (data) => {
      console.log('📥 Received offer from customer:', data);
      if (callStateMachine) {
        const state = callStateMachine.getCurrentState();
        if (state.identifier.callId === data.callId) {
          try {
            // Ensure WebRTC is ready to process the offer
            await webrtc.initializeMedia({ audio: true, video: false });
            const answer = await webrtc.createAnswer(data.callId, data.offer);
            socket.emit('webrtc.answer', { callId: data.callId, answer, handle, sourceId: data.sourceId });
            console.log('📤 Sent answer to customer');
          } catch (error) {
            console.error('❌ Failed to create answer:', error);
            errorMessage = 'Failed to answer call';
            callStateMachine.transition('WEBRTC_FAILED');
          }
        } else {
          console.log('❌ Call ID mismatch - ignoring offer');
        }
      } else {
        console.log('❌ No active call state machine - ignoring offer');
      }
    });

    socket.on('webrtc.ice_candidate', async (data) => {
      console.log('🧊 Received ICE candidate (agent):', data);
      try {
        await webrtc.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('❌ Failed to add ICE candidate (agent):', error);
      }
    });
  }

  // =============================================================================
  // RATIONALIZED EVENT HANDLERS
  // =============================================================================

  function handleCallStateChanged(event: CallStateChangedEvent) {
    console.log('🎯 Call state changed (agent):', event);
    
    if (event.changes.includes('phase')) {
      const phase = event.current.phase;
      
      switch (phase) {
        case 'connecting':
          connectionStatus = 'Connecting to customer...';
          break;
        case 'active':
          connectionStatus = 'Call in progress';
          break;
      }
    }
  }

  function handleCallTerminated(event: CallTerminatedEvent) {
    console.log('📞 Call terminated (agent):', event);
    
    // Check if this was an incoming call we never accepted
    const incomingCall = incomingCalls.find(call => call.callId === event.callId);
    if (incomingCall) {
      addToCallHistory({
        callId: event.callId,
        duration: 0,
        status: 'missed',
        sourceId: incomingCall.sourceId,
        reason: event.reason
      });
      removeIncomingCall(event.callId);
    } else if (callStateMachine && callStateMachine.getCurrentState().identifier.callId === event.callId) {
      // This was our active call
      endCall({ callId: event.callId, reason: event.reason });
    }
  }

  function handleCallError(event: CallErrorEvent) {
    console.error('📞 Call error (agent):', event);
    
    switch (event.code) {
      case 'WEBRTC_FAILED':
        errorMessage = "Connection failed with customer. Please try accepting another call.";
        break;
      case 'CUSTOMER_DISCONNECTED':
        errorMessage = 'Customer disconnected during call.';
        break;
      default:
        errorMessage = event.context?.message || 'An unexpected error occurred.';
    }
    
    if (callStateMachine && callStateMachine.getCurrentState().identifier.callId === event.callId) {
      callStateMachine.transition('FORCE_END');
    }
  }

  function handleWebRTCStateChanged(event: WebRTCStateEvent) {
    console.log('🌐 WebRTC state changed (agent):', event);
    
    if (callStateMachine) {
      callStateMachine.updateWebRTCQuality(event.current);
    }
  }

  function handleUIControlChanged(event: UIControlChangedEvent) {
    console.log('🎛️ UI control changed (agent):', event);
    // Sync UI control changes from other devices
    if (callStateMachine && event.controlType === 'mute') {
      callStateMachine.updateUIControl('mute', event.newState as boolean);
    }
  }

  function handleUIStateSync(event: any) {
    console.log('🔄 UI state sync (agent):', event);
    // Sync UI state across devices
  }

  function handleDeviceCallAccepted(event: DeviceCallEvent) {
    console.log('📱 Device call accepted:', event);
    
    if (event.handle === handle && !event.deviceContext.isLocalDevice) {
      // Call was accepted on another device
      removeIncomingCall(event.callId);
      connectionStatus = `Call answered on ${event.deviceContext.deviceType} device`;
      
      addToCallHistory({
        callId: event.callId,
        duration: 0,
        status: 'completed',
        sourceId: event.callState.identifier.sourceId || '',
        reason: `answered_on_${event.deviceContext.deviceType}`
      });
    }
  }

  function handleDeviceCallEnded(event: DeviceCallEvent) {
    console.log('📱 Device call ended:', event);
    
    if (event.handle === handle) {
      connectionStatus = `Call ended on ${event.deviceContext.deviceType} device`;
    }
  }

  function handleDeviceStatusChanged(event: DeviceStatusEvent) {
    console.log('📱 Device status changed:', event);
    
    if (event.handle === handle) {
      if (event.deviceType === 'android') {
        connectionStatus = `Android app ${event.status === 'online' ? 'connected' : 'disconnected'}`;
      }
    }
  }

  function handleDeviceSyncRequired(event: any) {
    console.log('🔄 Device sync required:', event);
    // Handle device synchronization
  }

  function handleIncomingCall(event: any) {
    console.log('📞 Incoming call routed:', event);
    
    const call = {
      callId: event.callId,
      timestamp: Date.now(),
      sourceId: event.sourceId || '',
      handle: handle
    };
    
    incomingCalls = [...incomingCalls, call];
    playRingtone();
    
    // Auto-remove call after 30 seconds if not answered
    setTimeout(() => {
      removeIncomingCall(call.callId);
    }, 30000);
  }

  // =============================================================================
  // CALL CONTROL METHODS (Using State Machine)
  // =============================================================================

  async function acceptCall(callId: string) {
    console.log('=== ACCEPT CALL (RATIONALIZED) ===');
    console.log('Call ID:', callId, 'Handle:', handle);
    
    if (!isOnline) {
      console.log('❌ Agent not online, cannot accept call');
      return;
    }
    
    try {
      // Re-initialize media for new call
      await webrtc.initializeMedia({ audio: true, video: false });
      
      // Find the incoming call details
      const incomingCall = incomingCalls.find(call => call.callId === callId);
      if (!incomingCall) {
        console.error('❌ Incoming call not found');
        return;
      }
      
      // Create call identifier
      const identifier = createCallIdentifier(
        callId,
        handle,
        undefined,
        incomingCall.sourceId
      );
      
      // Create device context
      const deviceContext = createDeviceContext('web', 'browser', true);
      
      // Initialize call state machine for agent (start in ringing state for incoming call)
      callStateMachine = createCallStateMachine(identifier, deviceContext, false);
      
      // Set up state machine event handlers
      callStateMachine.on('call.state_changed', (event) => {
        console.log('🎯 Agent state machine event:', event);
        updateUI(); // Trigger UI reactivity
      });
      
      callStateMachine.on('call.terminated', (event) => {
        console.log('🔚 Agent state machine terminated:', event);
        updateUI(); // Trigger UI reactivity
      });
      
      // Transition through proper states for agent accepting a call
      callStateMachine.transition('ROUTE_CALL'); // Move to routing
      callStateMachine.transition('AGENTS_FOUND'); // Move to ringing (agents found)
      callStateMachine.transition('AGENT_ACCEPTED'); // Accept the call
      
      // Send accept message to server
      socket.emit('call.accept', { callId, handle, sourceId: incomingCall.sourceId });
      console.log('📤 Accept call message sent to server');
      
      // Remove from incoming calls and stop ringtone
      removeIncomingCall(callId);
      stopRingtone();
      
      console.log('📞 Agent call state updated');
      
    } catch (error) {
      console.error('❌ Failed to accept call:', error);
      errorMessage = 'Failed to initialize microphone. Please refresh and try again.';
    }
  }

  function declineCall(callId: string) {
    console.log('=== DECLINE CALL ===');
    
    const incomingCall = incomingCalls.find(call => call.callId === callId);
    const sourceId = incomingCall?.sourceId;
    
    socket.emit('call.decline', { callId, handle, sourceId });
    console.log('📤 Decline call message sent to server');
    
    // Add declined call to history
    addToCallHistory({
      callId: callId,
      duration: 0,
      status: 'missed',
      sourceId: sourceId || '',
      reason: 'agent_declined'
    });
    
    removeIncomingCall(callId);
  }

  function endCall(options: { callId?: string; reason?: string } = {}) {
    console.log('🔚 Ending call (rationalized):', options);
    
    if (!callStateMachine) {
      console.log('❌ No active call to end');
      return;
    }
    
    const state = callStateMachine.getCurrentState();
    const callId = options.callId || state.identifier.callId;
    const reason = options.reason || 'manual';
    
    try {
      // Determine call status for history
      let status = 'completed';
      let duration = CallStateMachineHelper.getCallDuration(callStateMachine);
      
      if (reason.includes('timeout')) {
        status = 'timeout';
      } else if (reason.includes('failed')) {
        status = 'failed';
      } else if (state.phase === 'connecting') {
        status = 'missed';
      }
      
      // Add to call history before cleanup
      addToCallHistory({
        callId: callId,
        duration: duration,
        status: status,
        sourceId: state.identifier.sourceId || '',
        reason: reason
      });
      
      // Send end call to server
      if (callId && !callId.startsWith('temp_')) {
        socket.emit('call.terminate', { 
          callId: callId, 
          handle: handle, 
          sourceId: state.identifier.sourceId,
          reason 
        });
      }
      
      // WebRTC cleanup
      if (webrtc) {
        webrtc.endCall();
      }
      
      // Stop call timer
      stopCallTimer();
      
      // Force terminate state machine
      callStateMachine.forceTerminate(reason, 'agent');
      callStateMachine = null;
      
      console.log('✅ Agent call cleanup completed');
      
    } catch (error) {
      console.error('❌ Error during call cleanup:', error);
    }
  }

  function toggleMute() {
    if (!callStateMachine || !CallStateMachineHelper.canMute(callStateMachine)) {
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
    }
  }

  function toggleOnlineStatus() {
    if (!socket.getConnectionStatus()) {
      errorMessage = 'Not connected to server';
      return;
    }

    if (!handle) {
      errorMessage = 'No handle specified for this agent portal';
      return;
    }

    if (isOnline) {
      socket.emit('device.offline', { handle });
      socket.emit('device.unregister', { handle, deviceType: 'web' });
      isOnline = false;
      connectionStatus = 'Offline';
      stopRingtone();
    } else {
      socket.emit('device.register', { handle, sourceId, deviceType: 'web' });
      socket.emit('device.sync_request', { handle });
      isOnline = true;
      connectionStatus = 'Online - Waiting for calls';
      errorMessage = '';
    }
  }

  // =============================================================================
  // UTILITY FUNCTIONS
  // =============================================================================

  function removeIncomingCall(callId: string) {
    incomingCalls = incomingCalls.filter(call => call.callId !== callId);
    if (incomingCalls.length === 0) {
      stopRingtone();
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

  function loadCallHistory() {
    if (!handle) return;
    
    try {
      const key = `call_history_${handle}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        callHistory = JSON.parse(stored);
      } else {
        callHistory = [];
      }
    } catch (error) {
      console.error('Failed to load call history:', error);
      callHistory = [];
    }
  }

  function addToCallHistory(callData: any) {
    if (!handle) return;
    
    const entry = {
      callId: callData.callId || 'unknown',
      timestamp: new Date().toISOString(),
      duration: callData.duration || 0,
      status: callData.status || 'unknown',
      sourceId: callData.sourceId || '',
      reason: callData.reason || ''
    };
    
    callHistory = [entry, ...callHistory];
    
    if (callHistory.length > 10) {
      callHistory = callHistory.slice(0, 10);
    }
    
    try {
      const key = `call_history_${handle}`;
      localStorage.setItem(key, JSON.stringify(callHistory));
    } catch (error) {
      console.error('Failed to save call history:', error);
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'failed': return 'text-red-600';
      case 'ended': return 'text-gray-600';
      case 'missed': return 'text-orange-600';
      case 'completed': return 'text-green-600';
      case 'timeout': return 'text-yellow-600';
      case 'cancelled': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  }

  function backToDashboard() {
    goto('/user');
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
          Agent Portal (Rationalized)
          {#if handle}
            <span class="text-gray-500 font-normal">({handle})</span>
          {/if}
        </li>
      </ol>
    </nav>

    <!-- Header -->
    <div class="bg-white rounded-2xl shadow-xl p-6 mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-800">Agent Dashboard</h1>
          <p class="text-gray-600">CallSafe Business Portal (Rationalized Events)</p>
          {#if handle}
            <p class="text-sm text-gray-500 mt-1">Handle: <code class="bg-gray-100 px-2 py-1 rounded">{handle}</code></p>
          {/if}
          {#if sourceId}
            <p class="text-sm text-gray-500 mt-1">Source: <code class="bg-blue-100 px-2 py-1 rounded">{sourceId}</code></p>
          {/if}
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
            disabled={!socketConnected || !handle}
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

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Device Status Panel -->
      <div class="bg-white rounded-2xl shadow-xl p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Device Status</h2>
        
        <div class="space-y-4">
          <!-- Web Device (Current) -->
          <div class="flex items-center justify-between p-3 rounded-lg bg-blue-50">
            <div class="flex items-center">
              <div class="w-3 h-3 rounded-full bg-green-500 mr-3"></div>
              <div>
                <div class="font-semibold text-gray-800">💻 Web Dashboard</div>
                <div class="text-sm text-blue-600">You (Online - Rationalized)</div>
              </div>
            </div>
          </div>
          
          <!-- Android Device -->
          {#if devices.android}
            <div class="flex items-center justify-between p-3 rounded-lg {devices.android.online ? 'bg-green-50' : 'bg-gray-50'}">
              <div class="flex items-center">
                <div class="w-3 h-3 rounded-full {devices.android.online ? 'bg-green-500' : 'bg-gray-400'} mr-3"></div>
                <div>
                  <div class="font-semibold text-gray-800">📱 Android App</div>
                  <div class="text-sm {devices.android.online ? 'text-green-600' : 'text-gray-500'}">
                    {devices.android.online ? 'Online' : 'Offline'}
                    {#if devices.android.online && devices.android.socketConnected}
                      (Connected)
                    {:else if devices.android.online}
                      (FCM Only)
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {:else}
            <div class="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div class="flex items-center">
                <div class="w-3 h-3 rounded-full bg-gray-400 mr-3"></div>
                <div>
                  <div class="font-semibold text-gray-800">📱 Android App</div>
                  <div class="text-sm text-gray-500">Not registered</div>
                </div>
              </div>
            </div>
          {/if}
          
          <!-- Handle Status -->
          <div class="mt-4 pt-4 border-t border-gray-200">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-600">Handle Status:</span>
              <span class="text-sm font-semibold {handleBusy ? 'text-red-600' : 'text-green-600'}">
                {handleBusy ? 'Busy' : 'Available'}
              </span>
            </div>
            {#if handleCallState?.acceptedBy && handleCallState.acceptedBy !== 'web'}
              <div class="text-xs text-gray-500 mt-1">
                Call in progress on {handleCallState.acceptedBy} device
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Current Call Panel -->
      <div class="bg-white rounded-2xl shadow-xl p-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Current Call</h2>
        
        {#if !callStateMachine || getCurrentPhase() === 'terminated'}
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
        {:else if getCurrentPhase() === 'connecting'}
          <div class="text-center py-8">
            <div class="animate-pulse">
              <div class="w-16 h-16 bg-yellow-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              </div>
              <p class="text-gray-600">Connecting to customer...</p>
              <p class="text-sm text-gray-500 mt-2">Call ID: {callStateMachine.getCurrentState().identifier.callId}</p>
            </div>
          </div>
        {:else if getCurrentPhase() === 'active'}
          <div class="text-center py-2 sm:py-4">
            <div class="w-12 h-12 sm:w-16 sm:h-16 bg-green-200 rounded-full mx-auto mb-2 sm:mb-4 flex items-center justify-center">
              <svg class="w-6 h-6 sm:w-8 sm:h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-green-600 font-semibold mb-2">Connected to Customer</p>
            <p class="text-xl sm:text-2xl font-mono text-green-700 font-bold mb-2 sm:mb-4 border border-green-200 bg-green-50 px-2 py-1 rounded">{formatDuration(callDuration)}</p>
            <p class="text-sm text-gray-500 mb-4 sm:mb-6">Call ID: {callStateMachine.getCurrentState().identifier.callId}</p>

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
                on:click={() => endCall()}
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
                      disabled={!!callStateMachine && getCurrentPhase() !== 'terminated'}
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
                    <div class="w-3 h-3 rounded-full {call.status === 'completed' ? 'bg-green-500' : 
                                                     call.status === 'timeout' ? 'bg-yellow-500' : 
                                                     call.status === 'cancelled' ? 'bg-gray-500' : 
                                                     call.status === 'missed' ? 'bg-orange-500' : 'bg-red-500'}"></div>
                    <span class="font-medium text-sm capitalize">
                      {call.status === 'completed' ? 'Completed' : 
                       call.status === 'timeout' ? 'Timeout' : 
                       call.status === 'cancelled' ? 'Cancelled' : 
                       call.status === 'missed' ? 'Missed Call' : 'Failed'}
                    </span>
                    {#if call.reason}
                      <span class="text-xs text-gray-500">({call.reason})</span>
                    {/if}
                  </div>
                  <div class="text-xs text-gray-600 mb-1">
                    {new Date(call.timestamp).toLocaleString()}
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
                    #{call.callId.slice(-6)}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Debug Information (Development Only) -->
    {#if import.meta.env.DEV}
      <div class="bg-white rounded-2xl shadow-xl p-6 mt-6">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Debug Information</h2>
        <div class="space-y-2 text-sm font-mono">
          <p><strong>Call State Machine:</strong> {callStateMachine ? 'Active' : 'None'}</p>
          {#if callStateMachine}
            <p><strong>Phase:</strong> {getCurrentPhase()}</p>
            <p><strong>UI Controls:</strong> {JSON.stringify(getUIControls())}</p>
            <p><strong>WebRTC Quality:</strong> {callStateMachine.getCurrentState().webrtcQuality}</p>
            <p><strong>Call ID:</strong> {callStateMachine.getCurrentState().identifier.callId}</p>
          {/if}
          <p><strong>Incoming Calls:</strong> {incomingCalls.length}</p>
          <p><strong>Socket Connected:</strong> {socketConnected}</p>
          <p><strong>Agent Online:</strong> {isOnline}</p>
        </div>
      </div>
    {/if}

    <!-- Hidden audio elements -->
    <audio 
      bind:this={remoteAudio} 
      autoplay 
      hidden 
      playsinline
      muted={false}
    ></audio>
    
    <audio 
      bind:this={ringtoneAudio} 
      src="/ringtone.mp3"
      preload="auto"
      hidden
    ></audio>
  </div>
</div>