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
    const iceServers: RTCIceServer[] = [];
    
    // STUN servers from environment variables
    const stunServer1 = import.meta.env.VITE_STUN_SERVER_1;
    const stunServer2 = import.meta.env.VITE_STUN_SERVER_2;
    
    if (stunServer1) iceServers.push({ urls: stunServer1 });
    if (stunServer2) iceServers.push({ urls: stunServer2 });
    
    // TURN server from environment variables
    const turnServerUrl = import.meta.env.VITE_TURN_SERVER_URL;
    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;
    
    // Debug environment variables
    console.log('TURN URL:', turnServerUrl);
    console.log('TURN User:', turnUsername);
    console.log('TURN Credential:', turnCredential ? '***' : 'undefined');
    
    if (turnServerUrl && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnServerUrl,
        username: turnUsername,
        credential: turnCredential
      });
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
    // Debug environment variables
    console.log('TURN URL:', import.meta.env.VITE_TURN_SERVER_URL);
    console.log('TURN User:', import.meta.env.VITE_TURN_USERNAME);
    console.log('TURN Credential:', import.meta.env.VITE_TURN_CREDENTIAL ? '***' : 'undefined');
    
    const config: RTCConfiguration = {
      iceServers: this.getIceServers(),
      iceCandidatePoolSize: 10
    };

    console.log('WebRTC Config:', config);
    const pc = new RTCPeerConnection(config);
    
    pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };
    
    pc.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };
    
    pc.onconnectionstatechange = () => {
      this.handleConnectionStateChange(pc.connectionState);
    };
    
    pc.oniceconnectionstatechange = () => {
      this.handleIceConnectionStateChange(pc.iceConnectionState);
    };
    
    return pc;
  }

  private handleConnectionStateChange(state: RTCPeerConnectionState) {
    switch (state) {
      case 'connected':
        this.updateCallState({ status: 'connected' });
        break;
      case 'disconnected':
      case 'failed':
        this.updateCallState({ status: 'failed', error: `Connection ${state}` });
        break;
    }
  }

  private handleIceConnectionStateChange(state: RTCIceConnectionState) {
    switch (state) {
      case 'connected':
      case 'completed':
        this.callMetrics.quality = { level: 'good' };
        break;
      case 'disconnected':
        this.callMetrics.quality = { level: 'poor' };
        break;
      case 'failed':
        this.callMetrics.quality = { level: 'failed' };
        this.updateCallState({ status: 'failed', error: 'ICE connection failed' });
        break;
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
      return Promise.resolve();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to access media devices';
      this.updateCallState({ status: 'failed', error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  async createOffer(callId: string): Promise<RTCSessionDescriptionInit> {
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
    
    return answer;
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    
    await this.peerConnection.setRemoteDescription(answer);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    
    await this.peerConnection.addIceCandidate(candidate);
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.callState.isMuted = !audioTrack.enabled;
      this.updateCallState({ isMuted: this.callState.isMuted });
      return this.callState.isMuted;
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

  private onIceCandidate?: (candidate: RTCIceCandidate) => void;
  
  setIceCandidateHandler(handler: (candidate: RTCIceCandidate) => void): void {
    this.onIceCandidate = handler;
  }
}