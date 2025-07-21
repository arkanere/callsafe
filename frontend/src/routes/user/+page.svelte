<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  let hasCreatedHandle = true; // Always true since handle is created during signup
  let hasEmbedded = false;
  let callSafeHandle = '';
  let copied = false;
  let userHandles = [];
  let isLoading = false;
  let userData = null;
  
  // Helper function to construct full URL from handle
  function getFullUrl(handle) {
    return `https://callsafe.tech/user/call/${handle}`;
  }
  
  // Get user ID from localStorage (session management)
  let userId = 1; // fallback for development
  
  // Check for stored user session
  onMount(() => {
    const storedUserId = localStorage.getItem('callsafe_userId');
    if (storedUserId) {
      userId = parseInt(storedUserId);
    } else {
      // No session found - redirect to home page
      goto('/');
      return;
    }
    
    // Continue with loading user data
    loadUserData();
    loadUserHandles();
  });
  
  // Simulate user progress - in real app this would come from backend
  let totalCalls = hasEmbedded ? 24 : 0;
  let totalTime = hasEmbedded ? '2h 15m' : '0m';
  let successfulCalls = hasEmbedded ? 18 : 0;
  
  function logout() {
    // Clear session data
    localStorage.removeItem('callsafe_userId');
    localStorage.removeItem('callsafe_user');
    
    // Redirect to home page
    goto('/');
  }
  
  function goToAgent() {
    if (callSafeHandle) {
      goto(`/user/receive/${callSafeHandle}`);
    } else {
      errorMessage = 'Please create a handle first to access the agent portal';
    }
  }
  
  function goToCustomer() {
    if (callSafeHandle) {
      const sourceIdParam = userData?.sourceId ? `?sourceId=${userData.sourceId}` : '';
      goto(`/user/call/${callSafeHandle}${sourceIdParam}`);
    } else {
      goto('/user/customer');
    }
  }
  
  async function loadUserData() {
    try {
      const response = await fetch(`/api/user?userId=${userId}`);
      const data = await response.json();
      
      if (data.success) {
        userData = data.user;
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  async function loadUserHandles() {
    try {
      const response = await fetch(`/api/links?userId=${userId}`);
      const data = await response.json();
      
      if (data.success) {
        userHandles = data.handles;
        
        // User should always have at least one handle (created during signup)
        if (userHandles.length > 0) {
          // Use the first handle for display
          const firstHandle = userHandles[0];
          callSafeHandle = firstHandle.handle;
          hasEmbedded = firstHandle.is_embedded;
        } else {
          // This shouldn't happen since handles are created during signup
          console.error('No handles found for user - this indicates a signup issue');
        }
      }
    } catch (error) {
      console.error('Error loading user handles:', error);
    }
  }
  
  
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      copied = true;
      setTimeout(() => copied = false, 2000);
    });
  }
  
  async function markAsEmbedded() {
    if (isLoading || !userHandles.length) return;
    
    isLoading = true;
    
    try {
      const firstHandle = userHandles[0];
      const response = await fetch('/api/links', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          handleId: firstHandle.handle_id, 
          isEmbedded: true 
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        hasEmbedded = true;
        // Update the handle in the array
        userHandles = userHandles.map(handle => 
          handle.handle_id === firstHandle.handle_id 
            ? { ...handle, is_embedded: true }
            : handle
        );
        
        // Update stats
        totalCalls = 24;
        totalTime = '2h 15m';
        successfulCalls = 18;
        
      } else {
        alert('Failed to update embed status: ' + data.error);
      }
    } catch (error) {
      console.error('Error updating embed status:', error);
      alert('Failed to update embed status. Please try again.');
    } finally {
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
          
          <!-- Source ID -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Source ID:</h3>
            <div class="bg-gray-50 p-3 rounded-lg">
              {#if userData.sourceId}
                <div class="flex items-center justify-between">
                  <code class="text-sm font-mono text-blue-600 font-semibold">{userData.sourceId}</code>
                  <button
                    on:click={() => copyToClipboard(userData.sourceId)}
                    class="ml-2 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs font-semibold transition-colors duration-200"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              {:else}
                <span class="text-sm text-gray-500 italic">No source ID assigned</span>
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
        
        <!-- Handle Identifier -->
        <div class="mb-4">
          <h3 class="text-sm font-medium text-gray-700 mb-2">Handle:</h3>
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="flex items-center justify-between">
              <code class="text-lg font-mono text-blue-600 font-semibold">{callSafeHandle}</code>
              <button
                on:click={() => copyToClipboard(callSafeHandle)}
                class="ml-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-semibold transition-colors duration-200"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
        <!-- Embed Code -->
        <div class="mb-4">
          <h3 class="text-sm font-medium text-gray-700 mb-2">Embed Code:</h3>
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="mb-2">
              <code class="text-sm text-gray-700 break-all">&lt;script src="https://callsafe.tech/embed.js" data-handle="{callSafeHandle}" data-source-id="your-page-id"&gt;&lt;/script&gt;</code>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-gray-500">Replace "your-page-id" with your tracking ID</span>
              <button
                on:click={() => copyToClipboard(`<script src="https://callsafe.tech/embed.js" data-handle="${callSafeHandle}" data-source-id="your-page-id"></script>`)}
                class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-semibold transition-colors duration-200"
              >
                {copied ? 'Copied!' : 'Copy Embed Code'}
              </button>
            </div>
          </div>
        </div>
        
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

