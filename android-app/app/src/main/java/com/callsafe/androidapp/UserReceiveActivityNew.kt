package com.callsafe.androidapp

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.callsafe.androidapp.adapters.CallHistoryAdapter
import com.callsafe.androidapp.adapters.IncomingCallsAdapter
import com.callsafe.androidapp.base.CallSafeBaseActivity
import com.callsafe.androidapp.models.CallState
import com.callsafe.androidapp.models.CallStatus
import com.callsafe.androidapp.utils.SessionManager
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textview.MaterialTextView
import java.util.*

/**
 * NEW UserReceiveActivity using service-centric architecture
 * This replaces the old UserReceiveActivity with a much cleaner design
 */
class UserReceiveActivityNew : CallSafeBaseActivity() {
    
    companion object {
        private const val TAG = "UserReceiveActivityNew"
    }
    
    // UI Components
    private lateinit var tvConnectionStatus: MaterialTextView
    private lateinit var btnDashboard: MaterialButton
    private lateinit var btnBackToDashboard: MaterialButton
    private lateinit var cardCurrentCall: MaterialCardView
    private lateinit var tvCallStatus: MaterialTextView
    private lateinit var tvCallId: MaterialTextView
    private lateinit var tvCallDuration: MaterialTextView
    private lateinit var btnMute: MaterialButton
    private lateinit var btnEndCall: MaterialButton
    private lateinit var cardCallControls: MaterialCardView
    private lateinit var rvIncomingCalls: RecyclerView
    private lateinit var rvCallHistory: RecyclerView
    private lateinit var tvNoIncomingCalls: MaterialTextView
    private lateinit var tvNoCallHistory: MaterialTextView
    
    // Adapters
    private lateinit var incomingCallsAdapter: IncomingCallsAdapter
    private lateinit var callHistoryAdapter: CallHistoryAdapter
    
    // Session management
    private lateinit var sessionManager: SessionManager
    
    // Call duration timer
    private var callTimer: Timer? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user_receive)
        
        sessionManager = SessionManager.getInstance(this)
        
        // Check if user has a valid session
        if (!sessionManager.isSessionValid()) {
            Toast.makeText(this, "Session expired. Please login again.", Toast.LENGTH_LONG).show()
            navigateToLogin()
            return
        }
        
        Log.i(TAG, "🚀 Starting new UserReceive activity")
        
        initViews()
        setupRecyclerViews()
        setupClickListeners()
        
        // Start the CallSafe service
        startCallSafeService()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        stopCallTimer()
    }
    
    private fun initViews() {
        tvConnectionStatus = findViewById(R.id.tv_connection_status)
        btnDashboard = findViewById(R.id.btn_dashboard)
        btnBackToDashboard = findViewById(R.id.btn_back_dashboard)
        cardCurrentCall = findViewById(R.id.card_current_call)
        tvCallStatus = findViewById(R.id.tv_call_status)
        tvCallId = findViewById(R.id.tv_call_id)
        tvCallDuration = findViewById(R.id.tv_call_duration)
        btnMute = findViewById(R.id.btn_mute)
        btnEndCall = findViewById(R.id.btn_end_call)
        cardCallControls = findViewById(R.id.card_call_controls)
        rvIncomingCalls = findViewById(R.id.rv_incoming_calls)
        rvCallHistory = findViewById(R.id.rv_call_history)
        tvNoIncomingCalls = findViewById(R.id.tv_no_incoming_calls)
        tvNoCallHistory = findViewById(R.id.tv_no_call_history)
        
        // Set initial values
        tvConnectionStatus.text = "Starting service..."
    }
    
    private fun setupRecyclerViews() {
        // Incoming calls adapter
        incomingCallsAdapter = IncomingCallsAdapter { call ->
            when (call.action) {
                "accept" -> acceptCall(call.callId)
                "decline" -> declineCall(call.callId)
            }
        }
        
        rvIncomingCalls.apply {
            layoutManager = LinearLayoutManager(this@UserReceiveActivityNew)
            adapter = incomingCallsAdapter
        }
        
        // Call history adapter
        callHistoryAdapter = CallHistoryAdapter()
        rvCallHistory.apply {
            layoutManager = LinearLayoutManager(this@UserReceiveActivityNew)
            adapter = callHistoryAdapter
        }
    }
    
    private fun setupClickListeners() {
        btnDashboard.setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java))
        }
        
        btnBackToDashboard.setOnClickListener {
            logout()
        }
        
        btnMute.setOnClickListener {
            toggleMute()
        }
        
        btnEndCall.setOnClickListener {
            currentState.currentCall?.let { call ->
                endCall(call.callId)
            }
        }
    }
    
    // Override service event handlers
    
    override fun handleStateChange(state: CallState) {
        Log.d(TAG, "🔄 Handling state change: ${state.connectionStatus}")
        
        runOnUiThread {
            // Update connection status
            tvConnectionStatus.text = state.connectionStatus
            
            // Update incoming calls
            updateIncomingCallsUI(state)
            
            // Update current call
            updateCurrentCallUI(state)
            
            // Update call history
            updateCallHistoryUI(state)
        }
    }
    
    override fun handleConnectionStatusChange(status: String) {
        runOnUiThread {
            tvConnectionStatus.text = status
        }
    }
    
    override fun handleIncomingCall(callId: String, sourceId: String) {
        runOnUiThread {
            Toast.makeText(this, "Incoming call from $sourceId!", Toast.LENGTH_SHORT).show()
        }
    }
    
    override fun handleCallStarted(callId: String, sourceId: String) {
        runOnUiThread {
            Toast.makeText(this, "Call started with $sourceId", Toast.LENGTH_SHORT).show()
        }
    }
    
    override fun handleCallEnded(callId: String) {
        runOnUiThread {
            Toast.makeText(this, "Call ended", Toast.LENGTH_SHORT).show()
            stopCallTimer()
        }
    }
    
    override fun handleError(message: String) {
        runOnUiThread {
            Toast.makeText(this, "Error: $message", Toast.LENGTH_LONG).show()
        }
    }
    
    // UI Update Methods
    
    private fun updateIncomingCallsUI(state: CallState) {
        if (state.incomingCalls.isEmpty()) {
            rvIncomingCalls.visibility = View.GONE
            tvNoIncomingCalls.visibility = View.VISIBLE
        } else {
            rvIncomingCalls.visibility = View.VISIBLE
            tvNoIncomingCalls.visibility = View.GONE
            
            // Convert to the format expected by the adapter
            val incomingCalls = state.incomingCalls.map { call ->
                com.callsafe.androidapp.models.IncomingCall(
                    callId = call.callId,
                    timestamp = call.timestamp,
                    sourceId = call.sourceId
                )
            }
            incomingCallsAdapter.updateCalls(incomingCalls)
        }
    }
    
    private fun updateCurrentCallUI(state: CallState) {
        val currentCall = state.currentCall
        
        if (currentCall == null) {
            // No active call
            cardCurrentCall.visibility = View.GONE
            cardCallControls.visibility = View.GONE
            stopCallTimer()
        } else {
            // Active call
            cardCurrentCall.visibility = View.VISIBLE
            
            tvCallId.text = "Call ID: ${currentCall.callId.takeLast(6)}"
            
            when (currentCall.status) {
                CallStatus.INCOMING -> {
                    tvCallStatus.text = "Incoming call..."
                    cardCallControls.visibility = View.GONE
                }
                CallStatus.CONNECTING -> {
                    tvCallStatus.text = "Connecting..."
                    cardCallControls.visibility = View.GONE
                }
                CallStatus.CONNECTED -> {
                    tvCallStatus.text = "Connected to ${currentCall.sourceId}"
                    cardCallControls.visibility = View.VISIBLE
                    startCallTimer(currentCall.startTime)
                }
                CallStatus.ENDING -> {
                    tvCallStatus.text = "Ending call..."
                    cardCallControls.visibility = View.GONE
                }
                CallStatus.ENDED -> {
                    // This should trigger hiding the call UI
                    cardCurrentCall.visibility = View.GONE
                    cardCallControls.visibility = View.GONE
                    stopCallTimer()
                }
            }
            
            // Update mute button
            btnMute.text = if (currentCall.isMuted) "Unmute" else "Mute"
            btnMute.setBackgroundColor(
                getColor(if (currentCall.isMuted) android.R.color.holo_red_dark else android.R.color.darker_gray)
            )
        }
    }
    
    private fun updateCallHistoryUI(state: CallState) {
        if (state.recentCallHistory.isEmpty()) {
            rvCallHistory.visibility = View.GONE
            tvNoCallHistory.visibility = View.VISIBLE
        } else {
            rvCallHistory.visibility = View.VISIBLE
            tvNoCallHistory.visibility = View.GONE
            callHistoryAdapter.updateHistory(state.recentCallHistory)
        }
    }
    
    // Call Timer Management
    
    private fun startCallTimer(callStartTime: Long) {
        stopCallTimer() // Stop any existing timer
        
        callTimer = Timer()
        callTimer?.scheduleAtFixedRate(object : TimerTask() {
            override fun run() {
                val duration = ((System.currentTimeMillis() - callStartTime) / 1000).toInt()
                runOnUiThread {
                    val minutes = duration / 60
                    val seconds = duration % 60
                    tvCallDuration.text = String.format("%02d:%02d", minutes, seconds)
                }
            }
        }, 0, 1000)
    }
    
    private fun stopCallTimer() {
        callTimer?.cancel()
        callTimer = null
        runOnUiThread {
            tvCallDuration.text = "00:00"
        }
    }
    
    // Navigation and Session Management
    
    private fun navigateToLogin() {
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
    
    private fun logout() {
        // Stop the service
        stopCallSafeService()
        
        // Clear session
        sessionManager.clearSession()
        
        Toast.makeText(this, "Logged out successfully", Toast.LENGTH_SHORT).show()
        navigateToLogin()
    }
}