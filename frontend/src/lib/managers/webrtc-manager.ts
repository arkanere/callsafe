import { Socket } from 'socket.io-client';

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private socket: Socket;

  constructor(socket: Socket) {
    console.log('[WEBRTC MANAGER] constructor(): Constructor called');
    this.socket = socket;
    console.log('[WEBRTC MANAGER] constructor(): Socket assigned');
  }

  async initialize(callAttemptId: string) {
    console.log('[WEBRTC MANAGER] initialize(): Initializing WebRTC for call:', callAttemptId);
    
    console.log('[WEBRTC MANAGER] initialize(): Requesting user media');
    // Get user media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
    console.log('[WEBRTC MANAGER] initialize(): User media obtained successfully');

    console.log('[WEBRTC MANAGER] initialize(): Creating peer connection');
    // Create peer connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    console.log('[WEBRTC MANAGER] initialize(): Peer connection created');

    console.log('[WEBRTC MANAGER] initialize(): Adding local stream tracks to peer connection');
    // Add local stream
    this.localStream.getTracks().forEach(track => {
      console.log('[WEBRTC MANAGER] initialize(): Adding track:', track.kind);
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    console.log('[WEBRTC MANAGER] initialize(): Setting up remote stream handler');
    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('[WEBRTC MANAGER] initialize(): Remote track received:', event.track.kind);
      const remoteStream = event.streams[0];
      this.playRemoteAudio(remoteStream);
      
      console.log('[WEBRTC MANAGER] initialize(): Remote stream established successfully');
      // Remote stream received - connection established successfully
      // Server timeout will be cleared automatically when answer is processed
    };

    console.log('[WEBRTC MANAGER] initialize(): Setting up ICE candidate handler');
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WEBRTC MANAGER] initialize(): Sending ICE candidate');
        this.socket.emit('webrtc:ice-candidate', {
          callAttemptId: callAttemptId,
          candidate: event.candidate,
          timestamp: Date.now()
        });
      } else {
        console.log('[WEBRTC MANAGER] initialize(): ICE gathering complete');
      }
    };

    console.log('[WEBRTC MANAGER] initialize(): Setting up ICE connection state handler');
    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection!.iceConnectionState;
      console.log('[WEBRTC MANAGER] initialize(): ICE connection state changed:', state);
      
      if (state === 'failed') {
        console.error('[WEBRTC MANAGER] initialize(): ICE connection failed');
        this.handleConnectionFailure(callAttemptId);
      }
      // Connection success is handled by server timeout management
    };
    
    console.log('[WEBRTC MANAGER] initialize(): WebRTC initialization complete');
  }

  async createAnswer(offer: RTCSessionDescription, callAttemptId: string) {
    console.log('[WEBRTC MANAGER] createAnswer(): Creating answer for call:', callAttemptId);
    
    if (!this.peerConnection) {
      console.error('[WEBRTC MANAGER] createAnswer(): Peer connection not initialized');
      throw new Error('Peer connection not initialized');
    }

    console.log('[WEBRTC MANAGER] createAnswer(): Setting remote description from offer');
    await this.peerConnection.setRemoteDescription(offer);
    
    console.log('[WEBRTC MANAGER] createAnswer(): Creating answer');
    const answer = await this.peerConnection.createAnswer();
    
    console.log('[WEBRTC MANAGER] createAnswer(): Setting local description with answer');
    await this.peerConnection.setLocalDescription(answer);

    console.log('[WEBRTC MANAGER] createAnswer(): Sending answer to signaling server');
    this.socket.emit('webrtc:answer', {
      callAttemptId: callAttemptId,
      answer: answer,
      timestamp: Date.now()
    });

    console.log('[WEBRTC MANAGER] createAnswer(): Answer creation and sending complete');
    // Server handles WebRTC connection timeout - no frontend timeout needed
  }

  async createOffer(callAttemptId: string): Promise<RTCSessionDescription> {
    console.log('[WEBRTC MANAGER] createOffer(): Creating offer for call:', callAttemptId);
    
    if (!this.peerConnection) {
      console.error('[WEBRTC MANAGER] createOffer(): Peer connection not initialized');
      throw new Error('Peer connection not initialized');
    }

    console.log('[WEBRTC MANAGER] createOffer(): Creating WebRTC offer');
    const offer = await this.peerConnection.createOffer();
    
    console.log('[WEBRTC MANAGER] createOffer(): Setting local description with offer');
    await this.peerConnection.setLocalDescription(offer);

    console.log('[WEBRTC MANAGER] createOffer(): Sending offer to signaling server');
    this.socket.emit('webrtc:offer', {
      callAttemptId: callAttemptId,
      offer: offer,
      timestamp: Date.now()
    });

    console.log('[WEBRTC MANAGER] createOffer(): Offer creation and sending complete');
    return offer;
  }

  async setRemoteDescription(answer: RTCSessionDescription) {
    console.log('[WEBRTC MANAGER] setRemoteDescription(): Setting remote description with answer');
    
    if (!this.peerConnection) {
      console.error('[WEBRTC MANAGER] setRemoteDescription(): Peer connection not initialized');
      throw new Error('Peer connection not initialized');
    }

    console.log('[WEBRTC MANAGER] setRemoteDescription(): Applying remote description');
    await this.peerConnection.setRemoteDescription(answer);
    console.log('[WEBRTC MANAGER] setRemoteDescription(): Remote description set successfully');
  }

  async addIceCandidate(candidate: RTCIceCandidate) {
    console.log('[WEBRTC MANAGER] addIceCandidate(): Adding ICE candidate');
    
    if (!this.peerConnection) {
      console.error('[WEBRTC MANAGER] addIceCandidate(): Peer connection not initialized');
      throw new Error('Peer connection not initialized');
    }

    console.log('[WEBRTC MANAGER] addIceCandidate(): Adding ICE candidate to peer connection');
    await this.peerConnection.addIceCandidate(candidate);
    console.log('[WEBRTC MANAGER] addIceCandidate(): ICE candidate added successfully');
  }

  toggleMute(): boolean {
    console.log('[WEBRTC MANAGER] toggleMute(): Toggling mute');
    
    if (!this.localStream) {
      console.log('[WEBRTC MANAGER] toggleMute(): No local stream available for mute toggle');
      return false;
    }

    const audioTracks = this.localStream.getAudioTracks();
    console.log('[WEBRTC MANAGER] toggleMute(): Found', audioTracks.length, 'audio tracks');
    
    audioTracks.forEach(track => {
      const wasEnabled = track.enabled;
      track.enabled = !track.enabled;
      console.log('[WEBRTC MANAGER] toggleMute(): Track mute toggled from', wasEnabled, 'to', track.enabled);
    });

    const isMuted = !audioTracks[0]?.enabled;
    console.log('[WEBRTC MANAGER] toggleMute(): Mute toggle complete, muted:', isMuted);
    return isMuted;
  }

  private playRemoteAudio(remoteStream: MediaStream) {
    console.log('[WEBRTC MANAGER] playRemoteAudio(): Setting up remote audio playback');
    
    const audioElement = document.querySelector('audio[autoplay]') as HTMLAudioElement;
    if (audioElement) {
      console.log('[WEBRTC MANAGER] playRemoteAudio(): Audio element found, setting remote stream');
      audioElement.srcObject = remoteStream;
      audioElement.play().then(() => {
        console.log('[WEBRTC MANAGER] playRemoteAudio(): Remote audio playback started');
      }).catch((error) => {
        console.error('[WEBRTC MANAGER] playRemoteAudio(): Failed to start remote audio playback:', error);
      });
    } else {
      console.error('[WEBRTC MANAGER] playRemoteAudio(): No audio element found for remote stream playback');
    }
  }

  private handleConnectionFailure(callAttemptId: string): void {
    console.error('[WEBRTC MANAGER] handleConnectionFailure(): WebRTC connection failed for call:', callAttemptId);

    console.log('[WEBRTC MANAGER] handleConnectionFailure(): Emitting call:failed event to signaling server');
    // Emit call:failed event to signaling server
    this.socket.emit('call:failed', {
      callAttemptId: callAttemptId,
      reason: 'connection_failed',
      timestamp: Date.now()
    });

    console.log('[WEBRTC MANAGER] handleConnectionFailure(): Cleaning up WebRTC resources');
    // UI cleanup will be handled by call:failed event from server
    // Clean up WebRTC resources immediately
    this.cleanup();
  }

  cleanup(): void {
    console.log('[WEBRTC MANAGER] cleanup(): Starting cleanup');
    
    // Stop local media stream
    if (this.localStream) {
      console.log('[WEBRTC MANAGER] cleanup(): Stopping local media tracks');
      this.localStream.getTracks().forEach(track => {
        console.log('[WEBRTC MANAGER] cleanup(): Stopping track:', track.kind);
        track.stop();
      });
      this.localStream = null;
      console.log('[WEBRTC MANAGER] cleanup(): Local stream cleaned up');
    }

    // Close peer connection
    if (this.peerConnection) {
      console.log('[WEBRTC MANAGER] cleanup(): Closing peer connection');
      this.peerConnection.close();
      this.peerConnection = null;
      console.log('[WEBRTC MANAGER] cleanup(): Peer connection cleaned up');
    }
    
    console.log('[WEBRTC MANAGER] cleanup(): Cleanup complete');
  }

  getConnectionState(): RTCPeerConnectionState | null {
    const state = this.peerConnection?.connectionState || null;
    console.log('[WEBRTC MANAGER] getConnectionState(): Getting connection state:', state);
    return state;
  }
}