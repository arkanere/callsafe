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
    private var callAttemptId: String? = null
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
        
        // Create peer connection with Unified Plan
        val rtcConfig = PeerConnection.RTCConfiguration(
            listOf(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
                PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer()
            )
        ).apply {
            // Explicitly enable Unified Plan for modern WebRTC compatibility
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }
        
        peerConnection = factory?.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                android.util.Log.d("WebRTCManager", "[ICE] onIceCandidate() - Local candidate generated")
                android.util.Log.d("WebRTCManager", "[ICE] Local candidate SDP: ${candidate.sdp}")
                android.util.Log.d("WebRTCManager", "[ICE] Local candidate sdpMid: ${candidate.sdpMid}")
                android.util.Log.d("WebRTCManager", "[ICE] Local candidate sdpMLineIndex: ${candidate.sdpMLineIndex}")
                sendIceCandidate(candidate)
                android.util.Log.d("WebRTCManager", "[ICE] Local candidate sent to server")
            }
            
            override fun onAddStream(stream: MediaStream) {
                // Legacy callback - should not be used with Unified Plan
                listener.onRemoteStreamReceived(stream)
            }
            
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                android.util.Log.d("WebRTCManager", "[ICE] Connection state changed to: $state")
                android.util.Log.d("WebRTCManager", "[ICE] Current signaling state: ${peerConnection?.signalingState()}")
                android.util.Log.d("WebRTCManager", "[ICE] Current connection state: ${peerConnection?.connectionState()}")
                when (state) {
                    PeerConnection.IceConnectionState.NEW -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Connection state: NEW - ICE agent is gathering addresses")
                    }
                    PeerConnection.IceConnectionState.CHECKING -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Connection state: CHECKING - ICE agent has received remote candidates and is checking pairs")
                    }
                    PeerConnection.IceConnectionState.CONNECTED -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Connection state: CONNECTED - ICE agent has found a usable connection")
                        listener.onConnectionEstablished()
                    }
                    PeerConnection.IceConnectionState.COMPLETED -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Connection state: COMPLETED - ICE agent has finished gathering candidates")
                        listener.onConnectionEstablished()
                    }
                    PeerConnection.IceConnectionState.FAILED -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Connection state: FAILED - ICE agent failed to find a usable connection")
                        android.util.Log.d("WebRTCManager", "[ICE] This usually means candidates couldn't establish connectivity")
                        listener.onConnectionFailed("ICE connection failed")
                    }
                    PeerConnection.IceConnectionState.DISCONNECTED -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Connection state: DISCONNECTED - ICE agent has lost connectivity")
                    }
                    PeerConnection.IceConnectionState.CLOSED -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Connection state: CLOSED - ICE agent has shut down")
                    }
                    else -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Connection state: $state")
                    }
                }
            }
            
            override fun onSignalingChange(state: PeerConnection.SignalingState) {
                android.util.Log.d("WebRTCManager", "[SIGNALING] State changed to: $state")
            }
            
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
                android.util.Log.d("WebRTCManager", "[ICE] Gathering state changed to: $state")
                when (state) {
                    PeerConnection.IceGatheringState.NEW -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Gathering: NEW - ICE agent has not started gathering")
                    }
                    PeerConnection.IceGatheringState.GATHERING -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Gathering: GATHERING - ICE agent is gathering candidates")
                    }
                    PeerConnection.IceGatheringState.COMPLETE -> {
                        android.util.Log.d("WebRTCManager", "[ICE] Gathering: COMPLETE - ICE agent has finished gathering candidates")
                    }
                }
            }
            override fun onRemoveStream(stream: MediaStream) {}
            override fun onDataChannel(channel: DataChannel) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: RtpReceiver, streams: Array<MediaStream>) {
                // Modern Unified Plan callback for receiving remote tracks
                if (streams.isNotEmpty()) {
                    listener.onRemoteStreamReceived(streams[0])
                }
            }
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceCandidatesRemoved(candidates: Array<IceCandidate>) {}
        })
        
        // Setup audio manager first
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        
        // Create local audio stream
        createLocalAudioStream()
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
        
        // Use addTrack instead of addStream for Unified Plan compatibility
        localAudioTrack?.let { track ->
            peerConnection?.addTrack(track, listOf("local_stream"))
        }
    }
    
    fun createAnswer(offer: SessionDescription, callAttemptId: String) {
        this.callAttemptId = callAttemptId
        android.util.Log.d("WebRTCManager", "[SDP] Starting createAnswer process")
        android.util.Log.d("WebRTCManager", "[SDP] Setting remote description (offer)")
        
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {}
            
            override fun onSetSuccess() {
                android.util.Log.d("WebRTCManager", "[SDP] Remote description (offer) set successfully")
                android.util.Log.d("WebRTCManager", "[SDP] Creating answer")
                
                // Create answer
                peerConnection?.createAnswer(object : SdpObserver {
                    override fun onCreateSuccess(answer: SessionDescription) {
                        android.util.Log.d("WebRTCManager", "[SDP] Answer created successfully")
                        android.util.Log.d("WebRTCManager", "[SDP] Setting local description (answer)")
                        
                        peerConnection?.setLocalDescription(object : SdpObserver {
                            override fun onCreateSuccess(description: SessionDescription) {}
                            override fun onSetSuccess() {
                                android.util.Log.d("WebRTCManager", "[SDP] Local description (answer) set successfully")
                                android.util.Log.d("WebRTCManager", "[SDP] Sending answer to server")
                                sendWebRTCAnswer(answer, callAttemptId)
                                android.util.Log.d("WebRTCManager", "[SDP] Answer sent - offer/answer exchange complete")
                                // Note: Connection timeout handled by signaling server
                            }
                            override fun onCreateFailure(error: String) {
                                android.util.Log.e("WebRTCManager", "[SDP] Failed to create local description: $error")
                                listener?.onConnectionFailed("Failed to set local description: $error")
                            }
                            override fun onSetFailure(error: String) {
                                android.util.Log.e("WebRTCManager", "[SDP] Failed to set local description: $error")
                                listener?.onConnectionFailed("Failed to set local description: $error")
                            }
                        }, answer)
                    }
                    
                    override fun onCreateFailure(error: String) {
                        android.util.Log.e("WebRTCManager", "[SDP] Failed to create answer: $error")
                        listener?.onConnectionFailed("Failed to create answer: $error")
                    }
                    
                    override fun onSetSuccess() {}
                    override fun onSetFailure(error: String) {}
                }, MediaConstraints())
            }
            
            override fun onCreateFailure(error: String) {
                android.util.Log.e("WebRTCManager", "[SDP] Failed to create remote description: $error")
                listener?.onConnectionFailed("Failed to set remote description: $error")
            }
            
            override fun onSetFailure(error: String) {
                android.util.Log.e("WebRTCManager", "[SDP] Failed to set remote description: $error")
                listener?.onConnectionFailed("Failed to set remote description: $error")
            }
        }, offer)
    }
    
    fun addIceCandidate(candidate: IceCandidate) {
        android.util.Log.d("WebRTCManager", "[ICE] addIceCandidate() called")
        android.util.Log.d("WebRTCManager", "[ICE] Candidate SDP: ${candidate.sdp}")
        android.util.Log.d("WebRTCManager", "[ICE] Candidate sdpMid: ${candidate.sdpMid}")
        android.util.Log.d("WebRTCManager", "[ICE] Candidate sdpMLineIndex: ${candidate.sdpMLineIndex}")
        
        try {
            android.util.Log.d("WebRTCManager", "[ICE] PeerConnection state before adding candidate: ${peerConnection?.signalingState()}")
            android.util.Log.d("WebRTCManager", "[ICE] PeerConnection ice connection state: ${peerConnection?.iceConnectionState()}")
            android.util.Log.d("WebRTCManager", "[ICE] PeerConnection gathering state: ${peerConnection?.iceGatheringState()}")
            
            val result = peerConnection?.addIceCandidate(candidate)
            android.util.Log.d("WebRTCManager", "[ICE] addIceCandidate result: $result")
            
            android.util.Log.d("WebRTCManager", "[ICE] PeerConnection state after adding candidate: ${peerConnection?.signalingState()}")
            android.util.Log.d("WebRTCManager", "[ICE] PeerConnection ice connection state after: ${peerConnection?.iceConnectionState()}")
            android.util.Log.d("WebRTCManager", "[ICE] Successfully added ICE candidate")
        } catch (e: Exception) {
            android.util.Log.e("WebRTCManager", "[ICE] Error adding ICE candidate: ${e.message}", e)
        }
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
            put("callAttemptId", callAttemptId)
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