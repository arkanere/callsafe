package tech.callsafe.business.activities

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import org.webrtc.IceCandidate
import org.webrtc.MediaStream
import org.webrtc.SessionDescription
import tech.callsafe.business.R
import tech.callsafe.business.databinding.ActivityActiveCallBinding
import tech.callsafe.business.managers.CallManager
import tech.callsafe.business.managers.SocketManager
import tech.callsafe.business.managers.WebRTCManager
import java.util.*

class ActiveCallActivity : AppCompatActivity() {
    private lateinit var binding: ActivityActiveCallBinding
    private lateinit var webRTCManager: WebRTCManager
    private lateinit var callManager: CallManager
    private lateinit var socketManager: SocketManager
    
    private var callAttemptId: String? = null
    private var sourceId: String? = null
    private var callStartTime: Long = 0
    private var callTimer: Timer? = null
    private var isMuted = false
    private var isSpeakerOn = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        android.util.Log.d("ActiveCallActivity", "[FLOW] onCreate() - ActiveCallActivity started for active call")
        
        // Keep screen on during call
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        binding = ActivityActiveCallBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        callAttemptId = intent.getStringExtra("callAttemptId")
        sourceId = intent.getStringExtra("sourceId")
        android.util.Log.d("ActiveCallActivity", "[FLOW] onCreate() - Call data: callAttemptId=$callAttemptId, sourceId=$sourceId")
        
        webRTCManager = WebRTCManager(this)
        callManager = CallManager.getInstance(this)
        socketManager = SocketManager.getInstance(this)
        
        android.util.Log.d("ActiveCallActivity", "[FLOW] onCreate() - Calling setupUI()")
        setupUI()
        android.util.Log.d("ActiveCallActivity", "[FLOW] onCreate() - Calling setupWebRTC()")
        setupWebRTC()
        android.util.Log.d("ActiveCallActivity", "[FLOW] onCreate() - Calling setupWebRTCEventHandling()")
        setupWebRTCEventHandling()
        android.util.Log.d("ActiveCallActivity", "[FLOW] onCreate() - Calling setupClickListeners()")
        setupClickListeners()
        android.util.Log.d("ActiveCallActivity", "[FLOW] onCreate() - Calling startCallTimer()")
        startCallTimer()
    }
    
    private fun setupUI() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] setupUI() - Setting up active call UI")
        binding.apply {
            callerInfo.text = "Connected to customer from $sourceId"
            callStatus.text = "Connecting..."
            callDuration.text = "00:00"
            
            // Initialize button states
            muteButton.setImageResource(R.drawable.ic_mic_on)
            speakerButton.setImageResource(R.drawable.ic_speaker_off)
            endCallButton.setImageResource(R.drawable.ic_call_end)
        }
    }
    
    private fun setupWebRTC() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] setupWebRTC() - Initializing WebRTC manager")
        webRTCManager.initialize(object : WebRTCManager.WebRTCListener {
            override fun onConnectionEstablished() {
                android.util.Log.d("ActiveCallActivity", "[FLOW] onConnectionEstablished() - WebRTC connection successful")
                runOnUiThread {
                    binding.callStatus.text = "Connected"
                    callStartTime = System.currentTimeMillis()
                }
            }
            
            override fun onConnectionFailed(error: String) {
                android.util.Log.d("ActiveCallActivity", "[FLOW] onConnectionFailed() - WebRTC connection failed: $error")
                runOnUiThread {
                    binding.callStatus.text = "Connection failed"
                    // Auto-end call after failure
                    Handler(Looper.getMainLooper()).postDelayed({
                        endCall()
                    }, 2000)
                }
            }
            
            override fun onRemoteStreamReceived(stream: MediaStream) {
                android.util.Log.d("ActiveCallActivity", "[FLOW] onRemoteStreamReceived() - Remote audio stream received")
                // Audio stream received - connection established
                runOnUiThread {
                    binding.callStatus.text = "Call active"
                }
            }
        })
    }
    
    private fun setupWebRTCEventHandling() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] setupWebRTCEventHandling() - Registering for WebRTC socket events")
        // Register for WebRTC events from SocketManager
        socketManager.setWebRTCEventListener(object : SocketManager.WebRTCEventListener {
            override fun onWebRTCOffer(callAttemptId: String, offer: SessionDescription) {
                android.util.Log.d("ActiveCallActivity", "[FLOW] onWebRTCOffer() - Received WebRTC offer from server")
                // Only handle offers for our current call
                if (callAttemptId == this@ActiveCallActivity.callAttemptId) {
                    android.util.Log.d("ActiveCallActivity", "[FLOW] onWebRTCOffer() - Calling WebRTCManager.createAnswer()")
                    runOnUiThread {
                        webRTCManager.createAnswer(offer, callAttemptId)
                    }
                }
            }
            
            override fun onWebRTCIceCandidate(callAttemptId: String, candidate: IceCandidate) {
                android.util.Log.d("ActiveCallActivity", "[ICE] onWebRTCIceCandidate() - ENTRY POINT")
                android.util.Log.d("ActiveCallActivity", "[ICE] Received ICE candidate from server")
                android.util.Log.d("ActiveCallActivity", "[ICE] callAttemptId from server: $callAttemptId")
                android.util.Log.d("ActiveCallActivity", "[ICE] this.callAttemptId: ${this@ActiveCallActivity.callAttemptId}")
                android.util.Log.d("ActiveCallActivity", "[ICE] Candidate SDP: ${candidate.sdp}")
                android.util.Log.d("ActiveCallActivity", "[ICE] Candidate sdpMid: ${candidate.sdpMid}")
                android.util.Log.d("ActiveCallActivity", "[ICE] Candidate sdpMLineIndex: ${candidate.sdpMLineIndex}")
                
                // Only handle ICE candidates for our current call
                if (callAttemptId == this@ActiveCallActivity.callAttemptId) {
                    android.util.Log.d("ActiveCallActivity", "[ICE] CallAttemptId matches - processing candidate")
                    android.util.Log.d("ActiveCallActivity", "[ICE] Calling runOnUiThread to add candidate")
                    runOnUiThread {
                        android.util.Log.d("ActiveCallActivity", "[ICE] Inside UI thread - calling WebRTCManager.addIceCandidate()")
                        try {
                            webRTCManager.addIceCandidate(candidate)
                            android.util.Log.d("ActiveCallActivity", "[ICE] Successfully called WebRTCManager.addIceCandidate()")
                        } catch (e: Exception) {
                            android.util.Log.e("ActiveCallActivity", "[ICE] Error calling WebRTCManager.addIceCandidate(): ${e.message}", e)
                        }
                    }
                } else {
                    android.util.Log.w("ActiveCallActivity", "[ICE] CallAttemptId MISMATCH - ignoring candidate")
                    android.util.Log.w("ActiveCallActivity", "[ICE] Expected: ${this@ActiveCallActivity.callAttemptId}")
                    android.util.Log.w("ActiveCallActivity", "[ICE] Received: $callAttemptId")
                }
                
                android.util.Log.d("ActiveCallActivity", "[ICE] onWebRTCIceCandidate() - EXIT POINT")
            }
        })
    }
    
    private fun setupClickListeners() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] setupClickListeners() - Setting up call control buttons")
        binding.muteButton.setOnClickListener {
            android.util.Log.d("ActiveCallActivity", "[FLOW] Mute button clicked - Calling toggleMute()")
            toggleMute()
        }
        
        binding.speakerButton.setOnClickListener {
            android.util.Log.d("ActiveCallActivity", "[FLOW] Speaker button clicked - Calling toggleSpeaker()")
            toggleSpeaker()
        }
        
        binding.endCallButton.setOnClickListener {
            android.util.Log.d("ActiveCallActivity", "[FLOW] End call button clicked - Calling endCall()")
            endCall()
        }
    }
    
    private fun toggleMute() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] toggleMute() - Toggling microphone: isMuted will be ${!isMuted}")
        isMuted = !isMuted
        webRTCManager.setMicrophoneEnabled(!isMuted)
        
        binding.muteButton.setImageResource(
            if (isMuted) R.drawable.ic_mic_off else R.drawable.ic_mic_on
        )
        
        // Visual feedback
        binding.muteButton.animate()
            .scaleX(0.8f).scaleY(0.8f)
            .setDuration(100)
            .withEndAction {
                binding.muteButton.animate()
                    .scaleX(1.0f).scaleY(1.0f)
                    .setDuration(100)
                    .start()
            }
            .start()
    }
    
    private fun toggleSpeaker() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] toggleSpeaker() - Toggling speaker: isSpeakerOn will be ${!isSpeakerOn}")
        isSpeakerOn = !isSpeakerOn
        webRTCManager.setSpeakerEnabled(isSpeakerOn)
        
        binding.speakerButton.setImageResource(
            if (isSpeakerOn) R.drawable.ic_speaker_on else R.drawable.ic_speaker_off
        )
        
        // Visual feedback
        binding.speakerButton.animate()
            .scaleX(0.8f).scaleY(0.8f)
            .setDuration(100)
            .withEndAction {
                binding.speakerButton.animate()
                    .scaleX(1.0f).scaleY(1.0f)
                    .setDuration(100)
                    .start()
            }
            .start()
    }
    
    private fun endCall() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] endCall() - User initiated call termination")
        callAttemptId?.let { id ->
            android.util.Log.d("ActiveCallActivity", "[FLOW] endCall() - Calling CallManager.endCall()")
            callManager.endCall(
                callAttemptId = id,
                initiator = "business",
                reason = "user_action"
            )
        }
        
        android.util.Log.d("ActiveCallActivity", "[FLOW] endCall() - Calling cleanup() and finishing activity")
        cleanup()
        finish()
    }
    
    private fun startCallTimer() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] startCallTimer() - Starting call duration timer")
        callTimer = Timer()
        callTimer?.scheduleAtFixedRate(object : TimerTask() {
            override fun run() {
                if (callStartTime > 0) {
                    val duration = (System.currentTimeMillis() - callStartTime) / 1000
                    val minutes = duration / 60
                    val seconds = duration % 60
                    
                    runOnUiThread {
                        binding.callDuration.text = String.format("%02d:%02d", minutes, seconds)
                    }
                }
            }
        }, 0, 1000)
    }
    
    private fun cleanup() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] cleanup() - Cleaning up call resources")
        callTimer?.cancel()
        callTimer = null
        webRTCManager.cleanup()
        socketManager.setWebRTCEventListener(null) // Unregister WebRTC event listener
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    
    override fun onDestroy() {
        super.onDestroy()
        android.util.Log.d("ActiveCallActivity", "[FLOW] onDestroy() - ActiveCallActivity destroyed")
        cleanup()
    }
}