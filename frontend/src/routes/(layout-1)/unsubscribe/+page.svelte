<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  let email = '';
  let isConfirming = true;
  let isLoading = false;
  let isSuccess = false;
  let errorMessage = '';

  onMount(() => {
    const params = new URLSearchParams($page.url.search);
    email = params.get('email') || '';
  });

  async function handleConfirm() {
    if (!email) {
      errorMessage = 'No email address found';
      return;
    }

    isLoading = true;
    errorMessage = '';

    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const result = await response.json();

      if (result.success) {
        isConfirming = false;
        isSuccess = true;
      } else {
        errorMessage = result.error || 'Failed to unsubscribe';
      }
    } catch (error) {
      errorMessage = 'An error occurred. Please try again.';
      console.error('Unsubscribe error:', error);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="min-h-screen bg-white flex items-center justify-center px-6">
  <div class="max-w-md w-full">
    {#if isConfirming}
      <div class="text-center">
        <h1 class="text-4xl font-light text-gray-900 mb-8">
          Confirm Unsubscription
        </h1>

        <p class="text-lg text-gray-600 font-light mb-4 leading-relaxed">
          Please confirm that you want to unsubscribe
        </p>
        <p class="text-lg text-gray-900 font-medium mb-8">
          {email}
        </p>
        <p class="text-base text-gray-600 font-light mb-8">
          from our email list.
        </p>

        {#if errorMessage}
          <div class="mb-8 p-4 bg-red-50 border border-red-200 rounded">
            <p class="text-sm text-red-700">{errorMessage}</p>
          </div>
        {/if}

        <button
          on:click={handleConfirm}
          disabled={isLoading || !email}
          class="w-full bg-gray-900 text-white px-8 py-4 text-lg font-medium tracking-wide hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-300"
        >
          {isLoading ? 'Processing...' : 'Confirm Unsubscription'}
        </button>
      </div>
    {:else if isSuccess}
      <div class="text-center">
        <div class="w-16 h-16 mx-auto mb-8 text-green-600 flex justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>

        <h1 class="text-4xl font-light text-gray-900 mb-8">
          Unsubscription Successful
        </h1>

        <p class="text-lg text-gray-600 font-light leading-relaxed">
          You have been unsubscribed from our email list.<br />
          You will no longer receive emails from CallSafe.
        </p>
      </div>
    {/if}
  </div>
</div>
