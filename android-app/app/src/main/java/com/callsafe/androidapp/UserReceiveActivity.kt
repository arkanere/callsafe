package com.callsafe.androidapp

import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
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
import com.callsafe.androidapp.network.SocketManager
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textview.MaterialTextView
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

class UserReceiveActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "UserReceiveActivity"
    }
    
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var socketManager: SocketManager
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
    private var currentCallSourceId: String? = null
    private var isMuted = false
    
    private val incomingCalls = mutableListOf<IncomingCall>()
    private val callHistory = mutableListOf<CallHistoryItem>()
    
    private var callTimer: Timer? = null
    private var callStartTime: Long = 0
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user_receive)
        
        sharedPreferences = getSharedPreferences("callsafe_prefs", MODE_PRIVATE)
        socketManager = SocketManager.getInstance()
        
        // Get handle from intent
        handle = intent.getStringExtra("handle") ?: ""
        sourceId = intent.getStringExtra("sourceId") ?: ""
        
        if (handle.isEmpty()) {
            Toast.makeText(this, "No handle provided", Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        
        Log.i(TAG, "Starting receive activity for handle: $handle")
        
        initViews()
        setupRecyclerViews()
        setupClickListeners()
        setupSocketEventListeners()
        loadCallHistory()
        connectToServer()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Clean up on destroy
        
        // Go offline and cleanup
        if (isOnline) {
            socketManager.goOffline()
        }
        
        // Clean up call timer
        stopCallTimer()
        
        // Remove all event listeners
        socketManager.off("new_incoming_call")
        socketManager.off("call_routed")
        socketManager.off("offer")
        socketManager.off("ice_candidate")
        socketManager.off("call_ended")
        socketManager.off("call_disconnected")
        socketManager.off("call_cancelled")
        socketManager.off("call_request_cancelled")
        socketManager.off("customer_disconnected")
        socketManager.off("network_error")
        socketManager.off("reconnect_attempt")
        socketManager.off("connection_failed")
        socketManager.off("call_no_longer_available")
        socketManager.off("agent_registered")
        socketManager.off("missed_call")
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
        
        // Set initial values
        tvAgentHandle.text = handle
        tvSourceId.text = if (sourceId.isNotEmpty()) sourceId else "No source ID"
        tvConnectionStatus.text = "Disconnected"
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
            layoutManager = LinearLayoutManager(this@UserReceiveActivity)
            adapter = incomingCallsAdapter
        }
        
        // Call history adapter
        callHistoryAdapter = CallHistoryAdapter()
        rvCallHistory.apply {
            layoutManager = LinearLayoutManager(this@UserReceiveActivity)
            adapter = callHistoryAdapter
        }
    }
    
    private fun setupClickListeners() {
        btnBackToDashboard.setOnClickListener {
            val intent = Intent(this, UserActivity::class.java)
            startActivity(intent)
            finish()
        }
        
        btnToggleOnline.setOnClickListener {
            toggleOnlineStatus()
        }
        
        btnMute.setOnClickListener {
            toggleMute()
        }
        
        btnEndCall.setOnClickListener {
            endCall()
        }
    }
    
    private fun setupSocketEventListeners() {
        Log.i(TAG, "🔧 Setting up socket event listeners")
        // EXACTLY match website event names
        
        socketManager.on("new_incoming_call") { data ->
            Log.i(TAG, "📞 PROCESSING NEW INCOMING CALL")
            handleNewIncomingCall(data)
        }
        Log.i(TAG, "✅ Registered listener for 'new_incoming_call'")
        
        socketManager.on("call_routed") { data ->
            handleCallRouted(data)
        }
        
        socketManager.on("offer") { data ->
            handleOffer(data)
        }
        
        socketManager.on("ice_candidate") { data ->
            handleIceCandidate(data)
        }
        
        socketManager.on("call_ended") { data ->
            handleCallEnded(data)
        }
        
        socketManager.on("call_disconnected") { data ->
            Log.d(TAG, "📞 Call disconnected: $data")
            handleCallDisconnected(data)
        }
        
        socketManager.on("call_cancelled") { data ->
            Log.d(TAG, "📞 Call cancelled by customer: $data")
            handleCallCancelled(data)
        }
        
        socketManager.on("call_request_cancelled") { data ->
            Log.d(TAG, "📞 Call request cancelled: $data")
            handleCallRequestCancelled(data)
        }
        
        socketManager.on("customer_disconnected") { data ->
            Log.d(TAG, "📞 Customer disconnected: $data")
            handleCustomerDisconnected(data)
        }
        
        socketManager.on("network_error") { error ->
            Log.e(TAG, "🔥 Network error: $error")
            handleNetworkError(error)
        }
        
        socketManager.on("reconnect_attempt") { attempt ->
            Log.d(TAG, "🔄 Reconnect attempt: $attempt")
            runOnUiThread {
                tvConnectionStatus.text = "Reconnecting... (attempt $attempt)"
            }
        }
        
        socketManager.on("connection_failed") { reason ->
            Log.e(TAG, "❌ Connection failed: $reason")
            runOnUiThread {
                tvConnectionStatus.text = "Connection failed"
                isConnected = false
                isOnline = false
                updateConnectionUI()
                showError("Lost connection to server. Please try again.")
            }
        }
        
        socketManager.on("call_no_longer_available") { data ->
            Log.d(TAG, "📞 Call no longer available: $data")
            handleCallNoLongerAvailable(data)
        }
        
        socketManager.on("agent_registered") { data ->
            Log.i(TAG, "✅ AGENT REGISTERED - Ready for calls")
            runOnUiThread {
                tvConnectionStatus.text = "Registered - Ready to receive calls"
                isOnline = true
                updateConnectionUI()
            }
        }
        
        socketManager.on("missed_call") { data ->
            Log.i(TAG, "📞 MISSED CALL received")
            handleMissedCall(data)
        }
    }
    
    private fun connectToServer() {
        tvConnectionStatus.text = "Connecting to server..."
        
        socketManager.connect { success, error ->
            runOnUiThread {
                if (success) {
                    Log.i(TAG, "Connected to server")
                    isConnected = true
                    tvConnectionStatus.text = "Connected"
                    updateConnectionUI()
                    
                    // Automatically go online with handle
                    Handler(Looper.getMainLooper()).postDelayed({
                        goOnlineWithHandle()
                    }, 1000)
                    
                } else {
                    Log.e(TAG, "Connection failed: $error")
                    tvConnectionStatus.text = "Connection failed"
                    isConnected = false
                    updateConnectionUI()
                    showError("Failed to connect to server: $error")
                }
            }
        }
    }
    
    private fun toggleOnlineStatus() {
        if (!isConnected) {
            showError("Not connected to server")
            return
        }
        
        if (isOnline) {
            goOffline()
        } else {
            goOnlineWithHandle()
        }
    }
    
    private fun goOnlineWithHandle() {
        Log.i(TAG, "Going online with handle: $handle")
        socketManager.goOnlineWithHandle(handle, sourceId.takeIf { it.isNotEmpty() })
        isOnline = true
        tvConnectionStatus.text = "Online - Waiting for calls"
        updateConnectionUI()
        Toast.makeText(this, "You are now online", Toast.LENGTH_SHORT).show()
    }
    
    private fun goOffline() {
        socketManager.goOffline()
        isOnline = false
        tvConnectionStatus.text = "Offline"
        updateConnectionUI()
        
        // Clear incoming calls when going offline
        incomingCalls.clear()
        updateIncomingCallsUI()
        
        Toast.makeText(this, "You are now offline", Toast.LENGTH_SHORT).show()
    }
    
    private fun acceptCall(callId: String) {
        Log.d(TAG, "=== ACCEPT CALL CLICKED ===")
        Log.d(TAG, "Call ID: $callId")
        
        if (!isOnline) {
            Log.w(TAG, "Agent not online, cannot accept call")
            return
        }
        
        // Find the incoming call
        val incomingCall = incomingCalls.find { it.callId == callId }
        val callSourceId = incomingCall?.sourceId
        
        Log.d(TAG, "✅ Accepting call with sourceId: $callSourceId")
        socketManager.acceptCall(callId, handle, callSourceId)
        
        // Remove from incoming calls
        incomingCalls.removeAll { it.callId == callId }
        updateIncomingCallsUI()
        
        // Update current call state
        currentCallId = callId
        currentCallSourceId = callSourceId
        showCurrentCall("Connecting to customer...")
    }
    
    private fun declineCall(callId: String) {
        Log.d(TAG, "Declining call: $callId")
        
        // Find the incoming call for sourceId
        val incomingCall = incomingCalls.find { it.callId == callId }
        val callSourceId = incomingCall?.sourceId
        
        socketManager.declineCall(callId, handle, callSourceId)
        
        // Remove from incoming calls
        incomingCalls.removeAll { it.callId == callId }
        updateIncomingCallsUI()
        
        // Add to call history as missed
        addToCallHistory(
            callId = callId,
            duration = 0,
            status = "missed",
            sourceId = callSourceId ?: "",
            reason = "agent_declined"
        )
    }
    
    private fun endCall() {
        Log.d(TAG, "🔚 Ending current call")
        
        currentCallId?.let { callId ->
            val duration = if (callStartTime > 0) {
                ((System.currentTimeMillis() - callStartTime) / 1000).toInt()
            } else 0
            
            socketManager.endCall(callId, handle, currentCallSourceId, "manual")
            
            // Add to call history
            addToCallHistory(
                callId = callId,
                duration = duration,
                status = "completed",
                sourceId = currentCallSourceId ?: "",
                reason = "manual"
            )
            
            hideCurrentCall()
        }
    }
    
    private fun toggleMute() {
        isMuted = !isMuted
        btnMute.text = if (isMuted) "Unmute" else "Mute"
        btnMute.setBackgroundColor(
            getColor(if (isMuted) android.R.color.holo_red_dark else android.R.color.darker_gray)
        )
        // Note: Actual mute functionality would require WebRTC integration
    }
    
    // Socket event handlers that EXACTLY match website behavior
    
    private fun handleNewIncomingCall(data: Any?) {
        Log.i(TAG, "📞 NEW INCOMING CALL - Raw data received: $data")
        Log.i(TAG, "📞 Data type: ${data?.javaClass?.simpleName}")
        Log.i(TAG, "📞 Data toString: ${data.toString()}")
        
        // Match website pattern - try direct property access first like JavaScript
        var callId: String = ""
        var sourceId: String = ""
        
        try {
            when (data) {
                // First try direct Map access (matches website data.callId pattern)
                is Map<*, *> -> {
                    Log.i(TAG, "✅ Data is Map - using direct access")
                    Log.i(TAG, "📋 Map keys: ${data.keys}")
                    Log.i(TAG, "📋 Map values: ${data.values}")
                    callId = data["callId"]?.toString() ?: ""
                    sourceId = data["sourceId"]?.toString() ?: ""
                    Log.i(TAG, "📋 Map access - callId: '$callId', sourceId: '$sourceId'")
                }
                // Then try JSONObject
                is JSONObject -> {
                    Log.i(TAG, "✅ Data is JSONObject")
                    Log.i(TAG, "📋 JSONObject keys: ${data.keys().asSequence().toList()}")
                    callId = data.optString("callId", "")
                    sourceId = data.optString("sourceId", "")
                    Log.i(TAG, "📋 JSONObject access - callId: '$callId', sourceId: '$sourceId'")
                }
                // Try parsing string as JSON
                is String -> {
                    Log.i(TAG, "⚠️ Data is String, trying to parse as JSON: $data")
                    try {
                        val json = JSONObject(data)
                        callId = json.optString("callId", "")
                        sourceId = json.optString("sourceId", "")
                        Log.i(TAG, "📋 String->JSON access - callId: '$callId', sourceId: '$sourceId'")
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Failed to parse string as JSON", e)
                        // Try direct string parsing if it's a simple format
                        if (data.contains("callId") && data.contains("sourceId")) {
                            Log.i(TAG, "🔧 Attempting manual string parsing")
                            // This is a fallback - log the raw string for debugging
                            Log.e(TAG, "❌ Manual parsing needed for: $data")
                        }
                        return
                    }
                }
                // Handle any other object type by trying reflection-like access
                else -> {
                    Log.e(TAG, "❌ Unknown data type: ${data?.javaClass}")
                    Log.e(TAG, "❌ Data content: $data")
                    
                    // Last resort - try to access as any object with toString
                    if (data != null) {
                        val dataString = data.toString()
                        Log.e(TAG, "❌ Attempting toString parsing on: $dataString")
                        if (dataString.contains("callId") && dataString.contains("sourceId")) {
                            Log.e(TAG, "❌ Data contains expected fields but unknown format")
                        }
                    }
                    return
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception during data parsing", e)
            return
        }
        
        // Validate extracted data
        if (callId.isEmpty()) {
            Log.e(TAG, "❌ CallId is empty after parsing")
            return
        }
        
        Log.i(TAG, "✅ Successfully extracted - callId: '$callId', sourceId: '$sourceId'")
        
        val call = IncomingCall(
            callId = callId,
            timestamp = System.currentTimeMillis(),
            sourceId = sourceId
        )
        
        runOnUiThread {
            Log.i(TAG, "✅ Adding call to UI - callId: $callId")
            incomingCalls.add(call)
            updateIncomingCallsUI()
            Toast.makeText(this, "Incoming call from $sourceId!", Toast.LENGTH_SHORT).show()
            Log.i(TAG, "✅ UI updated with incoming call")
        }
        
        // Auto-remove call after 30 seconds if not answered (like website)
        Handler(Looper.getMainLooper()).postDelayed({
            runOnUiThread {
                Log.d(TAG, "⏰ Auto-removing call $callId after 30 seconds")
                incomingCalls.removeAll { it.callId == callId }
                updateIncomingCallsUI()
            }
        }, 30000)
    }
    
    private fun handleCallRouted(data: Any?) {
        Log.d(TAG, "🔍 Call routed data: $data (${data?.javaClass?.simpleName})")
        
        val callId = when (data) {
            is JSONObject -> data.optString("callId")
            is String -> try { JSONObject(data).optString("callId") } catch (e: Exception) { "" }
            is Map<*, *> -> data["callId"]?.toString() ?: ""
            else -> {
                Log.e(TAG, "❌ Invalid data format for call_routed")
                return
            }
        }
        
        runOnUiThread {
            currentCallId = callId
            showCurrentCall("Call routed - Connecting...")
        }
    }
    
    private fun handleOffer(data: Any?) {
        // In a real implementation, this would handle WebRTC offer
        // For now, just simulate connection established
        runOnUiThread {
            showCurrentCall("Connected to Customer")
            startCallTimer()
        }
    }
    
    private fun handleIceCandidate(data: Any?) {
        // WebRTC ICE candidate handling would go here
        Log.d(TAG, "ICE candidate received (WebRTC integration needed)")
    }
    
    private fun handleCallEnded(data: Any?) {
        Log.d(TAG, "🔍 Call ended data: $data (${data?.javaClass?.simpleName})")
        
        val callId: String
        val reason: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId")
                reason = data.optString("reason", "customer_ended")
            }
            is String -> {
                try {
                    val json = JSONObject(data)
                    callId = json.optString("callId")
                    reason = json.optString("reason", "customer_ended")
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Failed to parse call_ended data")
                    return
                }
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                reason = data["reason"]?.toString() ?: "customer_ended"
            }
            else -> {
                Log.e(TAG, "❌ Invalid data format for call_ended")
                return
            }
        }
        
        runOnUiThread {
            if (currentCallId == callId) {
                val duration = if (callStartTime > 0) {
                    ((System.currentTimeMillis() - callStartTime) / 1000).toInt()
                } else 0
                
                addToCallHistory(
                    callId = callId,
                    duration = duration,
                    status = "completed",
                    sourceId = currentCallSourceId ?: "",
                    reason = reason
                )
                
                hideCurrentCall()
            } else {
                // This was an incoming call that we never accepted
                val incomingCall = incomingCalls.find { it.callId == callId }
                if (incomingCall != null) {
                    addToCallHistory(
                        callId = callId,
                        duration = 0,
                        status = "missed", 
                        sourceId = incomingCall.sourceId,
                        reason = reason
                    )
                    
                    incomingCalls.removeAll { it.callId == callId }
                    updateIncomingCallsUI()
                }
            }
        }
    }
    
    private fun handleCallDisconnected(data: Any?) {
        runOnUiThread {
            showError("Call disconnected: $data")
            hideCurrentCall()
        }
    }
    
    private fun handleCallCancelled(data: Any?) {
        Log.d(TAG, "🔍 Call cancelled data: $data (${data?.javaClass?.simpleName})")
        
        val callId: String
        val sourceId: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId")
                sourceId = data.optString("sourceId")
            }
            is String -> {
                try {
                    val json = JSONObject(data)
                    callId = json.optString("callId")
                    sourceId = json.optString("sourceId")
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Failed to parse call_cancelled data")
                    return
                }
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                sourceId = data["sourceId"]?.toString() ?: ""
            }
            else -> {
                Log.e(TAG, "❌ Invalid data format for call_cancelled")
                return
            }
        }
        
        runOnUiThread {
            incomingCalls.removeAll { it.callId == callId }
            updateIncomingCallsUI()
            
            addToCallHistory(
                callId = callId,
                duration = 0,
                status = "cancelled",
                sourceId = sourceId,
                reason = "customer_cancelled"
            )
        }
    }
    
    private fun handleCallRequestCancelled(data: Any?) {
        Log.d(TAG, "🔍 Call request cancelled data: $data (${data?.javaClass?.simpleName})")
        
        val callId: String
        val reason: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId")
                reason = data.optString("reason", "customer_cancelled")
            }
            is String -> {
                try {
                    val json = JSONObject(data)
                    callId = json.optString("callId")
                    reason = json.optString("reason", "customer_cancelled")
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Failed to parse call_request_cancelled data")
                    return
                }
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                reason = data["reason"]?.toString() ?: "customer_cancelled"
            }
            else -> {
                Log.e(TAG, "❌ Invalid data format for call_request_cancelled")
                return
            }
        }
        
        runOnUiThread {
            val cancelledCall = incomingCalls.find { it.callId == callId }
            
            incomingCalls.removeAll { it.callId == callId }
            updateIncomingCallsUI()
            
            cancelledCall?.let {
                addToCallHistory(
                    callId = callId,
                    duration = 0,
                    status = "missed",
                    sourceId = it.sourceId,
                    reason = reason
                )
            }
        }
    }
    
    private fun handleCustomerDisconnected(data: Any?) {
        Log.d(TAG, "🔍 Customer disconnected data: $data (${data?.javaClass?.simpleName})")
        
        val callId = when (data) {
            is JSONObject -> data.optString("callId")
            is String -> try { JSONObject(data).optString("callId") } catch (e: Exception) { "" }
            is Map<*, *> -> data["callId"]?.toString() ?: ""
            else -> {
                Log.e(TAG, "❌ Invalid data format for customer_disconnected")
                return
            }
        }
        
        runOnUiThread {
            incomingCalls.removeAll { it.callId == callId }
            updateIncomingCallsUI()
            
            if (currentCallId == callId) {
                hideCurrentCall()
            }
        }
    }
    
    private fun handleNetworkError(error: Any?) {
        runOnUiThread {
            showError("Network error: $error")
        }
    }
    
    private fun handleCallNoLongerAvailable(data: Any?) {
        Log.d(TAG, "🔍 Call no longer available data: $data (${data?.javaClass?.simpleName})")
        
        val callId = when (data) {
            is JSONObject -> data.optString("callId")
            is String -> try { JSONObject(data).optString("callId") } catch (e: Exception) { "" }
            is Map<*, *> -> data["callId"]?.toString() ?: ""
            else -> {
                Log.e(TAG, "❌ Invalid data format for call_no_longer_available")
                return
            }
        }
        
        runOnUiThread {
            incomingCalls.removeAll { it.callId == callId }
            updateIncomingCallsUI()
            Toast.makeText(this, "Call was accepted by another agent", Toast.LENGTH_SHORT).show()
        }
    }
    
    private fun handleMissedCall(data: Any?) {
        Log.d(TAG, "🔍 Missed call data: $data (${data?.javaClass?.simpleName})")
        
        val callId: String
        val sourceId: String
        val reason: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId")
                sourceId = data.optString("sourceId")
                reason = data.optString("reason", "missed_call")
            }
            is String -> {
                try {
                    val json = JSONObject(data)
                    callId = json.optString("callId")
                    sourceId = json.optString("sourceId")
                    reason = json.optString("reason", "missed_call")
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Failed to parse missed_call data")
                    return
                }
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                sourceId = data["sourceId"]?.toString() ?: ""
                reason = data["reason"]?.toString() ?: "missed_call"
            }
            else -> {
                Log.e(TAG, "❌ Invalid data format for missed_call")
                return
            }
        }
        
        runOnUiThread {
            addToCallHistory(
                callId = callId,
                duration = 0,
                status = "missed",
                sourceId = sourceId,
                reason = reason
            )
            
            incomingCalls.removeAll { it.callId == callId }
            updateIncomingCallsUI()
        }
    }
    
    private fun showCurrentCall(status: String) {
        tvCallStatus.text = status
        tvCallId.text = "Call ID: ${currentCallId?.takeLast(6) ?: "..."}"
        cardCurrentCall.visibility = View.VISIBLE
        
        if (status == "Connected to Customer") {
            cardCallControls.visibility = View.VISIBLE
        }
    }
    
    private fun hideCurrentCall() {
        cardCurrentCall.visibility = View.GONE
        cardCallControls.visibility = View.GONE
        stopCallTimer()
        currentCallId = null
        currentCallSourceId = null
        isMuted = false
        btnMute.text = "Mute"
    }
    
    private fun startCallTimer() {
        callStartTime = System.currentTimeMillis()
        callTimer = Timer()
        callTimer?.scheduleAtFixedRate(object : TimerTask() {
            override fun run() {
                callDuration = ((System.currentTimeMillis() - callStartTime) / 1000).toInt()
                runOnUiThread {
                    val minutes = callDuration / 60
                    val seconds = callDuration % 60
                    tvCallDuration.text = String.format("%02d:%02d", minutes, seconds)
                }
            }
        }, 0, 1000)
    }
    
    private fun stopCallTimer() {
        callTimer?.cancel()
        callTimer = null
        callDuration = 0
        callStartTime = 0
        runOnUiThread {
            tvCallDuration.text = "00:00"
        }
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
    
    private fun addToCallHistory(callId: String, duration: Int, status: String, sourceId: String, reason: String) {
        val item = CallHistoryItem(
            callId = callId,
            timestamp = System.currentTimeMillis(),
            duration = duration,
            status = status,
            sourceId = sourceId,
            reason = reason
        )
        
        callHistory.add(0, item) // Add to beginning
        
        // Keep only last 10 items
        if (callHistory.size > 10) {
            callHistory.removeAt(callHistory.size - 1)
        }
        
        updateCallHistoryUI()
        saveCallHistory()
    }
    
    private fun loadCallHistory() {
        // Load call history from SharedPreferences
        val historyJson = sharedPreferences.getString("call_history_$handle", "[]")
        // Parse JSON and populate callHistory list
        // For now, just update UI
        updateCallHistoryUI()
    }
    
    private fun saveCallHistory() {
        // Save call history to SharedPreferences
        // Convert callHistory to JSON and store
        // Implementation would convert the list to JSON string
    }
    
    private fun showError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}