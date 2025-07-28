<script>
  import { page } from '$app/stores';

  // Extract parameters
  let handle = $page.params.handle || '';
  let sourceId = $page.url.searchParams.get('sourceId') || '';

  // Component state (placeholder data for UI)
  let isConnecting = false;
  let errorMessage = '';
  let connectionStatus = 'Disconnected';
  let connectionRetryCount = 0;
  
  // Reactive state variables for UI
  let currentPhase = 'terminated';
  let uiControls = { muteAvailable: false, endCallAvailable: false, muteState: false };
  let webrtcQuality = 'good';
  let stateUpdateCounter = 0;

  // Placeholder functions (to be implemented later)
  async function startCall() {
    console.log('Start call:', handle, sourceId);
    isConnecting = true;
    connectionStatus = 'Connecting...';
    // Simulate different phases
    setTimeout(() => {
      if (isConnecting) {
        currentPhase = 'routing';
        connectionStatus = 'Finding agent...';
      }
    }, 1000);
    setTimeout(() => {
      if (isConnecting) {
        currentPhase = 'ringing';
        connectionStatus = 'Calling agent...';
      }
    }, 3000);
  }

  function endCall() {
    console.log('End call');
    isConnecting = false;
    currentPhase = 'terminated';
    connectionStatus = 'Call ended';
  }

  function toggleMute() {
    console.log('Toggle mute');
    uiControls.muteState = !uiControls.muteState;
  }

  function retryCall() {
    errorMessage = '';
    isConnecting = false;
    connectionStatus = 'Disconnected';
    connectionRetryCount = 0;
    currentPhase = 'terminated';
  }

  function getConnectionStatusMessage(phase) {
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

  function getStatusColor(phase) {
    switch (phase) {
      case 'active': return 'text-green-600';
      case 'connecting': 
      case 'routing':
      case 'ringing': return 'text-yellow-600';
      case 'terminated': return 'text-gray-600';
      default: return 'text-blue-600';
    }
  }

  function getCallPhase() {
    return currentPhase;
  }

  function getCallUIControls() {
    return uiControls;
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
        <div class="w-4 h-4 rounded-full mr-2 {getCallPhase() === 'active' ? 'bg-green-500' : ['connecting', 'routing', 'ringing'].includes(getCallPhase()) ? 'bg-yellow-500 animate-pulse' : getCallPhase() === 'terminated' && errorMessage ? 'bg-red-500' : 'bg-gray-400'}"></div>
        <span class="text-sm font-medium {getStatusColor(getCallPhase())}">
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
      {#if getCallPhase() === 'terminated' || getCallPhase() === 'initializing'}
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
      {:else if ['routing', 'ringing', 'connecting'].includes(getCallPhase())}
        <div class="text-center py-4">
          <div class="animate-pulse">
            <div class="w-16 h-16 bg-yellow-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <p class="text-gray-600 mb-4">{getConnectionStatusMessage(getCallPhase())}</p>
          </div>
        </div>

        <!-- Call Controls during connecting -->
        <div class="flex space-x-4">
          <button
            on:click={toggleMute}
            disabled={!getCallUIControls().muteAvailable}
            class="flex-1 {getCallUIControls().muteState ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            {#if getCallUIControls().muteState}
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
            disabled={!getCallUIControls().endCallAvailable}
            class="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18"/>
            </svg>
            End Call
          </button>
        </div>
      {:else if getCallPhase() === 'active'}
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
            class="flex-1 {getCallUIControls().muteState ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200 flex items-center justify-center"
          >
            {#if getCallUIControls().muteState}
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