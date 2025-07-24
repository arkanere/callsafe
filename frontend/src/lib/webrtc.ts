import { browser } from '$app/environment';
import type { CallState, ConnectionConfig, CallMetrics, CallQuality, MediaConstraints } from './types/webrtc.js';

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callState: CallState;
  private callMetrics: CallMetrics;
  private onStateChange?: (state: CallState) => void;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onWebRTCStateChange?: (state: string, reason: string | null) => void;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  constructor(isCustomer: boolean = true) {
    this.callState = {
      status: 'idle',
      isCustomer,
      isMuted: false
    };
    
    this.callMetrics = {
      startTime: Date.now(),
      connectionAttempts: 0,
      quality: { level: 'good' }
    };
  }

  private getIceServers(): RTCIceServer[] {
    console.log('=== GET ICE SERVERS ===');
    const iceServers: RTCIceServer[] = [];
    
    // STUN servers from environment variables
    const stunServer1 = import.meta.env.VITE_STUN_SERVER_1;
    const stunServer2 = import.meta.env.VITE_STUN_SERVER_2;
    
    console.log('STUN Server 1:', stunServer1);
    console.log('STUN Server 2:', stunServer2);
    
    if (stunServer1) {
      iceServers.push({ urls: stunServer1 });
      console.log('Added STUN server 1');
    }
    if (stunServer2) {
      iceServers.push({ urls: stunServer2 });
      console.log('Added STUN server 2');
    }
    
    // TURN server from environment variables
    const turnServerUrl = import.meta.env.VITE_TURN_SERVER_URL;
    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;
    
    console.log('TURN URL:', turnServerUrl);
    console.log('TURN User:', turnUsername);
    console.log('TURN Credential:', turnCredential ? '***' : 'undefined');
    
    if (turnServerUrl && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnServerUrl,
        username: turnUsername,
        credential: turnCredential
      });
      console.log('Added TURN server');
    } else {
      console.log('TURN server not configured - missing credentials');
    }
    
    // Fallback STUN servers
    if (iceServers.length === 0) {
      iceServers.push(
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      );
    }
    
    return iceServers;
  }

  private createPeerConnection(): RTCPeerConnection {
    console.log('=== CREATE PEER CONNECTION ===');
    console.log('Getting ICE servers...');
    
    const iceServers = this.getIceServers();
    console.log('ICE Servers:', iceServers);
    
    const config: RTCConfiguration = {
      iceServers: iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    console.log('WebRTC Config:', config);
    const pc = new RTCPeerConnection(config);
    console.log('Peer connection created successfully');
    
    pc.onicecandidate = (event) => {
      console.log('ICE candidate event:', event.candidate);
      if (event.candidate && this.onIceCandidate) {
        console.log('Sending ICE candidate:', event.candidate);
        this.onIceCandidate(event.candidate);
      }
    };
    
    pc.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
      
      // Set audio output to earpiece on mobile
      this.setMobileAudioOutput();
    };
    
    pc.onconnectionstatechange = () => {
      console.log('Connection state change:', pc.connectionState);
      this.handleConnectionStateChange(pc.connectionState);
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state change:', pc.iceConnectionState);
      this.handleIceConnectionStateChange(pc.iceConnectionState);
    };
    
    return pc;
  }

  private handleConnectionStateChange(state: RTCPeerConnectionState) {
    console.log('=== CONNECTION STATE CHANGE ===');
    console.log('New state:', state);
    
    switch (state) {
      case 'connected':
        console.log('WebRTC connection established!');
        // Only update to connected if we're not already connected (prevent timer reset)
        if (this.callState.status !== 'connected') {
          this.updateCallState({ status: 'connected' });
        }
        break;
      case 'connecting':
        console.log('WebRTC connection attempting...');
        // Don't reset to connecting if already connected (prevents timer reset)
        if (this.callState.status === 'idle') {
          this.updateCallState({ status: 'connecting' });
        }
        break;
      case 'disconnected':
        console.log('WebRTC connection disconnected - ICE will handle reconnection');
        // Let ICE connection state handle reconnection logic
        break;
      case 'failed':
        console.log('WebRTC connection failed:', state);
        this.updateCallState({ status: 'failed', error: `Connection ${state}` });
        break;
      default:
        console.log('WebRTC connection state:', state);
    }
  }

  private handleIceConnectionStateChange(state: RTCIceConnectionState) {
    console.log('=== ICE CONNECTION STATE CHANGE ===');
    console.log('New ICE state:', state);
    
    switch (state) {
      case 'connected':
      case 'completed':
        console.log('ICE connection established!');
        this.callMetrics.quality = { level: 'good' };
        // Only update to connected if we're not already connected
        if (this.callState.status !== 'connected') {
          this.updateCallState({ status: 'connected' });
        }
        // Notify server of successful WebRTC connection
        this.onWebRTCStateChange?.('webrtc_connected', null);
        break;
      case 'disconnected':
        console.log('ICE connection disconnected - attempting reconnection...');
        this.callMetrics.quality = { level: 'poor' };
        // Don't change status to failed immediately - wait for reconnection
        this.updateCallState({ status: 'connecting' });
        // Notify server of WebRTC disconnection
        this.onWebRTCStateChange?.('webrtc_disconnected', 'ice_disconnected');
        break;
      case 'failed':
        console.log('ICE connection failed!');
        this.callMetrics.quality = { level: 'failed' };
        this.updateCallState({ status: 'failed', error: 'ICE connection failed' });
        // Notify server of WebRTC failure
        this.onWebRTCStateChange?.('webrtc_failed', 'ice_connection_failed');
        break;
      case 'checking':
        console.log('ICE connection checking...');
        // Don't reset timer during normal ICE checking
        break;
      default:
        console.log('ICE connection state:', state);
    }
  }

  private updateCallState(updates: Partial<CallState>) {
    this.callState = { ...this.callState, ...updates };
    if (this.onStateChange) {
      this.onStateChange(this.callState);
    }
  }

  async initializeMedia(constraints: MediaConstraints = { audio: true, video: false }): Promise<void> {
    if (!browser) return;
    
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Reset mute state when initializing media
      this.callState.isMuted = false;
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
      }
      
      return Promise.resolve();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to access media devices';
      this.updateCallState({ status: 'failed', error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  async createOffer(callId: string): Promise<RTCSessionDescriptionInit> {
    console.log('=== CREATING OFFER START ===');
    console.log('Call ID:', callId);
    console.log('Local stream exists:', !!this.localStream);
    console.log('TURN URL:', import.meta.env.VITE_TURN_SERVER_URL);
    console.log('TURN User:', import.meta.env.VITE_TURN_USERNAME);
    console.log('TURN Credential:', import.meta.env.VITE_TURN_CREDENTIAL ? '***' : 'undefined');
    
    if (!this.localStream) {
      console.error('ERROR: Local stream not initialized');
      throw new Error('Local stream not initialized');
    }

    this.callState.callId = callId;
    this.updateCallState({ status: 'connecting' });
    this.callMetrics.connectionAttempts++;

    console.log('Creating peer connection...');
    this.peerConnection = this.createPeerConnection();
    
    // Add local stream to peer connection
    this.localStream.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    return offer;
  }

  async createAnswer(callId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.localStream) {
      throw new Error('Local stream not initialized');
    }

    this.callState.callId = callId;
    this.updateCallState({ status: 'connecting' });
    this.callMetrics.connectionAttempts++;

    this.peerConnection = this.createPeerConnection();
    
    // Add local stream to peer connection
    this.localStream.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    await this.peerConnection.setRemoteDescription(offer);
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    // Process any pending ICE candidates now that remote description is set
    await this.processPendingIceCandidates();
    
    return answer;
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    
    console.log('Setting remote answer:', answer);
    await this.peerConnection.setRemoteDescription(answer);
    
    // Process any pending ICE candidates now that remote description is set
    await this.processPendingIceCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit | any): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    
    // Validate and normalize candidate format first
    const normalizedCandidate = this.normalizeIceCandidate(candidate);
    if (!normalizedCandidate) {
      return; // Skip invalid candidates
    }
    
    // If no remote description is set yet, queue the candidate
    if (!this.peerConnection.remoteDescription) {
      console.log('📦 Queueing ICE candidate - remote description not set yet');
      this.pendingIceCandidates.push(normalizedCandidate);
      return;
    }
    
    // Add the candidate immediately if remote description is available
    await this.addIceCandidateImmediate(normalizedCandidate);
  }

  private normalizeIceCandidate(candidate: any): RTCIceCandidateInit | null {
    if (!candidate || typeof candidate !== 'object') {
      console.warn('Candidate is not an object, skipping:', candidate);
      return null;
    }

    // Handle both direct RTCIceCandidateInit and wrapped formats
    if (candidate.candidate && candidate.sdpMid !== undefined && candidate.sdpMLineIndex !== undefined) {
      // Already in correct format
      return candidate;
    } else if (candidate.candidate && candidate.candidate.candidate && candidate.candidate.sdpMid !== undefined) {
      // Wrapped in candidate object (from Android)
      return {
        candidate: candidate.candidate.candidate,
        sdpMid: candidate.candidate.sdpMid,
        sdpMLineIndex: candidate.candidate.sdpMLineIndex,
        usernameFragment: candidate.candidate.usernameFragment
      };
    } else {
      console.warn('Invalid candidate format, skipping:', candidate);
      return null;
    }
  }

  private async addIceCandidateImmediate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      console.warn('Cannot add ICE candidate - peer connection not available');
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(candidate);
      console.log('✅ ICE candidate added successfully');
    } catch (error) {
      console.warn('Failed to add ICE candidate:', error);
      // Don't throw - ICE candidates can fail without breaking the call
    }
  }

  private async processPendingIceCandidates(): Promise<void> {
    if (this.pendingIceCandidates.length === 0) {
      return;
    }

    console.log(`📦 Processing ${this.pendingIceCandidates.length} pending ICE candidates`);
    
    // Process all pending candidates
    const candidates = [...this.pendingIceCandidates];
    this.pendingIceCandidates = []; // Clear the queue
    
    for (const candidate of candidates) {
      await this.addIceCandidateImmediate(candidate);
    }
    
    console.log('✅ All pending ICE candidates processed');
  }

  private setMobileAudioOutput(): void {
    console.log('🎵 Setting mobile audio output...');
    
    // Try to set audio output to earpiece on mobile
    if (browser && 'setSinkId' in HTMLAudioElement.prototype) {
      const remoteAudio = document.querySelector('audio[autoplay]') as HTMLAudioElement;
      if (remoteAudio) {
        // Try to set to earpiece/phone speaker
        remoteAudio.setSinkId('communications').then(() => {
          console.log('✅ Audio output set to earpiece');
        }).catch((error) => {
          // Handle different error types appropriately
          if (error.name === 'NotFoundError') {
            console.log('📱 Audio output device not available on this device (normal on some browsers/devices)');
          } else if (error.name === 'NotAllowedError') {
            console.log('🔒 Audio output change not allowed by browser policy');
          } else {
            console.log('⚠️ Could not set audio output:', error.name, '-', error.message);
          }
          
          // Fallback: ensure audio will still play through default output
          try {
            remoteAudio.play().catch(() => {
              console.log('📱 Audio autoplay may require user interaction');
            });
          } catch (playError) {
            console.log('📱 Audio playback setup failed:', playError.message);
          }
        });
      }
    }
    
    // Also try to set audio context to handle mobile audio routing
    if (browser && window.AudioContext) {
      try {
        const audioContext = new AudioContext();
        // Request permission for audio on mobile
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch((error) => {
            console.log('📱 Audio context resume failed (may require user interaction):', error.message);
          });
        }
      } catch (error) {
        console.log('📱 Audio context setup failed:', error.message);
      }
    }
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    
    try {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.callState.isMuted = !audioTrack.enabled;
        console.log('🔇 Mute toggled:', this.callState.isMuted ? 'muted' : 'unmuted');
        
        // Only pass the mute state change, don't affect other state
        if (this.onStateChange) {
          this.onStateChange({ isMuted: this.callState.isMuted });
        }
        
        return this.callState.isMuted;
      }
    } catch (error) {
      console.error('❌ Error toggling mute:', error);
    }
    
    return false;
  }

  endCall(): void {
    this.callMetrics.endTime = Date.now();
    this.callMetrics.duration = this.callMetrics.endTime - this.callMetrics.startTime;
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    // Clear any pending ICE candidates
    this.pendingIceCandidates = [];
    
    this.updateCallState({ status: 'ended' });
  }

  getCallState(): CallState {
    return { ...this.callState };
  }

  getCallMetrics(): CallMetrics {
    return { ...this.callMetrics };
  }

  setStateChangeHandler(handler: (state: CallState) => void): void {
    this.onStateChange = handler;
  }

  setRemoteStreamHandler(handler: (stream: MediaStream) => void): void {
    this.onRemoteStream = handler;
  }

  setWebRTCStateChangeHandler(handler: (state: string, reason: string | null) => void): void {
    this.onWebRTCStateChange = handler;
  }

  private onIceCandidate?: (candidate: RTCIceCandidate) => void;
  
  setIceCandidateHandler(handler: (candidate: RTCIceCandidate) => void): void {
    this.onIceCandidate = handler;
  }
}