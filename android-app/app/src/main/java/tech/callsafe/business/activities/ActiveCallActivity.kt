package tech.callsafe.business.activities

import android.content.Context
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
    
    init {
        android.util.Log.d("ActiveCallActivity", "[CONSTRUCTOR] ActiveCallActivity instance created")
    }
    
    private var callAttemptId: String? = null
    private var sourceId: String? = null
    private var callStartTime: Long = 0
    private var callTimer: Timer? = null
    private var isMuted = false
    private var isSpeakerOn = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] ==================== ACTIVITY STARTING ====================")
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - ENTRY POINT - ActiveCallActivity onCreate called")
        
        try {
            super.onCreate(savedInstanceState)
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - super.onCreate() completed successfully")
        } catch (e: Exception) {
            android.util.Log.e("ActiveCallActivity", "[ACTIVITY] onCreate() - CRITICAL ERROR in super.onCreate()", e)
            return
        }
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Task ID: ${taskId}, Intent: ${intent}")
        
        // Keep screen on during call
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Setting window flags")
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Inflating layout")
        try {
            binding = ActivityActiveCallBinding.inflate(layoutInflater)
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Layout inflated successfully")
            setContentView(binding.root)
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Content view set successfully")
        } catch (e: Exception) {
            android.util.Log.e("ActiveCallActivity", "[ACTIVITY] onCreate() - ERROR during layout inflation/setup", e)
            finish()
            return
        }
        
        callAttemptId = intent.getStringExtra("callAttemptId")
        sourceId = intent.getStringExtra("sourceId")
        val autoAccept = intent.getBooleanExtra("autoAccept", false)
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Call data: callAttemptId=$callAttemptId, sourceId=$sourceId, autoAccept=$autoAccept")
        
        if (callAttemptId == null) {
            android.util.Log.e("ActiveCallActivity", "[ACTIVITY] onCreate() - ERROR: callAttemptId is null, finishing activity")
            finish()
            return
        }
        
        try {
            webRTCManager = WebRTCManager(this)
            callManager = CallManager.getInstance(this)
            socketManager = SocketManager.getInstance(this)
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - All managers initialized successfully")
        } catch (e: Exception) {
            android.util.Log.e("ActiveCallActivity", "[ACTIVITY] onCreate() - ERROR: Failed to initialize managers", e)
            finish()
            return
        }
        
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Initializing managers and UI")
        try {
            setupUI()
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - UI setup completed")
            
            setupWebRTC()
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - WebRTC setup completed")
            
            setupWebRTCEventHandling()
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - WebRTC event handling setup completed")
            
            setupClickListeners()
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Click listeners setup completed")
            
            startCallTimer()
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Call timer started, initialization complete")
            
            // Handle auto-accept if launched directly from notification (WhatsApp style)
            if (autoAccept && callAttemptId != null) {
                android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onCreate() - Auto-accepting call from full-screen intent")
                acceptIncomingCall(callAttemptId!!)
            }
        } catch (e: Exception) {
            android.util.Log.e("ActiveCallActivity", "[ACTIVITY] onCreate() - ERROR during initialization", e)
            binding.callStatus.text = "Initialization failed: ${e.message}"
            
            // Don't finish immediately, let user see the error and manually end call
            Handler(Looper.getMainLooper()).postDelayed({
                if (!isFinishing) {
                    finish()
                }
            }, 3000)
        }
    }
    
    private fun setupUI() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] setupUI() - Setting up active call UI")
        binding.apply {
            callerInfo.text = if (sourceId != null) {
                "Connected to customer from $sourceId"
            } else {
                "Connected to customer"
            }
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
    
    private fun acceptIncomingCall(callAttemptId: String) {
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - ENTRY POINT - Auto-accepting call from notification")
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - callAttemptId: $callAttemptId")
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - sourceId: $sourceId")
        
        // Register this call with SocketManager for call history tracking
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - Registering call with SocketManager")
        sourceId?.let { sourceIdValue ->
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - Calling SocketManager.registerIncomingCall()")
            socketManager.registerIncomingCall(callAttemptId, sourceIdValue)
            android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - Call registered with SocketManager successfully")
        } ?: run {
            android.util.Log.w("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - WARNING: sourceId is null, cannot register call")
        }
        
        // Stop ringtone if playing
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - Stopping ringtone")
        tech.callsafe.business.utils.RingtoneManager.getInstance(this).stopRingtone()
        
        // Cancel the notification
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - Cancelling notification")
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        notificationManager.cancel(callAttemptId.hashCode())
        
        // Ensure socket connection before accepting call
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - Ensuring socket connection")
        ensureSocketConnectionAndAccept(callAttemptId)
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] acceptIncomingCall() - EXIT POINT")
    }
    
    private fun ensureSocketConnectionAndAccept(callAttemptId: String) {
        android.util.Log.d("ActiveCallActivity", "[SOCKET] ensureSocketConnectionAndAccept() - Checking socket connection")
        
        // Try to connect SocketManager if not already connected
        if (!socketManager.connect()) {
            android.util.Log.e("ActiveCallActivity", "[SOCKET] Failed to initialize socket connection")
            binding.callStatus.text = "Connection failed"
            Handler(Looper.getMainLooper()).postDelayed({ endCall() }, 3000)
            return
        }
        
        // Wait for socket connection with timeout
        var retryCount = 0
        val maxRetries = 10 // 5 seconds total
        
        val connectionChecker = object : Runnable {
            override fun run() {
                android.util.Log.d("ActiveCallActivity", "[SOCKET] Connection check attempt ${retryCount + 1}/$maxRetries")
                
                if (socketManager.isConnected()) {
                    android.util.Log.d("ActiveCallActivity", "[SOCKET] Socket connected - accepting call")
                    // Socket is connected, now accept the call
                    callManager.acceptCall(
                        callAttemptId = callAttemptId,
                        deviceType = "mobile",
                        deviceId = tech.callsafe.business.utils.getUniqueDeviceId(this@ActiveCallActivity)
                    )
                    android.util.Log.d("ActiveCallActivity", "[FLOW] acceptIncomingCall() - Call acceptance completed")
                    
                } else if (retryCount < maxRetries) {
                    // Retry after 500ms
                    retryCount++
                    android.util.Log.d("ActiveCallActivity", "[SOCKET] Socket not connected yet, retrying in 500ms")
                    Handler(Looper.getMainLooper()).postDelayed(this, 500)
                    
                } else {
                    // Connection timeout
                    android.util.Log.e("ActiveCallActivity", "[SOCKET] Socket connection timeout - ending call")
                    binding.callStatus.text = "Connection timeout"
                    Handler(Looper.getMainLooper()).postDelayed({ endCall() }, 2000)
                }
            }
        }
        
        // Start checking connection immediately
        connectionChecker.run()
    }
    
    private fun cleanup() {
        android.util.Log.d("ActiveCallActivity", "[FLOW] cleanup() - Cleaning up call resources")
        callTimer?.cancel()
        callTimer = null
        webRTCManager.cleanup()
        socketManager.setWebRTCEventListener(null) // Unregister WebRTC event listener
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    
    override fun onStart() {
        super.onStart()
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onStart() - Activity becoming visible")
    }
    
    override fun onResume() {
        super.onResume()
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onResume() - Activity in foreground")
    }
    
    override fun onPause() {
        super.onPause()
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onPause() - Activity paused")
    }
    
    override fun onStop() {
        super.onStop()
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onStop() - Activity no longer visible")
    }
    
    override fun onDestroy() {
        super.onDestroy()
        android.util.Log.d("ActiveCallActivity", "[ACTIVITY] onDestroy() - Activity destroyed")
        cleanup()
    }
}