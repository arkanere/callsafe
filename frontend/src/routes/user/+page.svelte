<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  let hasCreatedLink = false;
  let hasEmbedded = false;
  let callSafeLink = '';
  let embedCode = '';
  let showEmbedCode = false;
  let copied = false;
  let userLinks = [];
  let isLoading = false;
  
  // Hardcoded user ID for MVP - in real app this would come from session
  const userId = 1;
  
  // Simulate user progress - in real app this would come from backend
  let totalCalls = hasEmbedded ? 24 : 0;
  let totalTime = hasEmbedded ? '2h 15m' : '0m';
  let successfulCalls = hasEmbedded ? 18 : 0;
  
  function logout() {
    // Simple logout - redirect to home
    goto('/');
  }
  
  function goToAgent() {
    goto('/agent');
  }
  
  function goToCustomer() {
    goto('/customer');
  }
  
  onMount(() => {
    loadUserLinks();
  });
  
  async function loadUserLinks() {
    try {
      const response = await fetch(`/api/links?userId=${userId}`);
      const data = await response.json();
      
      if (data.success) {
        userLinks = data.links;
        
        // Check if user has created any links
        if (userLinks.length > 0) {
          hasCreatedLink = true;
          // Use the first link for display
          const firstLink = userLinks[0];
          callSafeLink = firstLink.link_url;
          hasEmbedded = firstLink.is_embedded;
          
          // Generate embed code
          generateEmbedCode(firstLink.link_url);
        }
      }
    } catch (error) {
      console.error('Error loading user links:', error);
    }
  }
  
  function generateEmbedCode(linkUrl) {
    embedCode = `<!-- CallSafe Anonymous Calling Widget -->
<div id="callsafe-widget">
  <a href="${linkUrl}" 
     target="_blank" 
     style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-family: system-ui, -apple-system, sans-serif;">
    📞 Call Us Anonymously
  </a>
</div>
<scr` + `ipt>
// Optional: Add click tracking
document.getElementById('callsafe-widget').addEventListener('click', function() {
  // Track click event
  console.log('CallSafe widget clicked');
});
</scr` + `ipt>`;
  }
  
  async function createCallSafeLink() {
    if (isLoading) return;
    
    isLoading = true;
    
    try {
      const response = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        const newLink = data.link;
        userLinks = [newLink, ...userLinks];
        callSafeLink = newLink.link_url;
        hasCreatedLink = true;
        hasEmbedded = newLink.is_embedded;
        
        // Generate embed code
        generateEmbedCode(newLink.link_url);
      } else {
        alert('Failed to create link: ' + data.error);
      }
    } catch (error) {
      console.error('Error creating link:', error);
      alert('Failed to create link. Please try again.');
    } finally {
      isLoading = false;
    }
  }
  
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      copied = true;
      setTimeout(() => copied = false, 2000);
    });
  }
  
  async function markAsEmbedded() {
    if (isLoading || !userLinks.length) return;
    
    isLoading = true;
    
    try {
      const firstLink = userLinks[0];
      const response = await fetch('/api/links', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          linkId: firstLink.link_id, 
          isEmbedded: true 
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        hasEmbedded = true;
        // Update the link in the array
        userLinks = userLinks.map(link => 
          link.link_id === firstLink.link_id 
            ? { ...link, is_embedded: true }
            : link
        );
        
        // Update stats
        totalCalls = 24;
        totalTime = '2h 15m';
        successfulCalls = 18;
        
        // Close the modal
        showEmbedCode = false;
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
          <h1 class="text-3xl font-bold text-gray-800">Welcome, Aniruddha!</h1>
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

    <!-- Setup Progress -->
    {#if !hasEmbedded}
      <div class="bg-white rounded-2xl shadow-xl p-6 mb-8">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">Get Started with CallSafe</h2>
        <p class="text-gray-600 mb-6">Follow these steps to start receiving anonymous calls from your customers</p>
        
        <div class="space-y-4">
          <!-- Step 1: Create Link -->
          <div class="flex items-center p-4 bg-gray-50 rounded-xl">
            <div class="w-8 h-8 rounded-full flex items-center justify-center mr-4 {hasCreatedLink ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}">
              {#if hasCreatedLink}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              {:else}
                <span class="text-sm font-bold">1</span>
              {/if}
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900">Create Your CallSafe Link</h3>
              <p class="text-sm text-gray-600">Generate a unique link for your website</p>
            </div>
            {#if !hasCreatedLink}
              <button
                on:click={createCallSafeLink}
                disabled={isLoading}
                class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                {isLoading ? 'Creating...' : 'Create Link'}
              </button>
            {:else}
              <span class="text-green-600 font-semibold">✓ Complete</span>
            {/if}
          </div>
          
          <!-- Step 2: Embed Code -->
          <div class="flex items-center p-4 bg-gray-50 rounded-xl">
            <div class="w-8 h-8 rounded-full flex items-center justify-center mr-4 {hasEmbedded ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}">
              {#if hasEmbedded}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              {:else}
                <span class="text-sm font-bold">2</span>
              {/if}
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900">Embed on Your Website</h3>
              <p class="text-sm text-gray-600">Add the CallSafe widget to your website</p>
            </div>
            {#if hasCreatedLink && !hasEmbedded}
              <button
                on:click={() => showEmbedCode = true}
                class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                Get Code
              </button>
            {:else if hasEmbedded}
              <span class="text-green-600 font-semibold">✓ Complete</span>
            {:else}
              <span class="text-gray-400 font-semibold">Pending</span>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- User Stats - Only show after embedding -->
    {#if hasEmbedded}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white rounded-xl shadow-lg p-6">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900">{totalCalls}</p>
              <p class="text-sm text-gray-600">Total Calls</p>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-xl shadow-lg p-6">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900">{totalTime}</p>
              <p class="text-sm text-gray-600">Total Time</p>
            </div>
          </div>
        </div>
        
        <div class="bg-white rounded-xl shadow-lg p-6">
          <div class="flex items-center">
            <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mr-4">
              <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <p class="text-2xl font-bold text-gray-900">{successfulCalls}</p>
              <p class="text-sm text-gray-600">Successful Calls</p>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Quick Actions - Only show after embedding -->
    {#if hasEmbedded}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div class="bg-white rounded-2xl shadow-xl p-8">
          <div class="text-center">
            <div class="w-20 h-20 bg-purple-100 rounded-full mx-auto mb-6 flex items-center justify-center">
              <svg class="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-4">Agent Dashboard</h3>
            <p class="text-gray-600 mb-6">Manage incoming calls and handle customer inquiries</p>
            <button
              on:click={goToAgent}
              class="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              Go to Agent Portal
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
            <h3 class="text-2xl font-bold text-gray-900 mb-4">Customer Portal</h3>
            <p class="text-gray-600 mb-6">Test the customer calling experience</p>
            <button
              on:click={goToCustomer}
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              Go to Customer Portal
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Recent Activity - Only show after embedding -->
    {#if hasEmbedded}
      <div class="bg-white rounded-2xl shadow-xl p-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Recent Activity</h2>
        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div class="flex items-center">
              <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-4">
                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div>
                <p class="font-semibold text-gray-900">Successful Call</p>
                <p class="text-sm text-gray-600">Customer inquiry about pricing</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm font-medium text-gray-900">5 minutes</p>
              <p class="text-xs text-gray-500">2 hours ago</p>
            </div>
          </div>
          
          <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div class="flex items-center">
              <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
              </div>
              <div>
                <p class="font-semibold text-gray-900">Incoming Call</p>
                <p class="text-sm text-gray-600">Product demonstration request</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm font-medium text-gray-900">12 minutes</p>
              <p class="text-xs text-gray-500">4 hours ago</p>
            </div>
          </div>
          
          <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div class="flex items-center">
              <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-4">
                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div>
                <p class="font-semibold text-gray-900">Successful Call</p>
                <p class="text-sm text-gray-600">Support inquiry resolved</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm font-medium text-gray-900">8 minutes</p>
              <p class="text-xs text-gray-500">1 day ago</p>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Embed Code Modal -->
{#if showEmbedCode}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" on:click={() => showEmbedCode = false}>
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
      <div class="p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Embed CallSafe on Your Website</h2>
          <button
            on:click={() => showEmbedCode = false}
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <!-- Step 1: Your CallSafe Link -->
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Step 1: Your CallSafe Link</h3>
          <p class="text-gray-600 mb-4">This is your unique CallSafe link that customers will use to call you:</p>
          <div class="bg-gray-50 p-4 rounded-xl">
            <div class="flex items-center justify-between">
              <code class="text-sm text-gray-700 break-all">{callSafeLink}</code>
              <button
                on:click={() => copyToClipboard(callSafeLink)}
                class="ml-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
        
        <!-- Step 2: Embed Code -->
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Step 2: Embed Code</h3>
          <p class="text-gray-600 mb-4">Copy this code and paste it into your website where you want the CallSafe button to appear:</p>
          <div class="bg-gray-900 p-4 rounded-xl">
            <div class="flex items-start justify-between">
              <pre class="text-sm text-green-400 overflow-x-auto flex-1"><code>{embedCode}</code></pre>
              <button
                on:click={() => copyToClipboard(embedCode)}
                class="ml-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
        
        <!-- Step 3: Preview -->
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Step 3: Preview</h3>
          <p class="text-gray-600 mb-4">This is how the CallSafe button will look on your website:</p>
          <div class="bg-gray-50 p-6 rounded-xl text-center">
            <a href={callSafeLink} 
               target="_blank" 
               class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors duration-200">
              📞 Call Us Anonymously
            </a>
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex gap-4">
          <button
            on:click={() => showEmbedCode = false}
            class="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors duration-200"
          >
            Close
          </button>
          <button
            on:click={markAsEmbedded}
            disabled={isLoading}
            class="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isLoading ? 'Updating...' : '✓ I\'ve Embedded This Code'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}