package tech.callsafe.business.managers

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import androidx.core.content.ContextCompat
import org.json.JSONObject
import org.webrtc.*

class WebRTCManager(private val context: Context) {
    private var peerConnection: PeerConnection? = null
    private var localAudioTrack: AudioTrack? = null
    private var localAudioSource: AudioSource? = null
    private var factory: PeerConnectionFactory? = null
    private var audioManager: AudioManager? = null
    private var listener: WebRTCListener? = null
    // Note: Connection timeout handled by signaling server (30 seconds)
    
    interface WebRTCListener {
        fun onConnectionEstablished()
        fun onConnectionFailed(error: String)
        fun onRemoteStreamReceived(stream: MediaStream)
    }
    
    fun initialize(listener: WebRTCListener) {
        this.listener = listener
        
        // Check microphone permission before initialization
        if (!hasMicrophonePermission()) {
            listener.onConnectionFailed("media_access_failed")
            return
        }
        
        // Initialize PeerConnectionFactory
        val initializeOptions = PeerConnectionFactory.InitializationOptions.builder(context)
            .setEnableInternalTracer(false)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(initializeOptions)
        
        val options = PeerConnectionFactory.Options()
        factory = PeerConnectionFactory.builder()
            .setOptions(options)
            .createPeerConnectionFactory()
        
        // Create peer connection
        val rtcConfig = PeerConnection.RTCConfiguration(
            listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
                PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer()
            )
        )
        
        peerConnection = factory?.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                sendIceCandidate(candidate)
            }
            
            override fun onAddStream(stream: MediaStream) {
                listener.onRemoteStreamReceived(stream)
                // Server manages connection timeout - no client-side timeout needed
            }
            
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                when (state) {
                    PeerConnection.IceConnectionState.CONNECTED -> {
                        listener.onConnectionEstablished()
                        // Server manages connection timeout - no client-side timeout needed
                    }
                    PeerConnection.IceConnectionState.FAILED -> {
                        listener.onConnectionFailed("ICE connection failed")
                        // Server manages connection timeout - no client-side timeout needed
                    }
                    else -> { /* Handle other states if needed */ }
                }
            }
            
            override fun onSignalingChange(state: PeerConnection.SignalingState) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
            override fun onRemoveStream(stream: MediaStream) {}
            override fun onDataChannel(channel: DataChannel) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: RtpReceiver, streams: Array<MediaStream>) {}
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {}
        })
        
        // Create local audio stream
        createLocalAudioStream()
        
        // Setup audio manager
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }
    
    private fun createLocalAudioStream() {
        // Request audio focus before creating audio stream
        if (!requestAudioFocus()) {
            listener?.onConnectionFailed("audio_focus_failed")
            return
        }
        
        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("echoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("noiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("autoGainControl", "true"))
        }
        
        localAudioSource = factory?.createAudioSource(audioConstraints)
        localAudioTrack = factory?.createAudioTrack("audio_track", localAudioSource)
        
        val localStream = factory?.createLocalMediaStream("local_stream")
        localStream?.addTrack(localAudioTrack)
        
        peerConnection?.addStream(localStream)
    }
    
    fun createAnswer(offer: SessionDescription, callAttemptId: String) {
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {}
            
            override fun onSetSuccess() {
                // Create answer
                peerConnection?.createAnswer(object : SdpObserver {
                    override fun onCreateSuccess(answer: SessionDescription) {
                        peerConnection?.setLocalDescription(object : SdpObserver {
                            override fun onCreateSuccess(description: SessionDescription) {}
                            override fun onSetSuccess() {
                                sendWebRTCAnswer(answer, callAttemptId)
                                // Note: Connection timeout handled by signaling server
                            }
                            override fun onCreateFailure(error: String) {
                                listener?.onConnectionFailed("Failed to set local description: $error")
                            }
                            override fun onSetFailure(error: String) {
                                listener?.onConnectionFailed("Failed to set local description: $error")
                            }
                        }, answer)
                    }
                    
                    override fun onCreateFailure(error: String) {
                        listener?.onConnectionFailed("Failed to create answer: $error")
                    }
                    
                    override fun onSetSuccess() {}
                    override fun onSetFailure(error: String) {}
                }, MediaConstraints())
            }
            
            override fun onCreateFailure(error: String) {
                listener?.onConnectionFailed("Failed to set remote description: $error")
            }
            
            override fun onSetFailure(error: String) {
                listener?.onConnectionFailed("Failed to set remote description: $error")
            }
        }, offer)
    }
    
    fun addIceCandidate(candidate: IceCandidate) {
        peerConnection?.addIceCandidate(candidate)
    }
    
    fun setMicrophoneEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }
    
    fun setSpeakerEnabled(enabled: Boolean) {
        audioManager?.let { am ->
            am.isSpeakerphoneOn = enabled
            if (enabled) {
                am.mode = AudioManager.MODE_IN_COMMUNICATION
            } else {
                am.mode = AudioManager.MODE_NORMAL
            }
        }
    }
    
    // Connection timeout is handled by signaling server (30 seconds)
    // Server will emit call:failed with reason "connection_timeout" if WebRTC connection fails
    
    private fun sendWebRTCAnswer(answer: SessionDescription, callAttemptId: String) {
        val socketManager = SocketManager.getInstance(context)
        val answerData = JSONObject().apply {
            put("type", "webrtc:answer")
            put("callAttemptId", callAttemptId)
            put("answer", JSONObject().apply {
                put("type", answer.type.canonicalForm())
                put("sdp", answer.description)
            })
            put("timestamp", System.currentTimeMillis())
        }
        
        socketManager.emit("webrtc:answer", answerData)
    }
    
    private fun sendIceCandidate(candidate: IceCandidate) {
        val socketManager = SocketManager.getInstance(context)
        val candidateData = JSONObject().apply {
            put("type", "webrtc:ice-candidate")
            put("candidate", JSONObject().apply {
                put("candidate", candidate.sdp)
                put("sdpMLineIndex", candidate.sdpMLineIndex)
                put("sdpMid", candidate.sdpMid)
            })
            put("timestamp", System.currentTimeMillis())
        }
        
        socketManager.emit("webrtc:ice-candidate", candidateData)
    }
    
    private fun sendCallFailed(callAttemptId: String, reason: String) {
        // Send call:failed for client-side failures (e.g., media_access_failed)
        // Note: connection_timeout failures are handled by signaling server
        val socketManager = SocketManager.getInstance(context)
        val failedData = JSONObject().apply {
            put("type", "call:failed")
            put("callAttemptId", callAttemptId)
            put("reason", reason)
            put("timestamp", System.currentTimeMillis())
        }
        
        socketManager.emit("call:failed", failedData)
    }
    
    private fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, 
            android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }
    
    private fun requestAudioFocus(): Boolean {
        return try {
            audioManager?.let { am ->
                val result = am.requestAudioFocus(
                    null,
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
                )
                result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            } ?: false
        } catch (e: Exception) {
            false
        }
    }
    
    fun cleanup() {
        // Release audio focus
        audioManager?.abandonAudioFocus(null)
        
        localAudioTrack?.dispose()
        localAudioSource?.dispose()
        peerConnection?.close()
        peerConnection?.dispose()
        factory?.dispose()
        
        localAudioTrack = null
        localAudioSource = null
        peerConnection = null
        factory = null
    }
}