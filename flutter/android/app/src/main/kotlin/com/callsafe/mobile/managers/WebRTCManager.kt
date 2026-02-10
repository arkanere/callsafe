package com.callsafe.mobile.managers

import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import androidx.core.content.ContextCompat
import org.webrtc.*
import com.callsafe.mobile.BuildConfig

class WebRTCManager(private val context: Context) {
    private var peerConnection: PeerConnection? = null
    private var localAudioTrack: AudioTrack? = null
    private var localAudioSource: AudioSource? = null
    private var factory: PeerConnectionFactory? = null
    private var audioManager: AudioManager? = null
    private var listener: WebRTCListener? = null
    private var signalListener: SignalingListener? = null
    private var callAttemptId: String? = null

    interface WebRTCListener {
        fun onConnectionEstablished()
        fun onConnectionFailed(error: String)
        fun onRemoteStreamReceived(stream: MediaStream)
    }

    /**
     * Interface for signaling events that need to go back to Flutter
     * Flutter will then send these through Socket.IO
     */
    interface SignalingListener {
        fun onAnswer(callAttemptId: String, sdpType: String, sdp: String)
        fun onIceCandidate(callAttemptId: String, candidate: String, sdpMLineIndex: Int, sdpMid: String)
    }

    private fun getIceServers(): List<PeerConnection.IceServer> {
        val iceServers = mutableListOf<PeerConnection.IceServer>()

        // Add STUN servers from BuildConfig
        iceServers.add(
            PeerConnection.IceServer.builder(BuildConfig.STUN_SERVER_1).createIceServer()
        )
        iceServers.add(
            PeerConnection.IceServer.builder(BuildConfig.STUN_SERVER_2).createIceServer()
        )

        // Add TURN server from BuildConfig if available (used as fallback)
        try {
            if (BuildConfig.TURN_SERVER_URL.isNotEmpty() &&
                BuildConfig.TURN_USERNAME.isNotEmpty() &&
                BuildConfig.TURN_CREDENTIAL.isNotEmpty()) {

                iceServers.add(
                    PeerConnection.IceServer.builder(BuildConfig.TURN_SERVER_URL)
                        .setUsername(BuildConfig.TURN_USERNAME)
                        .setPassword(BuildConfig.TURN_CREDENTIAL)
                        .createIceServer()
                )
                android.util.Log.d("WebRTCManager", "[ICE] TURN server configured as fallback")
            } else {
                android.util.Log.d("WebRTCManager", "[ICE] TURN server not configured - using STUN only")
            }
        } catch (e: Exception) {
            android.util.Log.w("WebRTCManager", "[ICE] Failed to configure TURN server: ${e.message}")
        }

        return iceServers
    }

    fun initialize(listener: WebRTCListener, signalListener: SignalingListener) {
        this.listener = listener
        this.signalListener = signalListener

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

        // Create peer connection with dynamic ICE servers and proper fallback configuration
        val iceServers = getIceServers()
        android.util.Log.d("WebRTCManager", "[ICE] Using ${iceServers.size} ICE servers")

        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            // Explicitly enable Unified Plan for modern WebRTC compatibility
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            // Allow both STUN and TURN, with STUN preferred (TURN as fallback)
            iceTransportsType = PeerConnection.IceTransportsType.ALL
            // Pre-gather ICE candidates for faster connection
            iceCandidatePoolSize = 10
        }

        peerConnection = factory?.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                android.util.Log.d("WebRTCManager", "[ICE] onIceCandidate() - Local candidate generated")
                android.util.Log.d("WebRTCManager", "[ICE] Local candidate SDP: ${candidate.sdp}")
                android.util.Log.d("WebRTCManager", "[ICE] Local candidate sdpMid: ${candidate.sdpMid}")
                android.util.Log.d("WebRTCManager", "[ICE] Local candidate sdpMLineIndex: ${candidate.sdpMLineIndex}")

                // Send ICE candidate back to Flutter through signaling listener
                callAttemptId?.let { id ->
                    signalListener?.onIceCandidate(
                        id,
                        candidate.sdp,
                        candidate.sdpMLineIndex,
                        candidate.sdpMid
                    )
                }
            }

            override fun onAddStream(stream: MediaStream) {
                // Legacy callback - should not be used with Unified Plan
                listener.onRemoteStreamReceived(stream)
            }

            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                android.util.Log.d("WebRTCManager", "[ICE] Connection state changed to: $state")
                when (state) {
                    PeerConnection.IceConnectionState.CONNECTED,
                    PeerConnection.IceConnectionState.COMPLETED -> {
                        listener.onConnectionEstablished()
                    }
                    PeerConnection.IceConnectionState.FAILED -> {
                        listener.onConnectionFailed("ICE connection failed")
                    }
                    else -> {}
                }
            }

            override fun onSignalingChange(state: PeerConnection.SignalingState) {
                android.util.Log.d("WebRTCManager", "[SIGNALING] State changed to: $state")
            }

            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {
                android.util.Log.d("WebRTCManager", "[ICE] Gathering state changed to: $state")
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

        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription) {}

            override fun onSetSuccess() {
                android.util.Log.d("WebRTCManager", "[SDP] Remote description (offer) set successfully")

                // Create answer
                peerConnection?.createAnswer(object : SdpObserver {
                    override fun onCreateSuccess(answer: SessionDescription) {
                        android.util.Log.d("WebRTCManager", "[SDP] Answer created successfully")

                        peerConnection?.setLocalDescription(object : SdpObserver {
                            override fun onCreateSuccess(description: SessionDescription) {}
                            override fun onSetSuccess() {
                                android.util.Log.d("WebRTCManager", "[SDP] Local description (answer) set successfully")

                                // Send answer back to Flutter through signaling listener
                                signalListener?.onAnswer(
                                    callAttemptId,
                                    answer.type.canonicalForm(),
                                    answer.description
                                )
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
        android.util.Log.d("WebRTCManager", "[ICE] addIceCandidate() called")
        try {
            peerConnection?.addIceCandidate(candidate)
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
