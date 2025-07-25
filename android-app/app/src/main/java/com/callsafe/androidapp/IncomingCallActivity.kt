package com.callsafe.androidapp

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import com.callsafe.androidapp.network.SocketManager
import com.callsafe.androidapp.utils.RingtonePlayer
import com.callsafe.androidapp.utils.SessionManager
import com.google.android.material.button.MaterialButton
import com.google.android.material.textview.MaterialTextView

class IncomingCallActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "IncomingCallActivity"
        private const val CALL_TIMEOUT_MS = 30000L // 30 seconds
    }
    
    private lateinit var tvCallerName: MaterialTextView
    private lateinit var tvCallerId: MaterialTextView
    private lateinit var btnAccept: MaterialButton
    private lateinit var btnDecline: MaterialButton
    
    private lateinit var sessionManager: SessionManager
    private lateinit var socketManager: SocketManager
    private lateinit var ringtonePlayer: RingtonePlayer
    
    private var callId: String = ""
    private var sourceId: String = ""
    private var callerName: String = ""
    private var fromFCM: Boolean = false
    private var handle: String = ""
    
    private var timeoutHandler: Handler? = null
    private var timeoutRunnable: Runnable? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Show activity over lock screen and as full screen
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        
        // Keep screen on during call
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        setContentView(R.layout.activity_incoming_call)
        
        // Initialize components
        sessionManager = SessionManager.getInstance(this)
        socketManager = SocketManager.getInstance()
        ringtonePlayer = RingtonePlayer(this)
        
        // Get user handle
        handle = sessionManager.getUserHandle() ?: ""
        
        Log.i(TAG, "🚀 Incoming call activity created")
        
        initViews()
        extractIntentData()
        setupClickListeners()
        
        // Start ringing
        ringtonePlayer.startRinging()
        Log.i(TAG, "🔔 Ringtone started")
        
        // Setup call timeout
        setupCallTimeout()
        
        // If launched from FCM, ensure socket connection
        if (fromFCM) {
            ensureSocketConnection()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        
        // Stop ringtone
        ringtonePlayer.stopRinging()
        ringtonePlayer.dispose()
        
        // Cancel timeout
        timeoutHandler?.removeCallbacks(timeoutRunnable ?: return)
        
        Log.i(TAG, "🧹 Incoming call activity destroyed")
    }
    
    private fun initViews() {
        tvCallerName = findViewById(R.id.tv_caller_name)
        tvCallerId = findViewById(R.id.tv_caller_id)
        btnAccept = findViewById(R.id.btn_accept_call)
        btnDecline = findViewById(R.id.btn_decline_call)
    }
    
    private fun extractIntentData() {
        callId = intent.getStringExtra("callId") ?: ""
        sourceId = intent.getStringExtra("sourceId") ?: ""
        callerName = intent.getStringExtra("callerName") ?: "Unknown Caller"
        fromFCM = intent.getBooleanExtra("fromFCM", false)
        
        Log.i(TAG, "📞 Call data - ID: $callId, Source: $sourceId, Name: $callerName, FromFCM: $fromFCM")
        
        // Update UI
        tvCallerName.text = callerName
        tvCallerId.text = if (sourceId.isNotEmpty()) "ID: $sourceId" else "Call ID: ${callId.takeLast(6)}"
        
        if (callId.isEmpty()) {
            Log.e(TAG, "❌ Invalid call data - missing callId")
            showError("Invalid call data")
            finish()
        }
    }
    
    private fun setupClickListeners() {
        btnAccept.setOnClickListener {
            Log.i(TAG, "✅ Accept button clicked")
            acceptCall()
        }
        
        btnDecline.setOnClickListener {
            Log.i(TAG, "❌ Decline button clicked")
            declineCall()
        }
    }
    
    private fun setupCallTimeout() {
        timeoutHandler = Handler(Looper.getMainLooper())
        timeoutRunnable = Runnable {
            Log.w(TAG, "⏰ Call timed out after ${CALL_TIMEOUT_MS}ms")
            
            // Auto-decline the call
            declineCall(autoDecline = true)
        }
        
        timeoutHandler?.postDelayed(timeoutRunnable!!, CALL_TIMEOUT_MS)
        Log.i(TAG, "⏰ Call timeout set for ${CALL_TIMEOUT_MS}ms")
    }
    
    private fun ensureSocketConnection() {
        Log.i(TAG, "🔌 Ensuring socket connection for FCM call")
        
        if (!socketManager.isConnected()) {
            Log.w(TAG, "⚠️ Socket not connected, connecting now...")
            
            socketManager.connect { success, error ->
                runOnUiThread {
                    if (success) {
                        Log.i(TAG, "✅ Socket connected for FCM call")
                        // Register with server
                        socketManager.goOnlineWithHandle(handle, sourceId.takeIf { it.isNotEmpty() })
                    } else {
                        Log.e(TAG, "❌ Failed to connect socket for FCM call: $error")
                        showError("Connection failed. Please try again.")
                    }
                }
            }
        } else {
            Log.i(TAG, "✅ Socket already connected")
        }
    }
    
    private fun acceptCall() {
        Log.i(TAG, "✅ Accepting call: $callId")
        
        // Stop ringtone
        ringtonePlayer.stopRinging()
        
        // Cancel timeout
        timeoutHandler?.removeCallbacks(timeoutRunnable ?: return)
        
        // Disable buttons to prevent multiple clicks
        btnAccept.isEnabled = false
        btnDecline.isEnabled = false
        btnAccept.text = "Connecting..."
        
        try {
            // Accept call through socket manager
            socketManager.acceptCall(callId, handle, sourceId.takeIf { it.isNotEmpty() })
            
            Log.i(TAG, "📤 Accept call sent to server")
            
            // Navigate to main call activity
            val intent = Intent(this, UserReceiveActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("acceptedCallId", callId)
                putExtra("acceptedSourceId", sourceId)
            }
            
            startActivity(intent)
            
            // Close this activity
            finish()
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error accepting call", e)
            showError("Failed to accept call")
            
            // Re-enable buttons
            btnAccept.isEnabled = true
            btnDecline.isEnabled = true
            btnAccept.text = "Accept"
        }
    }
    
    private fun declineCall(autoDecline: Boolean = false) {
        val reason = if (autoDecline) "timeout" else "user_declined"
        Log.i(TAG, "❌ Declining call: $callId, reason: $reason")
        
        // Stop ringtone
        ringtonePlayer.stopRinging()
        
        // Cancel timeout
        timeoutHandler?.removeCallbacks(timeoutRunnable ?: return)
        
        // Disable buttons
        btnAccept.isEnabled = false
        btnDecline.isEnabled = false
        btnDecline.text = if (autoDecline) "Timed Out" else "Declining..."
        
        try {
            // Decline call through socket manager
            socketManager.declineCall(callId, handle, sourceId.takeIf { it.isNotEmpty() })
            
            Log.i(TAG, "📤 Decline call sent to server")
            
            // Show brief message
            if (autoDecline) {
                showError("Call timed out")
            }
            
            // Close activity after brief delay
            Handler(Looper.getMainLooper()).postDelayed({
                finish()
            }, 1000)
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error declining call", e)
            showError("Failed to decline call")
            finish()
        }
    }
    
    private fun showError(message: String) {
        // Could show a Toast or Snackbar
        Log.e(TAG, "💥 Error: $message")
        // For now, just log the error
    }
    
    // Handle back button press - treat as decline
    override fun onBackPressed() {
        Log.i(TAG, "🔙 Back button pressed - declining call")
        declineCall()
    }
}