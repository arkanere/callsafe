<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { AuthManager } from '$lib/managers/auth-manager';
  
  let hasCreatedHandle = true; // Always true since handle is created during signup
  let hasEmbedded = false;
  let callSafeHandle = '';
  let copied = false;
  let userHandles = [];
  let isLoading = false;
  let userData = null;
  
  // Helper function to construct full URL from handle
  function getFullUrl(handle) {
    return `https://callsafe.tech/embed/${handle}`;
  }
  
  // Check for authentication and load user data
  onMount(() => {
    console.log('[USER PAGE] Component mounted');
    console.log('[USER PAGE] Checking token validity');
    
    if (!AuthManager.isTokenValid()) {
      console.log('[USER PAGE] Token invalid, redirecting to /');
      goto('/');
      return;
    }
    
    console.log('[USER PAGE] Token valid, loading user data');
    // Load user data from JWT token
    userData = AuthManager.getUserFromToken();
    console.log('[USER PAGE] User data from token:', userData);
    
    if (userData) {
      callSafeHandle = userData.handle;
      console.log('[USER PAGE] CallSafe handle set:', callSafeHandle);
    }
    
    // Load additional user data from API if needed
    loadUserData();
  });
  
  // Simulate user progress - in real app this would come from backend
  let totalCalls = hasEmbedded ? 24 : 0;
  let totalTime = hasEmbedded ? '2h 15m' : '0m';
  let successfulCalls = hasEmbedded ? 18 : 0;
  
  function logout() {
    console.log('[USER PAGE] Logout initiated');
    AuthManager.logout();
    console.log('[USER PAGE] Logout completed');
  }
  
  function goToAgent() {
    console.log('[USER PAGE] Going to agent page, handle:', callSafeHandle);
    if (callSafeHandle) {
      console.log('[USER PAGE] Navigating to /user/receive/' + callSafeHandle);
      goto(`/user/receive/${callSafeHandle}`);
    } else {
      console.log('[USER PAGE] No handle available for agent access');
      // Note: errorMessage variable doesn't exist in the component
      console.error('[USER PAGE] Missing handle for agent portal access');
    }
  }
  
  function goToCustomer() {
    console.log('[USER PAGE] Going to customer page, handle:', callSafeHandle);
    if (callSafeHandle) {
      const sourceIdParam = userData?.sourceId ? `?sourceId=${userData.sourceId}` : '';
      const targetUrl = `/embed/${callSafeHandle}${sourceIdParam}`;
      console.log('[USER PAGE] Navigating to customer page:', targetUrl);
      goto(targetUrl);
    } else {
      console.log('[USER PAGE] No handle, navigating to /user/customer');
      goto('/user/customer');
    }
  }
  
  async function loadUserData() {
    console.log('[USER PAGE] Loading additional user data');
    // For now, we have user data from JWT token
    // This function can be extended to load additional data from API if needed
    console.log('[USER PAGE] User data loaded from JWT:', userData);
  }
  
  
  function copyToClipboard(text: string) {
    console.log('[USER PAGE] Copying to clipboard:', text);
    navigator.clipboard.writeText(text).then(() => {
      console.log('[USER PAGE] Text copied successfully');
      copied = true;
      setTimeout(() => {
        copied = false;
        console.log('[USER PAGE] Copy status reset');
      }, 2000);
    }).catch(error => {
      console.error('[USER PAGE] Failed to copy text:', error);
    });
  }
  
  async function markAsEmbedded() {
    console.log('[USER PAGE] Mark as embedded called');
    if (isLoading) {
      console.log('[USER PAGE] Already loading, skipping');
      return;
    }
    
    console.log('[USER PAGE] Starting embed marking process');
    isLoading = true;
    
    try {
      console.log('[USER PAGE] Marking as embedded (demo mode)');
      // For demo purposes, just mark as embedded locally
      hasEmbedded = true;
      
      // Update stats
      totalCalls = 24;
      totalTime = '2h 15m';
      successfulCalls = 18;
      
      console.log('[USER PAGE] Embed status updated successfully');
    } catch (error) {
      console.error('[USER PAGE] Error updating embed status:', error);
      alert('Failed to update embed status. Please try again.');
    } finally {
      console.log('[USER PAGE] Embed marking process finished');
      isLoading = false;
    }
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-green-50 to-blue-100">
  <div class="max-w-6xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="bg-white rounded-2xl shadow-xl p-6 mb-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-800">Welcome, {userData?.name || 'User'}!</h1>
          <p class="text-gray-600">CallSafe User Dashboard</p>
        </div>
        <button
          on:click={logout}
          class="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-xl transition-colors duration-200"
        >
          Logout
        </button>
      </div>
    </div>

    <!-- User Information -->
    {#if userData}
      <div class="bg-white rounded-2xl shadow-xl p-6 mb-8">
        <h2 class="text-xl font-bold text-gray-900 mb-4">User Information</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Email -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Email:</h3>
            <div class="bg-gray-50 p-3 rounded-lg">
              <code class="text-sm text-gray-700">{userData.email}</code>
            </div>
          </div>
          
          <!-- Handle -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Handle:</h3>
            <div class="bg-gray-50 p-3 rounded-lg">
              {#if callSafeHandle}
                <div class="flex items-center justify-between">
                  <code class="text-sm font-mono text-blue-600 font-semibold">{callSafeHandle}</code>
                  <button
                    on:click={() => copyToClipboard(callSafeHandle)}
                    class="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs font-semibold transition-colors duration-200"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              {:else}
                <span class="text-sm text-gray-500 italic">No handle assigned</span>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Setup Progress -->

    <!-- CallSafe Handle Display -->
    
      <div class="bg-white rounded-2xl shadow-xl p-6 mb-8">
        <h2 class="text-xl font-bold text-gray-900 mb-4">Your CallSafe Handle</h2>
        
        <!-- Embed Code -->
        <div class="mb-4">
          <h3 class="text-sm font-medium text-gray-700 mb-2">Embed Code (Optimized for Fast Page Load):</h3>
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="mb-2">
              <code class="text-xs text-gray-700 break-all block whitespace-pre-wrap font-mono">&lt;script&gt;
  window.addEventListener('load', function() &#123;
    var script = document.createElement('script');
    script.src = 'https://callsafe.tech/embed.js';
    script.setAttribute('data-handle', '{callSafeHandle}');
    script.setAttribute('data-source-id', 'PUT_YOUR_PAGE_ID_HERE');
    document.body.appendChild(script);
  &#125;);
&lt;/script&gt;</code>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500">Replace "PUT_YOUR_PAGE_ID_HERE" with your tracking ID</span>
              <button
                on:click={() => copyToClipboard(`<script>
  window.addEventListener('load', function() {
    var script = document.createElement('script');
    script.src = 'https://callsafe.tech/embed.js';
    script.setAttribute('data-handle', '${callSafeHandle}');
    script.setAttribute('data-source-id', 'PUT_YOUR_PAGE_ID_HERE');
    document.body.appendChild(script);
  });
</script>`)}
                class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-semibold transition-colors duration-200"
              >
                {copied ? 'Copied!' : 'Copy Embed Code'}
              </button>
            </div>
          </div>
        </div>
        
        <!-- Embed Confirmation Button -->
        {#if !hasEmbedded}
          <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="flex items-start">
              <div class="flex-shrink-0">
                <svg class="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div class="ml-3 flex-1">
                <p class="text-sm font-medium text-blue-800">Ready to start receiving calls?</p>
                <p class="text-sm text-blue-700 mt-1">Once you've embedded the code on your website, click the button below to activate your CallSafe service.</p>
                <div class="mt-3">
                  <button
                    on:click={markAsEmbedded}
                    disabled={isLoading}
                    class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:cursor-not-allowed flex items-center"
                  >
                    {#if isLoading}
                      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    {:else}
                      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                      </svg>
                      I have embedded this code
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          </div>
        {:else}
          <div class="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div class="flex items-center">
              <svg class="w-5 h-5 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <div>
                <p class="text-sm font-medium text-green-800">CallSafe is active!</p>
                <p class="text-sm text-green-700">Your widget is embedded and ready to receive calls.</p>
              </div>
            </div>
          </div>
        {/if}
        
      </div>
      


      
    <!-- Quick Actions -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div class="bg-white rounded-2xl shadow-xl p-8">
          <div class="text-center">
            <div class="w-20 h-20 bg-purple-100 rounded-full mx-auto mb-6 flex items-center justify-center">
              <svg class="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-4">Receive Calls</h3>
            <p class="text-gray-600 mb-6">Accept and manage incoming calls from customers</p>
            <button
              on:click={goToAgent}
              class="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              Receive Calls
            </button>
          </div>
        </div>
        
        <div class="bg-white rounded-2xl shadow-xl p-8">
          <div class="text-center">
            <div class="w-20 h-20 bg-blue-100 rounded-full mx-auto mb-6 flex items-center justify-center">
              <svg class="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-4">Make Calls</h3>
            <p class="text-gray-600 mb-6">Test the calling experience as a customer</p>
            <button
              on:click={goToCustomer}
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              Make Calls
            </button>
          </div>
        </div>
      </div>

  </div>
</div>

