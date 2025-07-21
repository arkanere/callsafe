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
  let incomingCalls: Array<{ callId: string; timestamp: number; sourceId?: string }> = [];
  let errorMessage = '';
  let connectionStatus = 'Disconnected';
  let remoteAudio: HTMLAudioElement;
  let ringtoneAudio: HTMLAudioElement;
  let currentCallStartTime: number | null = null;
  let callDuration = 0;
  let durationInterval: number;
  let socketConnected = false;
  let handle = '';
  let sourceId = '';
  let callHistory = [];
  
  // Extract handle from URL parameters
  $: handle = $page.params.handle || '';
  // Extract sourceId from URL query parameters (optional for agents)
  $: sourceId = $page.url.searchParams.get('sourceId') || '';
  
  // Reactive statement to load call history when handle changes
  $: if (handle) {
    console.log('📝 Handle changed:', handle, 'loading call history...');
    loadCallHistory();
  }
  
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
      
      // Automatically go online if handle is available
      if (handle) {
        console.log('👤 Agent automatically going online with handle:', handle, 'sourceId:', sourceId);
        socket.goOnlineWithHandle(handle, sourceId);
        isOnline = true;
        connectionStatus = 'Online - Waiting for calls';
        errorMessage = '';
      }
      
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
      callState = { ...callState, ...state };
      
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
        socket.sendIceCandidate(callState.callId, candidate, handle, callState.sourceId);
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
        timestamp: Date.now(),
        sourceId: data.sourceId
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
          socket.sendAnswer(data.callId, answer, handle, data.sourceId);
        } else {
          console.log('❌ Call ID mismatch - expected:', callState.callId, 'received:', data.callId);
          // End the call due to callId mismatch
          errorMessage = 'Call session mismatch';
          endCall({ callId: data.callId, reason: 'call_id_mismatch' });
        }
      } catch (error) {
        console.error('❌ Failed to create answer:', error);
        errorMessage = 'Failed to answer call';
        callState = { ...callState, status: 'failed' };
        connectionMonitor.recordConnectionFailure(error instanceof Error ? error.message : 'Unknown error');
        
        // End the call on server side
        endCall({ callId: data.callId, reason: 'webrtc_answer_failed' });
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

    socket.on('call_ended', (data) => {
      console.log('📞 Call ended by customer:', data);
      
      // Check if this was an incoming call that we never accepted
      const incomingCall = incomingCalls.find(call => call.callId === data.callId);
      if (incomingCall) {
        // This was a missed call - customer ended it before we accepted
        addToCallHistory({
          callId: data.callId,
          duration: 0,
          status: 'missed',
          sourceId: incomingCall.sourceId,
          reason: data.reason || 'customer_ended'
        });
        
        // Remove from incoming calls
        incomingCalls = incomingCalls.filter(call => call.callId !== data.callId);
        
        // Stop ringtone if no more incoming calls
        if (incomingCalls.length === 0) {
          stopRingtone();
        }
      } else {
        // This was an active call that ended
        endCall({
          callId: data?.callId,
          reason: data?.reason || 'customer_ended'
        });
      }
    });

    socket.on('call_disconnected', (reason) => {
      errorMessage = `Call disconnected: ${reason}`;
      endCall({ reason: `disconnected_${reason}` });
    });

    socket.on('call_cancelled', (data) => {
      console.log('📞 Call cancelled by customer:', data);
      // Remove the cancelled call from incoming calls
      if (data.callId) {
        incomingCalls = incomingCalls.filter(call => call.callId !== data.callId);
        // Stop ringtone if no more incoming calls
        if (incomingCalls.length === 0) {
          stopRingtone();
        }
        // Add to call history
        addToCallHistory({
          callId: data.callId,
          duration: 0,
          status: 'cancelled',
          sourceId: data.sourceId,
          reason: 'customer_cancelled'
        });
      }
    });

    socket.on('call_request_cancelled', (data) => {
      console.log('📞 Call request cancelled:', data);
      
      // Find the call details before removing it
      const cancelledCall = incomingCalls.find(call => call.callId === data.callId);
      
      // Remove the cancelled call from incoming calls
      if (data.callId) {
        incomingCalls = incomingCalls.filter(call => call.callId !== data.callId);
        // Stop ringtone if no more incoming calls
        if (incomingCalls.length === 0) {
          stopRingtone();
        }
        
        // Log as missed call if customer cancelled during connecting
        if (cancelledCall) {
          addToCallHistory({
            callId: data.callId,
            duration: 0,
            status: 'missed',
            sourceId: cancelledCall.sourceId,
            reason: data.reason || 'customer_cancelled'
          });
        }
      }
    });

    socket.on('customer_disconnected', (data) => {
      console.log('📞 Customer disconnected:', data);
      // Remove calls from this customer
      if (data.callId) {
        incomingCalls = incomingCalls.filter(call => call.callId !== data.callId);
        // Stop ringtone if no more incoming calls
        if (incomingCalls.length === 0) {
          stopRingtone();
        }
      }
      
      // End active call if it's from this customer
      if (callState.callId === data.callId) {
        endCall({ callId: data.callId, reason: 'customer_disconnected' });
      }
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

    socket.on('call_no_longer_available', (data) => {
      console.log('📞 Call no longer available (accepted by another agent):', data);
      // Remove the call from incoming calls since it was accepted by another agent
      if (data.callId) {
        incomingCalls = incomingCalls.filter(call => call.callId !== data.callId);
        // Stop ringtone if no more incoming calls
        if (incomingCalls.length === 0) {
          stopRingtone();
        }
      }
    });

    socket.on('agent_registered', (data) => {
      console.log('✅ Agent successfully registered:', data);
      connectionStatus = 'Registered - Ready to receive calls';
      isOnline = true;
    });

    socket.on('missed_call', (data) => {
      console.log('📞 Missed call notification received:', data);
      // Add missed call to history
      addToCallHistory({
        callId: data.callId,
        duration: 0,
        status: 'missed',
        sourceId: data.sourceId,
        reason: data.reason || 'missed_call'
      });
    });
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
      socket.goOffline();
      isOnline = false;
      connectionStatus = 'Offline';
      // Stop ringtone when going offline
      stopRingtone();
    } else {
      console.log('👤 Agent going online with handle:', handle, 'sourceId:', sourceId);
      socket.goOnlineWithHandle(handle, sourceId);
      isOnline = true;
      connectionStatus = 'Online - Waiting for calls';
      errorMessage = '';
    }
  }

  async function acceptCall(callId: string) {
    console.log('=== ACCEPT CALL CLICKED ===');
    console.log('Call ID:', callId);
    console.log('Handle:', handle);
    console.log('Agent online status:', isOnline);
    
    if (!isOnline) {
      console.log('❌ Agent not online, cannot accept call');
      return;
    }
    
    try {
      console.log('🎤 Re-initializing media for new call...');
      await webrtc.initializeMedia({ audio: true, video: false });
      console.log('✅ Media re-initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize media:', error);
      errorMessage = 'Failed to initialize microphone. Please refresh and try again.';
      return;
    }
    
    console.log('✅ Accepting call...');
    
    // Find the sourceId from incoming calls
    const incomingCall = incomingCalls.find(call => call.callId === callId);
    const sourceId = incomingCall?.sourceId;
    
    socket.acceptCall(callId, handle, sourceId);
    console.log('📤 Accept call message sent to server with handle:', handle, 'sourceId:', sourceId);
    
    incomingCalls = incomingCalls.filter(call => call.callId !== callId);
    console.log('🗑️ Removed call from incoming calls list');
    
    // Stop ringtone when accepting call
    stopRingtone();
    
    callState = { ...callState, callId, status: 'connecting', sourceId };
    console.log('📞 Agent call state updated:', callState);
  }

  function declineCall(callId: string) {
    // Find the sourceId from incoming calls
    const incomingCall = incomingCalls.find(call => call.callId === callId);
    const sourceId = incomingCall?.sourceId;
    
    socket.declineCall(callId, handle, sourceId);
    console.log('📤 Decline call message sent to server with handle:', handle, 'sourceId:', sourceId);
    
    // Add declined call to history as missed call
    addToCallHistory({
      callId: callId,
      duration: 0,
      status: 'missed',
      sourceId: sourceId,
      reason: 'agent_declined'
    });
    
    incomingCalls = incomingCalls.filter(call => call.callId !== callId);
    
    // Stop ringtone when declining call or if no more incoming calls
    if (incomingCalls.length === 0) {
      stopRingtone();
    }
  }

  function endCall(options = {}) {
    const { callId = null, reason = 'manual', force = false } = options;
    
    console.log('🔚 Starting robust call cleanup:', { callId, reason, force, currentCallId: callState.callId });
    
    try {
      // 1. Determine which call(s) to end
      const targetCallId = callId || callState.callId;
      const shouldEndActiveCall = !callId || callId === callState.callId;
      
      // 1.5. Capture call data for history BEFORE resetting state
      let callHistoryData = null;
      if (shouldEndActiveCall && callState.callId) {
        // Determine status based on call state and reason
        let status = 'completed';
        if (reason.includes('timeout')) {
          status = 'timeout';
        } else if (reason.includes('failed')) {
          status = 'failed';
        } else if (callState.status === 'connecting' && reason === 'manual') {
          // Agent ended call while it was still incoming (not yet accepted)
          status = 'missed';
        } else if (callState.status === 'connected') {
          status = 'completed';
        } else {
          status = 'missed'; // Default for calls that were never connected
        }
        
        callHistoryData = {
          callId: callState.callId,
          duration: callDuration,
          status: status,
          sourceId: callState.sourceId,
          reason: reason
        };
        console.log('📝 Captured call data for history:', callHistoryData);
      }
      
      // 2. Socket notification (if we have an active call to end)
      if (shouldEndActiveCall && callState.callId) {
        try {
          console.log('📤 Notifying server of call end:', callState.callId);
          socket.endCall({ 
            callId: callState.callId, 
            handle: handle, 
            sourceId: callState.sourceId,
            reason 
          });
        } catch (error) {
          console.error('❌ Failed to notify server of call end:', error);
          // Continue cleanup even if server notification fails
        }
      }
      
      // 3. WebRTC cleanup (only for active call)
      if (shouldEndActiveCall && webrtc) {
        try {
          console.log('🌐 Cleaning up WebRTC connection');
          webrtc.endCall();
        } catch (error) {
          console.error('❌ Failed to cleanup WebRTC:', error);
          // Continue cleanup even if WebRTC cleanup fails
        }
      }
      
      // 4. Clean up incoming calls array (specific call or all if force)
      try {
        const originalLength = incomingCalls.length;
        if (targetCallId) {
          incomingCalls = incomingCalls.filter(call => call.callId !== targetCallId);
          console.log(`🗑️ Removed call ${targetCallId} from incoming calls`);
        } else if (force) {
          incomingCalls = [];
          console.log('🗑️ Force cleared all incoming calls');
        } else if (incomingCalls.length > 0) {
          // Fallback: remove the oldest call
          incomingCalls = incomingCalls.slice(1);
          console.log('🗑️ Removed oldest incoming call as fallback');
        }
        
        if (incomingCalls.length !== originalLength) {
          console.log(`📊 Incoming calls: ${originalLength} → ${incomingCalls.length}`);
        }
      } catch (error) {
        console.error('❌ Failed to cleanup incoming calls:', error);
      }
      
      // 5. Audio cleanup (conditional ringtone stopping)
      try {
        // Only stop ringtone if no more incoming calls
        if (incomingCalls.length === 0) {
          console.log('🔇 Stopping ringtone - no more incoming calls');
          stopRingtone();
        }
        
        // Clean up remote audio source
        const remoteAudio = document.querySelector('#remoteAudio');
        if (remoteAudio && remoteAudio.srcObject) {
          console.log('🎵 Cleaning up remote audio source');
          remoteAudio.srcObject = null;
        }
      } catch (error) {
        console.error('❌ Failed to cleanup audio:', error);
      }
      
      // 6. Call state cleanup (only for active call)
      if (shouldEndActiveCall) {
        try {
          console.log('📊 Resetting call state');
          callState = {
            status: 'idle',
            callId: undefined,
            sourceId: undefined,
            isMuted: false,
            duration: 0
          };
        } catch (error) {
          console.error('❌ Failed to reset call state:', error);
        }
      }
      
      // 7. Timer cleanup
      try {
        console.log('⏱️ Stopping call timer');
        stopCallTimer();
      } catch (error) {
        console.error('❌ Failed to stop call timer:', error);
      }

      // 8. Add to call history
      if (callHistoryData) {
        try {
          console.log('📝 Adding call to history:', callHistoryData);
          
          // Check if this call is already in history (prevent duplicates)
          const existingCall = callHistory.find(call => call.callId === callHistoryData.callId);
          if (existingCall) {
            console.log('📝 Call already in history, skipping:', callHistoryData.callId);
          } else {
            addToCallHistory(callHistoryData);
            console.log('📝 Call added to history, current history length:', callHistory.length);
          }
        } catch (error) {
          console.error('❌ Failed to add call to history:', error);
        }
      } else {
        console.log('📝 Not adding to history - no call data captured');
      }
      
      // 9. Final state validation
      const finalState = {
        activeCall: callState.callId,
        incomingCalls: incomingCalls.length,
        reason,
        success: true
      };
      
      console.log('✅ Call cleanup completed successfully:', finalState);
      
    } catch (error) {
      console.error('💥 Critical error during call cleanup:', error);
      
      // Emergency fallback cleanup
      if (force) {
        console.log('🚨 Performing emergency fallback cleanup');
        try {
          stopRingtone();
          incomingCalls = [];
          callState = { status: 'idle', callId: undefined, sourceId: undefined, isMuted: false, duration: 0 };
          stopCallTimer();
          console.log('🆘 Emergency cleanup completed');
        } catch (fallbackError) {
          console.error('💀 Even emergency cleanup failed:', fallbackError);
        }
      }
    }
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

  function loadCallHistory() {
    if (!handle) {
      console.log('📝 Not loading call history - no handle');
      return;
    }
    
    try {
      const key = `call_history_${handle}`;
      const stored = localStorage.getItem(key);
      console.log('📝 Loading call history for handle:', handle, 'key:', key, 'stored:', stored);
      
      if (stored) {
        callHistory = JSON.parse(stored);
        console.log('📝 Loaded call history:', callHistory.length, 'calls');
      } else {
        console.log('📝 No stored call history found');
        callHistory = [];
      }
    } catch (error) {
      console.error('Failed to load call history:', error);
      callHistory = [];
    }
  }

  function addToCallHistory(callData) {
    if (!handle) {
      console.log('📝 Not adding to call history - no handle');
      return;
    }
    
    const entry = {
      callId: callData.callId || 'unknown',
      timestamp: new Date().toISOString(),
      duration: callData.duration || 0,
      status: callData.status || 'unknown',
      sourceId: callData.sourceId || '',
      reason: callData.reason || ''
    };
    
    console.log('📝 Creating call history entry:', entry);
    
    // Add to beginning of array
    callHistory = [entry, ...callHistory];
    
    // Keep only last 10
    if (callHistory.length > 10) {
      callHistory = callHistory.slice(0, 10);
    }
    
    // Save to localStorage
    try {
      const key = `call_history_${handle}`;
      const data = JSON.stringify(callHistory);
      localStorage.setItem(key, data);
      console.log('📝 Saved call history to localStorage:', key, 'length:', callHistory.length);
      
      // Verify it was saved
      const verification = localStorage.getItem(key);
      console.log('📝 Verification - retrieved from localStorage:', verification ? JSON.parse(verification).length : 'null', 'calls');
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
            {#if sourceId}
              <p class="text-sm text-gray-500 mt-1">Source: <code class="bg-blue-100 px-2 py-1 rounded">{sourceId}</code></p>
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
          <div class="text-center py-2 sm:py-4">
            <div class="w-12 h-12 sm:w-16 sm:h-16 bg-green-200 rounded-full mx-auto mb-2 sm:mb-4 flex items-center justify-center">
              <svg class="w-6 h-6 sm:w-8 sm:h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-green-600 font-semibold mb-2">Connected to Customer</p>
            <p class="text-xl sm:text-2xl font-mono text-green-700 sm:text-gray-700 font-bold sm:font-normal mb-2 sm:mb-4 border border-green-200 sm:border-0 bg-green-50 sm:bg-transparent px-2 py-1 sm:px-0 sm:py-0 rounded">{formatDuration(callDuration)}</p>
            <p class="text-sm text-gray-500 mb-4 sm:mb-6">Call ID: {callState.callId}</p>

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