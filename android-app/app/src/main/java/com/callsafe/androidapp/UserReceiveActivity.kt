package com.callsafe.androidapp

import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.callsafe.androidapp.adapters.CallHistoryAdapter
import com.callsafe.androidapp.adapters.IncomingCallsAdapter
import com.callsafe.androidapp.models.CallHistoryItem
import com.callsafe.androidapp.models.IncomingCall
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textview.MaterialTextView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class UserReceiveActivity : AppCompatActivity() {
    
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var tvAgentHandle: MaterialTextView
    private lateinit var tvSourceId: MaterialTextView
    private lateinit var tvConnectionStatus: MaterialTextView
    private lateinit var btnToggleOnline: MaterialButton
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
    
    private lateinit var incomingCallsAdapter: IncomingCallsAdapter
    private lateinit var callHistoryAdapter: CallHistoryAdapter
    
    private var handle: String = ""
    private var sourceId: String = ""
    private var isOnline = false
    private var isConnected = false
    private var callDuration = 0
    private var currentCallId: String? = null
    private var isMuted = false
    
    private val incomingCalls = mutableListOf<IncomingCall>()
    private val callHistory = mutableListOf<CallHistoryItem>()
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user_receive)
        
        sharedPreferences = getSharedPreferences("callsafe_prefs", MODE_PRIVATE)
        
        // Get handle from intent
        handle = intent.getStringExtra("handle") ?: ""
        sourceId = intent.getStringExtra("sourceId") ?: ""
        
        if (handle.isEmpty()) {
            Toast.makeText(this, "No handle provided", Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        
        initViews()
        setupRecyclerViews()
        setupClickListeners()
        loadCallHistory()
        simulateConnection()
    }
    
    private fun initViews() {
        tvAgentHandle = findViewById(R.id.tv_agent_handle)
        tvSourceId = findViewById(R.id.tv_source_id)
        tvConnectionStatus = findViewById(R.id.tv_connection_status)
        btnToggleOnline = findViewById(R.id.btn_toggle_online)
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
        
        // Set handle and source info
        tvAgentHandle.text = handle
        tvSourceId.text = if (sourceId.isNotEmpty()) sourceId else "No source ID"
        
        updateConnectionUI()
    }
    
    private fun setupRecyclerViews() {
        // Incoming calls adapter
        incomingCallsAdapter = IncomingCallsAdapter { call ->
            when (call.action) {
                "accept" -> acceptCall(call.callId)
                "decline" -> declineCall(call.callId)
            }
        }
        
        rvIncomingCalls.layoutManager = LinearLayoutManager(this)
        rvIncomingCalls.adapter = incomingCallsAdapter
        
        // Call history adapter
        callHistoryAdapter = CallHistoryAdapter()
        rvCallHistory.layoutManager = LinearLayoutManager(this)
        rvCallHistory.adapter = callHistoryAdapter
        
        updateIncomingCallsUI()
        updateCallHistoryUI()
    }
    
    private fun setupClickListeners() {
        btnToggleOnline.setOnClickListener {
            toggleOnlineStatus()
        }
        
        btnBackToDashboard.setOnClickListener {
            startActivity(Intent(this, UserActivity::class.java))
            finish()
        }
        
        btnMute.setOnClickListener {
            toggleMute()
        }
        
        btnEndCall.setOnClickListener {
            endCall()
        }
    }
    
    private fun simulateConnection() {
        lifecycleScope.launch {
            tvConnectionStatus.text = "Connecting to server..."
            delay(2000)
            
            isConnected = true
            tvConnectionStatus.text = "Connected"
            updateConnectionUI()
            
            // Auto go online
            delay(1000)
            goOnline()
            
            // Simulate incoming calls for demo
            delay(5000)
            simulateIncomingCall()
        }
    }
    
    private fun toggleOnlineStatus() {
        if (isOnline) {
            goOffline()
        } else {
            goOnline()
        }
    }
    
    private fun goOnline() {
        isOnline = true
        tvConnectionStatus.text = "Online - Waiting for calls"
        updateConnectionUI()
        Toast.makeText(this, "You are now online", Toast.LENGTH_SHORT).show()
    }
    
    private fun goOffline() {
        isOnline = false
        tvConnectionStatus.text = "Offline"
        updateConnectionUI()
        Toast.makeText(this, "You are now offline", Toast.LENGTH_SHORT).show()
        
        // Clear incoming calls when going offline
        incomingCalls.clear()
        updateIncomingCallsUI()
    }
    
    private fun updateConnectionUI() {
        when {
            !isConnected -> {
                btnToggleOnline.isEnabled = false
                btnToggleOnline.text = "Disconnected"
                btnToggleOnline.setBackgroundColor(getColor(android.R.color.darker_gray))
            }
            isOnline -> {
                btnToggleOnline.isEnabled = true
                btnToggleOnline.text = "Go Offline"
                btnToggleOnline.setBackgroundColor(getColor(android.R.color.holo_green_dark))
            }
            else -> {
                btnToggleOnline.isEnabled = true
                btnToggleOnline.text = "Go Online"
                btnToggleOnline.setBackgroundColor(getColor(android.R.color.darker_gray))
            }
        }
    }
    
    private fun simulateIncomingCall() {
        if (!isOnline) return
        
        val call = IncomingCall(
            callId = "call_${System.currentTimeMillis()}",
            timestamp = System.currentTimeMillis(),
            sourceId = "demo_source_${Random().nextInt(100)}"
        )
        
        incomingCalls.add(call)
        updateIncomingCallsUI()
        
        Toast.makeText(this, "Incoming call!", Toast.LENGTH_SHORT).show()
        
        // Auto-remove after 30 seconds if not answered
        lifecycleScope.launch {
            delay(30000)
            incomingCalls.removeAll { it.callId == call.callId }
            updateIncomingCallsUI()
        }
        
        // Simulate another call in 20-40 seconds
        lifecycleScope.launch {
            delay((20000..40000).random().toLong())
            simulateIncomingCall()
        }
    }
    
    private fun acceptCall(callId: String) {
        // Remove from incoming calls
        incomingCalls.removeAll { it.callId == callId }
        updateIncomingCallsUI()
        
        // Start call
        currentCallId = callId
        tvCallStatus.text = "Connected to Customer"
        tvCallId.text = "Call ID: $callId"
        tvCallDuration.text = "00:00"
        
        cardCurrentCall.visibility = View.VISIBLE
        cardCallControls.visibility = View.VISIBLE
        
        startCallTimer()
        
        Toast.makeText(this, "Call accepted", Toast.LENGTH_SHORT).show()
    }
    
    private fun declineCall(callId: String) {
        // Remove from incoming calls
        val call = incomingCalls.find { it.callId == callId }
        incomingCalls.removeAll { it.callId == callId }
        updateIncomingCallsUI()
        
        // Add to call history as missed
        call?.let {
            addToCallHistory(CallHistoryItem(
                callId = it.callId,
                timestamp = it.timestamp,
                duration = 0,
                status = "missed",
                sourceId = it.sourceId,
                reason = "agent_declined"
            ))
        }
        
        Toast.makeText(this, "Call declined", Toast.LENGTH_SHORT).show()
    }
    
    private fun toggleMute() {
        isMuted = !isMuted
        btnMute.text = if (isMuted) "Unmute" else "Mute"
        btnMute.setBackgroundColor(
            if (isMuted) getColor(android.R.color.holo_red_dark) 
            else getColor(android.R.color.darker_gray)
        )
        
        Toast.makeText(
            this, 
            if (isMuted) "Microphone muted" else "Microphone unmuted", 
            Toast.LENGTH_SHORT
        ).show()
    }
    
    private fun endCall() {
        currentCallId?.let { callId ->
            // Add to call history
            addToCallHistory(CallHistoryItem(
                callId = callId,
                timestamp = System.currentTimeMillis(),
                duration = callDuration,
                status = "completed",
                sourceId = "customer",
                reason = "agent_ended"
            ))
        }
        
        // Reset call UI
        currentCallId = null
        callDuration = 0
        isMuted = false
        
        cardCurrentCall.visibility = View.GONE
        cardCallControls.visibility = View.GONE
        
        btnMute.text = "Mute"
        btnMute.setBackgroundColor(getColor(android.R.color.darker_gray))
        
        Toast.makeText(this, "Call ended", Toast.LENGTH_SHORT).show()
    }
    
    private fun startCallTimer() {
        lifecycleScope.launch {
            while (currentCallId != null) {
                delay(1000)
                callDuration++
                
                val minutes = callDuration / 60
                val seconds = callDuration % 60
                val timeString = String.format("%02d:%02d", minutes, seconds)
                tvCallDuration.text = timeString
            }
        }
    }
    
    private fun updateIncomingCallsUI() {
        if (incomingCalls.isEmpty()) {
            rvIncomingCalls.visibility = View.GONE
            tvNoIncomingCalls.visibility = View.VISIBLE
        } else {
            rvIncomingCalls.visibility = View.VISIBLE
            tvNoIncomingCalls.visibility = View.GONE
            incomingCallsAdapter.updateCalls(incomingCalls)
        }
    }
    
    private fun updateCallHistoryUI() {
        if (callHistory.isEmpty()) {
            rvCallHistory.visibility = View.GONE
            tvNoCallHistory.visibility = View.VISIBLE
        } else {
            rvCallHistory.visibility = View.VISIBLE
            tvNoCallHistory.visibility = View.GONE
            callHistoryAdapter.updateHistory(callHistory)
        }
    }
    
    private fun addToCallHistory(item: CallHistoryItem) {
        callHistory.add(0, item) // Add to beginning
        
        // Keep only last 10
        if (callHistory.size > 10) {
            callHistory.removeAt(callHistory.size - 1)
        }
        
        updateCallHistoryUI()
        saveCallHistory()
    }
    
    private fun loadCallHistory() {
        val key = "call_history_$handle"
        val json = sharedPreferences.getString(key, null)
        
        if (json != null) {
            try {
                // Parse JSON and load history
                // For simplicity, adding some dummy data
                addDemoCallHistory()
            } catch (e: Exception) {
                addDemoCallHistory()
            }
        } else {
            addDemoCallHistory()
        }
    }
    
    private fun addDemoCallHistory() {
        val demoHistory = listOf(
            CallHistoryItem(
                callId = "demo_call_001",
                timestamp = System.currentTimeMillis() - 3600000, // 1 hour ago
                duration = 320, // 5:20
                status = "completed",
                sourceId = "website_form",
                reason = "normal_completion"
            ),
            CallHistoryItem(
                callId = "demo_call_002", 
                timestamp = System.currentTimeMillis() - 7200000, // 2 hours ago
                duration = 0,
                status = "missed",
                sourceId = "landing_page",
                reason = "no_answer"
            ),
            CallHistoryItem(
                callId = "demo_call_003",
                timestamp = System.currentTimeMillis() - 10800000, // 3 hours ago
                duration = 145, // 2:25
                status = "completed",
                sourceId = "contact_form",
                reason = "normal_completion"
            )
        )
        
        callHistory.addAll(demoHistory)
        updateCallHistoryUI()
    }
    
    private fun saveCallHistory() {
        // Save to SharedPreferences
        val key = "call_history_$handle"
        // For now, just keep in memory
        // In a real implementation, serialize to JSON and save
    }
}