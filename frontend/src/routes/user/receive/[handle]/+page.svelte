<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  // Extract parameters
  let handle = $page.params.handle || '';
  let sourceId = $page.url.searchParams.get('sourceId') || '';

  // Component state (placeholder data for UI)
  let isOnline = false;
  let errorMessage = '';
  let connectionStatus = 'Disconnected';
  let socketConnected = false;
  
  // Call management (placeholder data)
  let incomingCalls = [];
  let callHistory = [];
  let callStateMachine = null;
  let currentCallStartTime = null;
  let callDuration = 0;
  let durationInterval;

  // Multi-device reactive states (placeholder data)
  let handleState = null;
  let devices = { android: null };
  let handleCallState = null;
  let handleBusy = false;
  let deviceList = [];

  // Reactive state variables for UI
  let currentPhase = 'terminated';
  let uiControls = { muteAvailable: false, endCallAvailable: false, muteState: false };
  let webrtcQuality = 'good';
  let stateUpdateCounter = 0;

  // Placeholder functions (to be implemented later)
  function toggleOnlineStatus() {
    if (!handle) {
      errorMessage = 'No handle specified for this agent portal';
      return;
    }

    if (isOnline) {
      isOnline = false;
      connectionStatus = 'Offline';
    } else {
      isOnline = true;
      connectionStatus = 'Online - Waiting for calls';
      errorMessage = '';
    }
  }

  function acceptCall(callId) {
    console.log('Accept call:', callId);
  }

  function declineCall(callId) {
    console.log('Decline call:', callId);
  }

  function endCall() {
    console.log('End call');
  }

  function toggleMute() {
    console.log('Toggle mute');
  }

  function clearError() {
    errorMessage = '';
  }

  function backToDashboard() {
    goto('/user');
  }

  function getCurrentPhase() {
    return currentPhase;
  }

  function getUIControls() {
    return uiControls;
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function getStatusColor(status) {
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
            class="px-6 py-2 rounded-lg font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed {isOnline ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}"
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
              <p class="text-sm text-gray-500 mt-2">Call ID: demo-call-id</p>
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
            <p class="text-sm text-gray-500 mb-4 sm:mb-6">Call ID: demo-call-id</p>

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
                    <div class="w-3 h-3 rounded-full {call.status === 'completed' ? 'bg-green-500' : call.status === 'timeout' ? 'bg-yellow-500' : call.status === 'cancelled' ? 'bg-gray-500' : call.status === 'missed' ? 'bg-orange-500' : 'bg-red-500'}"></div>
                    <span class="font-medium text-sm capitalize">
                      {call.status === 'completed' ? 'Completed' : call.status === 'timeout' ? 'Timeout' : call.status === 'cancelled' ? 'Cancelled' : call.status === 'missed' ? 'Missed Call' : 'Failed'}
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