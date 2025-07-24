package com.callsafe.androidapp

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import com.callsafe.androidapp.base.CallSafeBaseActivity
import com.callsafe.androidapp.models.CallState
import com.callsafe.androidapp.utils.RingtonePlayer
import com.callsafe.androidapp.utils.SessionManager
import com.google.android.material.button.MaterialButton
import com.google.android.material.textview.MaterialTextView

/**
 * NEW IncomingCallActivity using service-centric architecture
 * Handles incoming calls via service communication instead of direct socket access
 */
class IncomingCallActivityNew : CallSafeBaseActivity() {
    
    companion object {
        private const val TAG = "IncomingCallActivityNew"
        private const val CALL_TIMEOUT_MS = 30000L // 30 seconds
    }
    
    private lateinit var tvCallerName: MaterialTextView
    private lateinit var tvCallerId: MaterialTextView
    private lateinit var btnAccept: MaterialButton
    private lateinit var btnDecline: MaterialButton
    
    private lateinit var sessionManager: SessionManager
    private lateinit var ringtonePlayer: RingtonePlayer
    
    private var callId: String = ""
    private var sourceId: String = ""
    private var callerName: String = ""
    private var fromFCM: Boolean = false
    
    private var timeoutHandler: Handler? = null
    private var timeoutRunnable: Runnable? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Show activity over lock screen and as full screen
        setupWindowFlags()
        
        setContentView(R.layout.activity_incoming_call)
        
        // Initialize components
        sessionManager = SessionManager.getInstance(this)
        ringtonePlayer = RingtonePlayer(this)
        
        Log.i(TAG, "🚀 Incoming call activity created")
        
        initViews()
        extractIntentData()
        setupClickListeners()
        
        // Start ringing
        ringtonePlayer.startRinging()
        Log.i(TAG, "🔔 Ringtone started")
        
        // Setup call timeout
        setupCallTimeout()
        
        // Validate call exists in service state
        validateIncomingCall()
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
    
    private fun setupWindowFlags() {
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
    }
    
    private fun initViews() {
        tvCallerName = findViewById(R.id.tv_caller_name)
        tvCallerId = findViewById(R.id.tv_caller_id)
        btnAccept = findViewById(R.id.btn_accept)
        btnDecline = findViewById(R.id.btn_decline)
    }
    
    private fun extractIntentData() {
        intent?.let { intent ->
            callId = intent.getStringExtra("callId") ?: ""
            sourceId = intent.getStringExtra("sourceId") ?: ""
            callerName = intent.getStringExtra("callerName") ?: "Unknown Caller"
            fromFCM = intent.getBooleanExtra("fromFCM", false)
            
            Log.i(TAG, "📋 Call data - ID: $callId, Source: $sourceId, Caller: $callerName, FCM: $fromFCM")
            
            // Update UI
            tvCallerName.text = callerName
            tvCallerId.text = "from $sourceId"
        }
    }
    
    private fun setupClickListeners() {
        btnAccept.setOnClickListener {
            handleAcceptCall()
        }
        
        btnDecline.setOnClickListener {
            handleDeclineCall()
        }
    }
    
    private fun setupCallTimeout() {
        timeoutHandler = Handler(Looper.getMainLooper())
        timeoutRunnable = Runnable {
            Log.i(TAG, "⏰ Call timeout reached")
            handleCallTimeout()
        }
        
        timeoutHandler?.postDelayed(timeoutRunnable!!, CALL_TIMEOUT_MS)
        Log.i(TAG, "⏰ Call timeout set for ${CALL_TIMEOUT_MS}ms")
    }
    
    private fun validateIncomingCall() {
        // Check if the call still exists in the service state
        // If launched from FCM, the call might not be in the service state yet
        if (callId.isNotEmpty()) {
            serviceHelper.requestCurrentState()
        }
    }
    
    // Service event handlers
    
    override fun handleStateChange(state: CallState) {
        super.handleStateChange(state)
        
        // Check if our call is still in the incoming calls list
        val incomingCall = state.incomingCalls.find { it.callId == callId }
        
        if (incomingCall == null && callId.isNotEmpty()) {
            // Call no longer exists (might have been cancelled, accepted by another agent, etc.)
            Log.i(TAG, "📵 Call no longer exists in service state - finishing activity")
            finish()
            return
        }
        
        // Check if call was accepted and became active
        val activeCall = state.currentCall
        if (activeCall?.callId == callId) {
            Log.i(TAG, "✅ Call accepted and became active - navigating to main activity")
            navigateToMainActivity()
        }
    }
    
    override fun handleCallStarted(callId: String, sourceId: String) {
        if (callId == this.callId) {
            Log.i(TAG, "✅ Our call started - navigating to main activity")
            navigateToMainActivity()
        }
    }
    
    override fun handleCallEnded(callId: String) {
        if (callId == this.callId) {
            Log.i(TAG, "📞 Our call ended - finishing activity")
            finish()
        }
    }
    
    // Call action handlers
    
    private fun handleAcceptCall() {
        Log.i(TAG, "✅ User accepted call: $callId")
        
        if (callId.isEmpty()) {
            Log.e(TAG, "❌ Cannot accept call - no call ID")
            finish()
            return
        }
        
        // Stop ringtone immediately
        ringtonePlayer.stopRinging()
        Log.i(TAG, "🔇 Ringtone stopped - call accepted")
        
        // Cancel timeout
        timeoutHandler?.removeCallbacks(timeoutRunnable ?: return)
        
        // Send accept command to service
        acceptCall(callId)
        
        // Update UI to show accepting state
        btnAccept.text = "Connecting..."
        btnAccept.isEnabled = false
        btnDecline.isEnabled = false
    }
    
    private fun handleDeclineCall() {
        Log.i(TAG, "❌ User declined call: $callId")
        
        if (callId.isEmpty()) {
            Log.e(TAG, "❌ Cannot decline call - no call ID")
            finish()
            return
        }
        
        // Stop ringtone immediately
        ringtonePlayer.stopRinging()
        Log.i(TAG, "🔇 Ringtone stopped - call declined")
        
        // Cancel timeout
        timeoutHandler?.removeCallbacks(timeoutRunnable ?: return)
        
        // Send decline command to service
        declineCall(callId)
        
        // Finish activity
        finish()
    }
    
    private fun handleCallTimeout() {
        Log.i(TAG, "⏰ Call timed out")
        
        // Stop ringtone
        ringtonePlayer.stopRinging()
        
        // The service will automatically handle the timeout
        // Just close this activity
        finish()
    }
    
    private fun navigateToMainActivity() {
        Log.i(TAG, "🚀 Navigating to main activity")
        
        // Stop ringtone
        ringtonePlayer.stopRinging()
        
        // Navigate to main activity
        val intent = Intent(this, UserReceiveActivityNew::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(intent)
        finish()
    }
    
    override fun onBackPressed() {
        // Prevent back button during incoming call
        // User must explicitly accept or decline
        Log.d(TAG, "🚫 Back button disabled during incoming call")
    }
}