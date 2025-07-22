package com.callsafe.androidapp.webrtc

import android.content.Context
import android.media.AudioManager
import android.util.Log
import org.webrtc.*
import java.util.*

class WebRTCManager(private val context: Context) {
    
    companion object {
        private const val TAG = "WebRTCManager"
    }
    
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localAudioTrack: AudioTrack? = null
    private var audioSource: AudioSource? = null
    private var currentCallId: String? = null
    
    // Callbacks
    private var onIceCandidateListener: ((IceCandidate) -> Unit)? = null
    private var onConnectionStateChangeListener: ((PeerConnection.PeerConnectionState) -> Unit)? = null
    private var onRemoteAudioTrackListener: ((AudioTrack) -> Unit)? = null
    
    init {
        initializePeerConnectionFactory()
    }
    
    private fun initializePeerConnectionFactory() {
        Log.d(TAG, "🏭 Initializing PeerConnectionFactory")
        
        // Initialize WebRTC
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(true)
                .createInitializationOptions()
        )
        
        // Create factory - simplified for this WebRTC version
        val options = PeerConnectionFactory.Options()
        peerConnectionFactory = PeerConnectionFactory.builder()
            .setOptions(options)
            .createPeerConnectionFactory()
        
        Log.i(TAG, "✅ PeerConnectionFactory created successfully")
    }
    
    private fun createPeerConnection(): PeerConnection? {
        Log.d(TAG, "🔗 Creating PeerConnection")
        
        // ICE servers configuration - prioritize TURN relay for cellular connectivity
        val iceServers = listOf(
            // Primary TURN server (most reliable for cellular)
            PeerConnection.IceServer.builder("turn:a.relay.metered.ca:443")
                .setUsername("***REDACTED***")
                .setPassword("***REDACTED***")
                .createIceServer(),
            
            // Secondary TURN server with TCP fallback  
            PeerConnection.IceServer.builder("turn:a.relay.metered.ca:80")
                .setUsername("***REDACTED***")
                .setPassword("***REDACTED***")
                .createIceServer(),
                
            // STUN servers for SRFLX candidates
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer()
        )
        
        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            // Mobile-optimized configuration for cellular networks
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE  
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
            
            // Conservative candidate pool to ensure TURN allocation succeeds
            iceCandidatePoolSize = 2
            
            // Force RELAY mode for cellular to ensure TURN usage
            iceTransportsType = PeerConnection.IceTransportsType.RELAY
            
            // Mobile-specific optimizations
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        
        val observer = object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                Log.d(TAG, "🔄 Signaling state changed: $state")
            }
            
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                Log.d(TAG, "🧊 ICE connection state: $state")
                when (state) {
                    PeerConnection.IceConnectionState.CHECKING -> {
                        Log.i(TAG, "🔍 ICE connectivity checks started - testing candidate pairs")
                    }
                    PeerConnection.IceConnectionState.CONNECTED,
                    PeerConnection.IceConnectionState.COMPLETED -> {
                        Log.i(TAG, "✅ ICE connection established successfully")
                    }
                    PeerConnection.IceConnectionState.FAILED -> {
                        Log.e(TAG, "❌ ICE connection failed after connectivity checks")
                        Log.e(TAG, "🚨 This indicates no candidate pair could establish connection")
                        Log.e(TAG, "🔍 Common causes on cellular: Customer network blocking TURN server")
                        Log.e(TAG, "💡 Solution: Ensure customer can reach TURN relay at 188.245.177.56")
                    }
                    PeerConnection.IceConnectionState.DISCONNECTED -> {
                        Log.w(TAG, "⚠️ ICE connection disconnected - attempting reconnection")
                    }
                    else -> {
                        Log.d(TAG, "🔄 ICE connection state: $state")
                    }
                }
            }
            
            override fun onConnectionChange(state: PeerConnection.PeerConnectionState?) {
                Log.i(TAG, "🔌 Connection state changed: $state")
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        Log.i(TAG, "🔌 WebRTC connection state: CONNECTED")
                    }
                    PeerConnection.PeerConnectionState.CONNECTING -> {
                        Log.i(TAG, "🔌 WebRTC connection state: CONNECTING")
                    }
                    PeerConnection.PeerConnectionState.FAILED -> {
                        Log.w(TAG, "⚠️ WebRTC connection lost")
                    }
                    else -> {
                        Log.i(TAG, "🔌 WebRTC connection state: $state")
                    }
                }
                state?.let { onConnectionStateChangeListener?.invoke(it) }
            }
            
            override fun onIceConnectionReceivingChange(receiving: Boolean) {
                Log.d(TAG, "🧊 ICE connection receiving: $receiving")
            }
            
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                Log.d(TAG, "🧊 ICE gathering state: $state")
            }
            
            override fun onIceCandidate(candidate: IceCandidate?) {
                candidate?.let {
                    val candidateType = when {
                        it.sdp.contains("typ host") -> "HOST"
                        it.sdp.contains("typ srflx") -> "SRFLX (STUN)"
                        it.sdp.contains("typ relay") -> "RELAY (TURN)"
                        it.sdp.contains("typ prflx") -> "PRFLX"
                        else -> "UNKNOWN"
                    }
                    
                    // Enhanced logging for TURN candidates to diagnose allocation issues
                    if (candidateType == "RELAY (TURN)") {
                        val isValidRelay = !it.sdp.contains("raddr 0.0.0.0") && !it.sdp.contains("rport 0")
                        Log.i(TAG, "🧊 Generated ICE candidate [$candidateType] - Valid: $isValidRelay")
                        Log.d(TAG, "🧊 RELAY details: ${it.sdp}")
                        if (!isValidRelay) {
                            Log.w(TAG, "⚠️ Invalid RELAY candidate detected - TURN allocation may have failed")
                        }
                    } else {
                        Log.d(TAG, "🧊 Generated ICE candidate [$candidateType]: ${it.sdp}")
                    }
                    
                    onIceCandidateListener?.invoke(it)
                }
            }
            
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {
                Log.d(TAG, "🧊 ICE candidates removed: ${candidates?.size}")
            }
            
            override fun onTrack(transceiver: RtpTransceiver?) {
                Log.i(TAG, "📡 Remote track received")
                transceiver?.receiver?.track()?.let { track ->
                    if (track is AudioTrack) {
                        Log.i(TAG, "🔊 Remote audio track received")
                        onRemoteAudioTrackListener?.invoke(track)
                    }
                }
            }
            
            override fun onAddStream(stream: MediaStream?) {
                Log.i(TAG, "📡 Remote stream added (legacy callback)")
                stream?.audioTracks?.firstOrNull()?.let { audioTrack ->
                    Log.i(TAG, "🔊 Remote audio track received via legacy stream")
                    onRemoteAudioTrackListener?.invoke(audioTrack)
                }
            }
            
            override fun onRemoveStream(stream: MediaStream?) {
                Log.i(TAG, "📡 Remote stream removed")
            }
            
            override fun onDataChannel(dataChannel: DataChannel?) {
                Log.d(TAG, "📊 Data channel: $dataChannel")
            }
            
            override fun onRenegotiationNeeded() {
                Log.d(TAG, "🔄 Renegotiation needed")
            }
        }
        
        return peerConnectionFactory?.createPeerConnection(rtcConfig, observer)
    }
    
    private fun createLocalAudioTrack(): AudioTrack? {
        Log.d(TAG, "🎤 Creating local audio track")
        
        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googHighpassFilter", "true"))
        }
        
        audioSource = peerConnectionFactory?.createAudioSource(audioConstraints)
        return audioSource?.let { source ->
            peerConnectionFactory?.createAudioTrack("AndroidAgentAudioTrack", source)
        }
    }
    
    // Public API - matches website WebRTCManager interface
    
    fun createAnswer(callId: String, offer: SessionDescription): SessionDescription? {
        Log.i(TAG, "📥 Creating answer for callId: $callId")
        currentCallId = callId
        
        try {
            // Create peer connection
            peerConnection = createPeerConnection()
            if (peerConnection == null) {
                Log.e(TAG, "❌ Failed to create PeerConnection")
                return null
            }
            
            // Create and add local audio track (using modern addTrack API)
            localAudioTrack = createLocalAudioTrack()
            localAudioTrack?.let { audioTrack ->
                // Use addTrack instead of addStream for Unified Plan compatibility
                peerConnection?.addTrack(audioTrack, listOf("AndroidAgentStream"))
                Log.i(TAG, "✅ Local audio track added to peer connection using addTrack")
            }
            
            // Set remote description (customer's offer)
            val setRemoteDescriptionObserver = object : SdpObserver {
                override fun onCreateSuccess(description: SessionDescription?) {}
                override fun onSetSuccess() {
                    Log.d(TAG, "✅ Remote description set successfully")
                    createAnswerInternal()
                }
                override fun onCreateFailure(error: String?) {
                    Log.e(TAG, "❌ Failed to set remote description: $error")
                }
                override fun onSetFailure(error: String?) {
                    Log.e(TAG, "❌ Failed to set remote description: $error")
                }
            }
            
            peerConnection?.setRemoteDescription(setRemoteDescriptionObserver, offer)
            
            return null // Answer will be created asynchronously
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception creating answer", e)
            return null
        }
    }
    
    private fun createAnswerInternal() {
        val answerConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
        }
        
        val createAnswerObserver = object : SdpObserver {
            override fun onCreateSuccess(answer: SessionDescription?) {
                answer?.let {
                    Log.i(TAG, "✅ Answer created successfully")
                    setLocalDescriptionAndSend(it)
                }
            }
            
            override fun onSetSuccess() {}
            
            override fun onCreateFailure(error: String?) {
                Log.e(TAG, "❌ Failed to create answer: $error")
            }
            
            override fun onSetFailure(error: String?) {
                Log.e(TAG, "❌ Failed to set local description: $error")
            }
        }
        
        peerConnection?.createAnswer(createAnswerObserver, answerConstraints)
    }
    
    private fun setLocalDescriptionAndSend(answer: SessionDescription) {
        val setLocalDescriptionObserver = object : SdpObserver {
            override fun onSetSuccess() {
                Log.i(TAG, "✅ Local description (answer) set successfully")
                // Notify that answer is ready
                onAnswerCreatedListener?.invoke(answer)
            }
            
            override fun onCreateSuccess(description: SessionDescription?) {}
            override fun onCreateFailure(error: String?) {}
            override fun onSetFailure(error: String?) {
                Log.e(TAG, "❌ Failed to set local description: $error")
            }
        }
        
        peerConnection?.setLocalDescription(setLocalDescriptionObserver, answer)
    }
    
    fun addIceCandidate(candidate: IceCandidate) {
        Log.d(TAG, "🧊 Adding remote ICE candidate: ${candidate.sdp}")
        
        peerConnection?.let { pc ->
            try {
                val success = pc.addIceCandidate(candidate)
                if (success) {
                    Log.d(TAG, "✅ ICE candidate added successfully")
                } else {
                    Log.e(TAG, "❌ Failed to add ICE candidate")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Exception adding ICE candidate", e)
            }
        } ?: Log.w(TAG, "⚠️ Cannot add ICE candidate - peer connection is null")
    }
    
    fun endCall() {
        Log.d(TAG, "🔚 Ending WebRTC call")
        
        localAudioTrack?.dispose()
        localAudioTrack = null
        
        audioSource?.dispose()
        audioSource = null
        
        peerConnection?.close()
        peerConnection = null
        
        currentCallId = null
        
        Log.i(TAG, "✅ WebRTC call ended and resources cleaned up")
    }
    
    fun setMuted(muted: Boolean) {
        localAudioTrack?.setEnabled(!muted)
        Log.d(TAG, "🔇 Audio ${if (muted) "muted" else "unmuted"}")
    }
    
    fun setSpeakerEnabled(enabled: Boolean) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.isSpeakerphoneOn = enabled
        Log.d(TAG, "📢 Speaker ${if (enabled) "enabled" else "disabled"}")
    }
    
    // Callback setters
    private var onAnswerCreatedListener: ((SessionDescription) -> Unit)? = null
    
    fun setOnAnswerCreatedListener(listener: (SessionDescription) -> Unit) {
        onAnswerCreatedListener = listener
    }
    
    fun setOnIceCandidateListener(listener: (IceCandidate) -> Unit) {
        onIceCandidateListener = listener
    }
    
    fun setOnConnectionStateChangeListener(listener: (PeerConnection.PeerConnectionState) -> Unit) {
        onConnectionStateChangeListener = listener
    }
    
    fun setOnRemoteAudioTrackListener(listener: (AudioTrack) -> Unit) {
        onRemoteAudioTrackListener = listener
    }
    
    // Cleanup
    fun dispose() {
        Log.d(TAG, "🧹 Disposing WebRTCManager")
        endCall()
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
    }
}