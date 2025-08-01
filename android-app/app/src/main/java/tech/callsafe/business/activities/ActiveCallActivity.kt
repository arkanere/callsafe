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
        
        // Keep screen on during call
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        binding = ActivityActiveCallBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        callAttemptId = intent.getStringExtra("callAttemptId")
        sourceId = intent.getStringExtra("sourceId")
        
        webRTCManager = WebRTCManager(this)
        callManager = CallManager.getInstance(this)
        socketManager = SocketManager.getInstance(this)
        
        setupUI()
        setupWebRTC()
        setupWebRTCEventHandling()
        setupClickListeners()
        startCallTimer()
    }
    
    private fun setupUI() {
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
        webRTCManager.initialize(object : WebRTCManager.WebRTCListener {
            override fun onConnectionEstablished() {
                runOnUiThread {
                    binding.callStatus.text = "Connected"
                    callStartTime = System.currentTimeMillis()
                }
            }
            
            override fun onConnectionFailed(error: String) {
                runOnUiThread {
                    binding.callStatus.text = "Connection failed"
                    // Auto-end call after failure
                    Handler(Looper.getMainLooper()).postDelayed({
                        endCall()
                    }, 2000)
                }
            }
            
            override fun onRemoteStreamReceived(stream: MediaStream) {
                // Audio stream received - connection established
                runOnUiThread {
                    binding.callStatus.text = "Call active"
                }
            }
        })
    }
    
    private fun setupWebRTCEventHandling() {
        // Register for WebRTC events from SocketManager
        socketManager.setWebRTCEventListener(object : SocketManager.WebRTCEventListener {
            override fun onWebRTCOffer(callAttemptId: String, offer: SessionDescription) {
                // Only handle offers for our current call
                if (callAttemptId == this@ActiveCallActivity.callAttemptId) {
                    runOnUiThread {
                        webRTCManager.createAnswer(offer, callAttemptId)
                    }
                }
            }
            
            override fun onWebRTCIceCandidate(callAttemptId: String, candidate: IceCandidate) {
                // Only handle ICE candidates for our current call
                if (callAttemptId == this@ActiveCallActivity.callAttemptId) {
                    runOnUiThread {
                        webRTCManager.addIceCandidate(candidate)
                    }
                }
            }
        })
    }
    
    private fun setupClickListeners() {
        binding.muteButton.setOnClickListener {
            toggleMute()
        }
        
        binding.speakerButton.setOnClickListener {
            toggleSpeaker()
        }
        
        binding.endCallButton.setOnClickListener {
            endCall()
        }
    }
    
    private fun toggleMute() {
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
        callAttemptId?.let { id ->
            callManager.endCall(
                callAttemptId = id,
                initiator = "business",
                reason = "user_action"
            )
        }
        
        cleanup()
        finish()
    }
    
    private fun startCallTimer() {
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
        callTimer?.cancel()
        callTimer = null
        webRTCManager.cleanup()
        socketManager.setWebRTCEventListener(null) // Unregister WebRTC event listener
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    
    override fun onDestroy() {
        super.onDestroy()
        cleanup()
    }
}