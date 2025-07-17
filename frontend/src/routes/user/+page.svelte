<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  let hasCreatedHandle = false;
  let hasEmbedded = false;
  let callSafeHandle = '';
  let embedCode = '';
  let showEmbedCode = false;
  let showInlineEmbedCode = false;
  let copied = false;
  let userHandles = [];
  let isLoading = false;
  
  // Helper function to construct full URL from handle
  function getFullUrl(handle) {
    return `https://callsafe.vercel.app/call/${handle}`;
  }
  
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
    if (callSafeHandle) {
      goto(`/agent/${callSafeHandle}`);
    } else {
      goto('/agent');
    }
  }
  
  function goToCustomer() {
    if (callSafeHandle) {
      goto(`/call/${callSafeHandle}`);
    } else {
      goto('/customer');
    }
  }
  
  onMount(() => {
    loadUserHandles();
  });
  
  async function loadUserHandles() {
    try {
      const response = await fetch(`/api/links?userId=${userId}`);
      const data = await response.json();
      
      if (data.success) {
        userHandles = data.handles;
        
        // Check if user has created any handles
        if (userHandles.length > 0) {
          hasCreatedHandle = true;
          // Use the first handle for display
          const firstHandle = userHandles[0];
          callSafeHandle = firstHandle.handle;
          hasEmbedded = firstHandle.is_embedded;
          
          // Generate embed code using full URL
          generateEmbedCode(getFullUrl(firstHandle.handle));
        }
      }
    } catch (error) {
      console.error('Error loading user handles:', error);
    }
  }
  
  function generateEmbedCode(handleUrl) {
    const uniqueId = `callsafe-widget-${Date.now()}`;
    const modalId = `callsafe-modal-${Date.now()}`;
    // Extract the handle from the URL
    const handle = handleUrl.split('/').pop();
    // Use the signaling server URL directly
    const serverUrl = 'https://tunnel.callsafe.tech';
    
    embedCode = `<!-- CallSafe Anonymous Calling Widget -->
<div id="${uniqueId}">
  <button type="button" 
     style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 8px; font-weight: 600; font-family: system-ui, -apple-system, sans-serif; transition: background-color 0.2s ease; cursor: pointer;">
    📞 Call Us Anonymously
  </button>
</div>

<!-- CallSafe Modal -->
<div id="${modalId}" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; justify-content: center; align-items: center;">
  <div style="background: white; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; margin: 20px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 20px;">
      <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 20px; font-weight: 600;">Anonymous Call</h3>
      <p id="${modalId}-status" style="margin: 0; color: #6b7280; font-size: 14px;">Ready to connect</p>
    </div>
    
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 60px; height: 60px; margin: 0 auto 16px; border-radius: 50%; background: #f3f4f6; display: flex; align-items: center; justify-content: center;">
        <svg id="${modalId}-icon" style="width: 24px; height: 24px; color: #6b7280;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
        </svg>
      </div>
      
      
      <div id="${modalId}-call-controls" style="display: none; margin-top: 16px;">
        <button id="${modalId}-mute-btn" type="button" 
                style="background: #6b7280; color: white; padding: 8px 16px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer; margin-right: 8px;">
          Mute
        </button>
        <button id="${modalId}-end-btn" type="button" 
                style="background: #dc2626; color: white; padding: 8px 16px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">
          End Call
        </button>
      </div>
    </div>
    
    <div style="text-align: center;">
      <button type="button" onclick="document.getElementById('${modalId}').style.display='none'" 
              style="background: #f3f4f6; color: #374151; padding: 8px 16px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 14px;">
        Cancel
      </button>
    </div>
  </div>
</div>

<scr` + `ipt>
(function() {
  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  
  // CallSafe WebRTC and Socket functionality
  class CallSafeClient {
    constructor() {
      this.socket = null;
      this.peerConnection = null;
      this.localStream = null;
      this.isConnected = false;
      this.callId = null;
      this.isMuted = false;
      this.callState = 'idle';
      this.serverUrl = '${serverUrl}';
      this.handle = '${handle}';
    }
    
    async connect() {
      if (typeof io === 'undefined') {
        // Load Socket.IO if not available
        await this.loadSocketIO();
      }
      
      return new Promise((resolve, reject) => {
        this.socket = io(this.serverUrl, {
          transports: ['websocket', 'polling']
        });
        
        this.socket.on('connect', () => {
          this.isConnected = true;
          this.setupSocketHandlers();
          resolve();
        });
        
        this.socket.on('connect_error', (error) => {
          reject(error);
        });
      });
    }
    
    async loadSocketIO() {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    
    setupSocketHandlers() {
      this.socket.on('call_accepted', async (data) => {
        console.log('🎉 EMBED: Call accepted by agent:', data);
        this.callId = data.callId;
        this.updateStatus('Creating connection...', 'connecting');
        
        try {
          console.log('📞 EMBED: Creating WebRTC offer...');
          const offer = await this.createOffer();
          console.log('📤 EMBED: Sending offer to agent:', offer);
          this.socket.emit('offer', { callId: this.callId, offer });
          console.log('✅ EMBED: Offer sent successfully');
        } catch (error) {
          console.error('❌ EMBED: Failed to create offer:', error);
          this.updateStatus('Connection failed', 'failed');
        }
      });
      
      this.socket.on('answer', async (data) => {
        console.log('📥 EMBED: Received answer from agent:', data);
        try {
          console.log('📤 EMBED: Setting remote description...');
          await this.peerConnection.setRemoteDescription(data.answer);
          console.log('✅ EMBED: Remote description set successfully');
        } catch (error) {
          console.error('❌ EMBED: Failed to set remote description:', error);
          this.updateStatus('Connection failed', 'failed');
        }
      });
      
      this.socket.on('ice_candidate', async (data) => {
        console.log('🧊 EMBED: Received ICE candidate:', data);
        try {
          console.log('📤 EMBED: Adding ICE candidate...');
          await this.peerConnection.addIceCandidate(data.candidate);
          console.log('✅ EMBED: ICE candidate added successfully');
        } catch (error) {
          console.error('❌ EMBED: Failed to add ICE candidate:', error);
        }
      });
      
      this.socket.on('no_agents_available', () => {
        console.log('❌ EMBED: No agents available');
        this.updateStatus('No agents available', 'failed');
      });
      
      this.socket.on('call_timeout', () => {
        console.log('⏰ EMBED: Call timeout');
        this.updateStatus('Call timeout', 'failed');
      });
      
      this.socket.on('call_ended', () => {
        console.log('📞 EMBED: Call ended by agent');
        this.updateStatus('Call ended', 'ended');
        this.hideCallControls();
      });
    }
    
    async initializeMedia() {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return true;
      } catch (error) {
        throw new Error('Microphone access denied');
      }
    }
    
    async createOffer() {
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 EMBED: Sending ICE candidate:', event.candidate);
          this.socket.emit('ice_candidate', { callId: this.callId, candidate: event.candidate });
          console.log('✅ EMBED: ICE candidate sent');
        } else {
          console.log('✅ EMBED: ICE candidate gathering complete');
        }
      };
      
      this.peerConnection.ontrack = (event) => {
        console.log('🎵 EMBED: Received remote track:', event);
        const remoteAudio = document.createElement('audio');
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        remoteAudio.style.display = 'none';
        document.body.appendChild(remoteAudio);
        console.log('✅ EMBED: Remote audio element created and added to DOM');
      };
      
      this.peerConnection.onconnectionstatechange = () => {
        console.log('🔄 EMBED: Connection state changed to:', this.peerConnection.connectionState);
        if (this.peerConnection.connectionState === 'connected') {
          console.log('✅ EMBED: WebRTC connection established');
          this.updateStatus('Connected to agent', 'connected');
        } else if (this.peerConnection.connectionState === 'failed') {
          console.log('❌ EMBED: WebRTC connection failed');
          this.updateStatus('Connection failed', 'failed');
        } else if (this.peerConnection.connectionState === 'disconnected') {
          console.log('⚠️ EMBED: WebRTC connection disconnected');
        } else if (this.peerConnection.connectionState === 'connecting') {
          console.log('🔄 EMBED: WebRTC connection is connecting');
        }
      };
      
      console.log('📤 EMBED: Adding local stream tracks to peer connection...');
      this.localStream.getTracks().forEach(track => {
        console.log('📤 EMBED: Adding track:', track.kind, track.enabled);
        this.peerConnection.addTrack(track, this.localStream);
      });
      console.log('✅ EMBED: Local stream tracks added');
      
      console.log('📤 EMBED: Creating offer...');
      const offer = await this.peerConnection.createOffer();
      console.log('📤 EMBED: Setting local description...');
      await this.peerConnection.setLocalDescription(offer);
      console.log('✅ EMBED: Offer created and local description set');
      
      return offer;
    }
    
    async startCall() {
      console.log('=== EMBED CODE START CALL ===');
      console.log('Handle:', this.handle);
      console.log('Server URL:', this.serverUrl);
      console.log('Call State:', this.callState);
      
      try {
        console.log('📤 EMBED: Requesting microphone...');
        this.updateStatus('Requesting microphone...', 'connecting');
        await this.initializeMedia();
        console.log('✅ EMBED: Microphone access granted');
        
        console.log('📤 EMBED: Connecting to service...');
        this.updateStatus('Connecting to service...', 'connecting');
        await this.connect();
        console.log('✅ EMBED: Connected to service');
        
        console.log('📤 EMBED: Looking for agent...');
        this.updateStatus('Looking for agent...', 'connecting');
        console.log('📤 EMBED: Emitting customer_connect_with_handle with handle:', this.handle);
        this.socket.emit('customer_connect_with_handle', { handle: this.handle });
        console.log('✅ EMBED: customer_connect_with_handle emitted');
        
        this.callState = 'connecting';
        this.showCallControls();
        console.log('✅ EMBED: Call controls shown, state set to connecting');
        
      } catch (error) {
        console.error('❌ EMBED: Start call failed:', error);
        this.updateStatus('Connection failed: ' + error.message, 'failed');
      }
    }
    
    toggleMute() {
      if (this.localStream) {
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !audioTrack.enabled;
          this.isMuted = !audioTrack.enabled;
          
          const muteBtn = document.getElementById('${modalId}-mute-btn');
          muteBtn.textContent = this.isMuted ? 'Unmute' : 'Mute';
          muteBtn.style.backgroundColor = this.isMuted ? '#dc2626' : '#6b7280';
        }
      }
    }
    
    endCall() {
      console.log('=== EMBED CODE END CALL CLICKED ===');
      console.log('Socket exists:', !!this.socket);
      console.log('Socket connected:', this.socket?.connected);
      console.log('Call ID:', this.callId);
      console.log('Call state:', this.callState);
      console.log('Local stream exists:', !!this.localStream);
      console.log('Peer connection exists:', !!this.peerConnection);
      
      if (this.socket) {
        console.log('📤 EMBED: Emitting call_ended event...');
        this.socket.emit('call_ended');
        console.log('✅ EMBED: call_ended event emitted');
        
        // Add a small delay to ensure the event is processed before disconnect
        console.log('📤 EMBED: Waiting 100ms before disconnecting...');
        setTimeout(() => {
          console.log('📤 EMBED: Disconnecting socket...');
          this.socket.disconnect();
          console.log('✅ EMBED: Socket disconnected');
        }, 100);
      } else {
        console.log('❌ EMBED: No socket available for endCall');
      }
      
      if (this.localStream) {
        console.log('📤 EMBED: Stopping local stream tracks...');
        this.localStream.getTracks().forEach(track => track.stop());
        console.log('✅ EMBED: Local stream tracks stopped');
      }
      
      if (this.peerConnection) {
        console.log('📤 EMBED: Closing peer connection...');
        this.peerConnection.close();
        console.log('✅ EMBED: Peer connection closed');
      }
      
      console.log('📤 EMBED: Updating status to ended...');
      this.updateStatus('Call ended', 'ended');
      this.hideCallControls();
      console.log('✅ EMBED: End call process completed');
    }
    
    updateStatus(message, state) {
      const statusEl = document.getElementById('${modalId}-status');
      const iconEl = document.getElementById('${modalId}-icon');
      
      if (statusEl) statusEl.textContent = message;
      
      if (state === 'connecting') {
        iconEl.style.color = '#f59e0b';
      } else if (state === 'connected') {
        iconEl.style.color = '#10b981';
      } else if (state === 'failed') {
        iconEl.style.color = '#dc2626';
      }
    }
    
    showCallControls() {
      const controls = document.getElementById('${modalId}-call-controls');
      if (controls) controls.style.display = 'block';
    }
    
    hideCallControls() {
      const controls = document.getElementById('${modalId}-call-controls');
      if (controls) controls.style.display = 'none';
    }
  }
  
  // Initialize CallSafe widget
  function initCallSafe() {
    const widget = document.querySelector('#${uniqueId}');
    const modal = document.querySelector('#${modalId}');
    
    if (!widget || !modal) return;
    
    const button = widget.querySelector('button');
    const muteBtn = document.getElementById('${modalId}-mute-btn');
    const endBtn = document.getElementById('${modalId}-end-btn');
    
    if (!button) return;
    
    const callSafe = new CallSafeClient();
    
    // Add hover effect to main button
    button.addEventListener('mouseenter', function() {
      this.style.backgroundColor = '#1d4ed8';
    });
    
    button.addEventListener('mouseleave', function() {
      this.style.backgroundColor = '#2563eb';
    });
    
    // Show modal and start call immediately
    button.addEventListener('click', function(e) {
      e.preventDefault();
      modal.style.display = 'flex';
      callSafe.startCall();
    });
    
    
    // Mute button handler
    muteBtn.addEventListener('click', function() {
      callSafe.toggleMute();
    });
    
    // End call button handler
    endBtn.addEventListener('click', function() {
      callSafe.endCall();
    });
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });
    
    // Close modal on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
      }
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCallSafe);
  } else {
    initCallSafe();
  }
})();
</scr` + `ipt>`;
  }
  
  async function createCallSafeHandle() {
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
        const newHandle = data.handle;
        userHandles = [newHandle, ...userHandles];
        callSafeHandle = newHandle.handle;
        hasCreatedHandle = true;
        hasEmbedded = newHandle.is_embedded;
        
        // Generate embed code using full URL
        generateEmbedCode(getFullUrl(newHandle.handle));
      } else {
        alert('Failed to create handle: ' + data.error);
      }
    } catch (error) {
      console.error('Error creating handle:', error);
      alert('Failed to create handle. Please try again.');
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
          <!-- Step 1: Create Handle -->
          <div class="flex items-center p-4 bg-gray-50 rounded-xl">
            <div class="w-8 h-8 rounded-full flex items-center justify-center mr-4 {hasCreatedHandle ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}">
              {#if hasCreatedHandle}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              {:else}
                <span class="text-sm font-bold">1</span>
              {/if}
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900">Create Your CallSafe Handle</h3>
              <p class="text-sm text-gray-600">Generate a unique handle for your website</p>
            </div>
            {#if !hasCreatedHandle}
              <button
                on:click={createCallSafeHandle}
                disabled={isLoading}
                class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                {isLoading ? 'Creating...' : 'Create Handle'}
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
            {#if hasCreatedHandle && !hasEmbedded}
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

    <!-- Created Handle Display - Only show after embedding -->
    {#if hasEmbedded && callSafeHandle}
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
        
        <!-- Full URL -->
        <div class="mb-6">
          <h3 class="text-sm font-medium text-gray-700 mb-2">Full URL:</h3>
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="flex items-center justify-between">
              <code class="text-sm text-gray-700 break-all">{getFullUrl(callSafeHandle)}</code>
              <button
                on:click={() => copyToClipboard(getFullUrl(callSafeHandle))}
                class="ml-4 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-semibold transition-colors duration-200"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
        
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-semibold text-gray-900">Embed Code</h3>
          <button
            on:click={() => showInlineEmbedCode = !showInlineEmbedCode}
            class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors duration-200"
          >
            {showInlineEmbedCode ? 'Hide Code' : 'Get Code'}
          </button>
        </div>
        
        {#if showInlineEmbedCode}
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
        {/if}
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
        
        <!-- Step 1: Your CallSafe Handle -->
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Step 1: Your CallSafe Handle</h3>
          <p class="text-gray-600 mb-4">Your unique CallSafe handle:</p>
          
          <!-- Handle Identifier -->
          <div class="mb-4">
            <h4 class="text-sm font-medium text-gray-700 mb-2">Handle:</h4>
            <div class="bg-blue-50 p-3 rounded-lg">
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
          
          <!-- Full URL -->
          <div>
            <h4 class="text-sm font-medium text-gray-700 mb-2">Full URL:</h4>
            <div class="bg-gray-50 p-3 rounded-lg">
              <div class="flex items-center justify-between">
                <code class="text-sm text-gray-700 break-all">{getFullUrl(callSafeHandle)}</code>
                <button
                  on:click={() => copyToClipboard(getFullUrl(callSafeHandle))}
                  class="ml-4 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-semibold transition-colors duration-200"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
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
            <a href={getFullUrl(callSafeHandle)} 
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