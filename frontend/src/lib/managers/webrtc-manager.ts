import { WsTransport } from '$lib/transport/ws-transport';
import { MessageTypes } from '@callsafe/protocol';

// Verbose logging only in dev builds. console.error calls remain unconditional.
const dbg = import.meta.env.DEV
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private socket: WsTransport;
  private callType: 'voice' | 'video' = 'voice';
  private _isOfferer = false;
  private _disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _iceRestartAttempted = false;

  onAutoplayBlocked: (() => void) | null = null;

  constructor(socket: WsTransport) {
    dbg('[WEBRTC MANAGER] constructor(): Constructor called');
    this.socket = socket;
    dbg('[WEBRTC MANAGER] constructor(): Socket assigned');
  }

  private getIceServers(): RTCIceServer[] {
    const iceServers: RTCIceServer[] = [];

    // Add STUN servers from environment variables or use defaults
    const stunServer1 = import.meta.env.VITE_STUN_SERVER_1 || 'stun:stun.l.google.com:19302';
    const stunServer2 = import.meta.env.VITE_STUN_SERVER_2 || 'stun:stun1.l.google.com:19302';

    iceServers.push({ urls: stunServer1 });
    iceServers.push({ urls: stunServer2 });

    // Add TURN server from environment variables if available
    const turnServerUrl = import.meta.env.VITE_TURN_SERVER_URL;
    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

    if (turnServerUrl && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnServerUrl,
        username: turnUsername,
        credential: turnCredential
      });
      dbg('[WEBRTC MANAGER] getIceServers(): TURN server configured');
    } else {
      dbg('[WEBRTC MANAGER] getIceServers(): TURN server not configured - using STUN only');
    }

    return iceServers;
  }

  async initialize(callAttemptId: string, callType: 'voice' | 'video' = 'voice') {
    dbg('[WEBRTC MANAGER] initialize(): Initializing WebRTC for call:', callAttemptId, 'type:', callType);
    this.callType = callType;

    dbg('[WEBRTC MANAGER] initialize(): Requesting user media');
    // Get user media — request video track only for video calls
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: callType === 'video'
    });
    dbg('[WEBRTC MANAGER] initialize(): User media obtained successfully');

    dbg('[WEBRTC MANAGER] initialize(): Creating peer connection');
    // Create peer connection with dynamic ICE servers
    const iceServers = this.getIceServers();
    dbg('[WEBRTC MANAGER] initialize(): Using ICE servers:', iceServers);

    this.peerConnection = new RTCPeerConnection({
      iceServers: iceServers,
      iceTransportPolicy: 'all', // Allow both STUN and TURN, with STUN preferred
      iceCandidatePoolSize: 10   // Pre-gather ICE candidates for faster connection
    });
    dbg('[WEBRTC MANAGER] initialize(): Peer connection created');

    dbg('[WEBRTC MANAGER] initialize(): Adding local stream tracks to peer connection');
    // Add local stream
    this.localStream.getTracks().forEach(track => {
      dbg('[WEBRTC MANAGER] initialize(): Adding track:', track.kind);
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    dbg('[WEBRTC MANAGER] initialize(): Setting up remote stream handler');
    // Handle remote stream — route to video element for video calls, audio element otherwise
    this.peerConnection.ontrack = (event) => {
      dbg('[WEBRTC MANAGER] initialize(): Remote track received:', event.track.kind);
      const remoteStream = event.streams[0];
      if (this.callType === 'video') {
        this.playRemoteVideo(remoteStream);
      } else {
        this.playRemoteAudio(remoteStream);
      }

      dbg('[WEBRTC MANAGER] initialize(): Remote stream established successfully');
      // Remote stream received - connection established successfully
      // Server timeout will be cleared automatically when answer is processed
    };

    dbg('[WEBRTC MANAGER] initialize(): Setting up ICE candidate handler');
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        dbg('[WEBRTC MANAGER] initialize(): Sending ICE candidate');
        this.socket.emit(MessageTypes.WEBRTC_ICE_CANDIDATE, {
          callAttemptId: callAttemptId,
          candidate: event.candidate as unknown as Record<string, unknown>,
          timestamp: Date.now()
        });
      } else {
        dbg('[WEBRTC MANAGER] initialize(): ICE gathering complete');
      }
    };

    dbg('[WEBRTC MANAGER] initialize(): Setting up ICE connection state handler');
    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection!.iceConnectionState;
      dbg('[WEBRTC MANAGER] initialize(): ICE connection state changed:', state);

      if (state === 'connected' || state === 'completed') {
        if (this._disconnectTimer !== null) {
          clearTimeout(this._disconnectTimer);
          this._disconnectTimer = null;
        }
        this._iceRestartAttempted = false;
      } else if (state === 'disconnected') {
        // Transient — wait 4s before attempting ICE restart
        if (this._disconnectTimer === null) {
          this._disconnectTimer = setTimeout(() => {
            this._disconnectTimer = null;
            if (this.peerConnection?.iceConnectionState === 'disconnected') {
              this._triggerIceRestart(callAttemptId).catch(() => {
                this.handleConnectionFailure(callAttemptId);
              });
            }
          }, 4000);
        }
      } else if (state === 'failed') {
        if (this._disconnectTimer !== null) {
          clearTimeout(this._disconnectTimer);
          this._disconnectTimer = null;
        }
        if (!this._iceRestartAttempted) {
          this._triggerIceRestart(callAttemptId).catch(() => {
            this.handleConnectionFailure(callAttemptId);
          });
        } else {
          console.error('[WEBRTC MANAGER] initialize(): ICE restart failed, giving up');
          this.handleConnectionFailure(callAttemptId);
        }
      }
    };

    dbg('[WEBRTC MANAGER] initialize(): WebRTC initialization complete');
  }

  async createAnswer(offer: RTCSessionDescription, callAttemptId: string) {
    this._isOfferer = false;
    dbg('[WEBRTC MANAGER] createAnswer(): Creating answer for call:', callAttemptId);

    if (!this.peerConnection) {
      console.error('[WEBRTC MANAGER] createAnswer(): Peer connection not initialized');
      throw new Error('Peer connection not initialized');
    }

    dbg('[WEBRTC MANAGER] createAnswer(): Setting remote description from offer');
    await this.peerConnection.setRemoteDescription(offer);

    dbg('[WEBRTC MANAGER] createAnswer(): Creating answer');
    const answer = await this.peerConnection.createAnswer();

    dbg('[WEBRTC MANAGER] createAnswer(): Setting local description with answer');
    await this.peerConnection.setLocalDescription(answer);

    dbg('[WEBRTC MANAGER] createAnswer(): Sending answer to signaling server');
    this.socket.emit(MessageTypes.WEBRTC_ANSWER, {
      callAttemptId: callAttemptId,
      answer: answer as unknown as Record<string, unknown>,
      timestamp: Date.now()
    });

    dbg('[WEBRTC MANAGER] createAnswer(): Answer creation and sending complete');
    // Server handles WebRTC connection timeout - no frontend timeout needed
  }

  async createOffer(callAttemptId: string): Promise<RTCSessionDescription> {
    this._isOfferer = true;
    dbg('[WEBRTC MANAGER] createOffer(): Creating offer for call:', callAttemptId);

    if (!this.peerConnection) {
      console.error('[WEBRTC MANAGER] createOffer(): Peer connection not initialized');
      throw new Error('Peer connection not initialized');
    }

    dbg('[WEBRTC MANAGER] createOffer(): Creating WebRTC offer');
    const offer = await this.peerConnection.createOffer();

    dbg('[WEBRTC MANAGER] createOffer(): Setting local description with offer');
    await this.peerConnection.setLocalDescription(offer);

    dbg('[WEBRTC MANAGER] createOffer(): Sending offer to signaling server');
    this.socket.emit(MessageTypes.WEBRTC_OFFER, {
      callAttemptId: callAttemptId,
      offer: offer as unknown as Record<string, unknown>,
      timestamp: Date.now()
    });

    dbg('[WEBRTC MANAGER] createOffer(): Offer creation and sending complete');
    return offer;
  }

  async setRemoteDescription(answer: RTCSessionDescription) {
    dbg('[WEBRTC MANAGER] setRemoteDescription(): Setting remote description with answer');

    if (!this.peerConnection) {
      console.error('[WEBRTC MANAGER] setRemoteDescription(): Peer connection not initialized');
      throw new Error('Peer connection not initialized');
    }

    dbg('[WEBRTC MANAGER] setRemoteDescription(): Applying remote description');
    await this.peerConnection.setRemoteDescription(answer);
    dbg('[WEBRTC MANAGER] setRemoteDescription(): Remote description set successfully');
  }

  async addIceCandidate(candidate: RTCIceCandidate) {
    dbg('[WEBRTC MANAGER] addIceCandidate(): Adding ICE candidate');

    if (!this.peerConnection) {
      console.error('[WEBRTC MANAGER] addIceCandidate(): Peer connection not initialized');
      throw new Error('Peer connection not initialized');
    }

    dbg('[WEBRTC MANAGER] addIceCandidate(): Adding ICE candidate to peer connection');
    await this.peerConnection.addIceCandidate(candidate);
    dbg('[WEBRTC MANAGER] addIceCandidate(): ICE candidate added successfully');
  }

  toggleCamera(): boolean {
    dbg('[WEBRTC MANAGER] toggleCamera(): Toggling camera');

    if (!this.localStream) {
      dbg('[WEBRTC MANAGER] toggleCamera(): No local stream available for camera toggle');
      return false;
    }

    const videoTracks = this.localStream.getVideoTracks();
    dbg('[WEBRTC MANAGER] toggleCamera(): Found', videoTracks.length, 'video tracks');

    videoTracks.forEach(track => {
      const wasEnabled = track.enabled;
      track.enabled = !track.enabled;
      dbg('[WEBRTC MANAGER] toggleCamera(): Track toggled from', wasEnabled, 'to', track.enabled);
    });

    const isDisabled = !videoTracks[0]?.enabled;
    dbg('[WEBRTC MANAGER] toggleCamera(): Camera toggle complete, disabled:', isDisabled);
    return isDisabled;
  }

  toggleMute(): boolean {
    dbg('[WEBRTC MANAGER] toggleMute(): Toggling mute');

    if (!this.localStream) {
      dbg('[WEBRTC MANAGER] toggleMute(): No local stream available for mute toggle');
      return false;
    }

    const audioTracks = this.localStream.getAudioTracks();
    dbg('[WEBRTC MANAGER] toggleMute(): Found', audioTracks.length, 'audio tracks');

    audioTracks.forEach(track => {
      const wasEnabled = track.enabled;
      track.enabled = !track.enabled;
      dbg('[WEBRTC MANAGER] toggleMute(): Track mute toggled from', wasEnabled, 'to', track.enabled);
    });

    const isMuted = !audioTracks[0]?.enabled;
    dbg('[WEBRTC MANAGER] toggleMute(): Mute toggle complete, muted:', isMuted);
    return isMuted;
  }

  private playRemoteAudio(remoteStream: MediaStream) {
    dbg('[WEBRTC MANAGER] playRemoteAudio(): Setting up remote audio playback');

    const audioElement = document.querySelector('audio[autoplay]') as HTMLAudioElement;
    if (audioElement) {
      dbg('[WEBRTC MANAGER] playRemoteAudio(): Audio element found, setting remote stream');
      audioElement.srcObject = remoteStream;
      audioElement.play().then(() => {
        dbg('[WEBRTC MANAGER] playRemoteAudio(): Remote audio playback started');
      }).catch((error) => {
        console.error('[WEBRTC MANAGER] playRemoteAudio(): Failed to start remote audio playback:', error);
        this.onAutoplayBlocked?.();
      });
    } else {
      console.error('[WEBRTC MANAGER] playRemoteAudio(): No audio element found for remote stream playback');
    }
  }

  private playRemoteVideo(remoteStream: MediaStream) {
    dbg('[WEBRTC MANAGER] playRemoteVideo(): Setting up remote video playback');

    const videoElement = document.querySelector('video[data-remote]') as HTMLVideoElement;
    if (videoElement) {
      dbg('[WEBRTC MANAGER] playRemoteVideo(): Video element found, setting remote stream');
      videoElement.srcObject = remoteStream;
      videoElement.play().then(() => {
        dbg('[WEBRTC MANAGER] playRemoteVideo(): Remote video playback started');
      }).catch((error) => {
        console.error('[WEBRTC MANAGER] playRemoteVideo(): Failed to start remote video playback:', error);
        this.onAutoplayBlocked?.();
      });
    } else {
      console.error('[WEBRTC MANAGER] playRemoteVideo(): No video[data-remote] element found for remote stream playback');
    }
  }

  private async _triggerIceRestart(callAttemptId: string): Promise<void> {
    if (!this.peerConnection || this._iceRestartAttempted) return;
    this._iceRestartAttempted = true;

    if (this._isOfferer) {
      dbg('[WEBRTC MANAGER] _triggerIceRestart(): Restarting ICE for call:', callAttemptId);
      this.peerConnection.restartIce();
      await this.createOffer(callAttemptId);
    } else {
      console.error('[WEBRTC MANAGER] _triggerIceRestart(): Callee cannot restart ICE — signaling failure');
      this.handleConnectionFailure(callAttemptId);
    }
  }

  private handleConnectionFailure(callAttemptId: string): void {
    console.error('[WEBRTC MANAGER] handleConnectionFailure(): WebRTC connection failed for call:', callAttemptId);

    dbg('[WEBRTC MANAGER] handleConnectionFailure(): Emitting call:failed event to signaling server');
    // Emit call:failed event to signaling server
    this.socket.emit(MessageTypes.CALL_FAILED, {
      callAttemptId: callAttemptId,
      reason: 'connection_failed',
      timestamp: Date.now()
    });

    dbg('[WEBRTC MANAGER] handleConnectionFailure(): Cleaning up WebRTC resources');
    // UI cleanup will be handled by call:failed event from server
    // Clean up WebRTC resources immediately
    this.cleanup();
  }

  resumePlayback(): void {
    const audioEl = document.querySelector('audio[autoplay]') as HTMLAudioElement | null;
    if (audioEl?.srcObject) {
      audioEl.play().catch((e) => console.error('[WEBRTC MANAGER] resumePlayback(): audio play failed:', e));
    }
    const videoEl = document.querySelector('video[data-remote]') as HTMLVideoElement | null;
    if (videoEl?.srcObject) {
      videoEl.play().catch((e) => console.error('[WEBRTC MANAGER] resumePlayback(): video play failed:', e));
    }
  }

  cleanup(): void {
    dbg('[WEBRTC MANAGER] cleanup(): Starting cleanup');

    if (this._disconnectTimer !== null) {
      clearTimeout(this._disconnectTimer);
      this._disconnectTimer = null;
    }
    this._iceRestartAttempted = false;

    // Stop local media stream
    if (this.localStream) {
      dbg('[WEBRTC MANAGER] cleanup(): Stopping local media tracks');
      this.localStream.getTracks().forEach(track => {
        dbg('[WEBRTC MANAGER] cleanup(): Stopping track:', track.kind);
        track.stop();
      });
      this.localStream = null;
      dbg('[WEBRTC MANAGER] cleanup(): Local stream cleaned up');
    }

    // Close peer connection
    if (this.peerConnection) {
      dbg('[WEBRTC MANAGER] cleanup(): Closing peer connection');
      this.peerConnection.close();
      this.peerConnection = null;
      dbg('[WEBRTC MANAGER] cleanup(): Peer connection cleaned up');
    }

    dbg('[WEBRTC MANAGER] cleanup(): Cleanup complete');
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getConnectionState(): RTCPeerConnectionState | null {
    const state = this.peerConnection?.connectionState || null;
    dbg('[WEBRTC MANAGER] getConnectionState(): Getting connection state:', state);
    return state;
  }
}
