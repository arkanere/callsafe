package com.callsafe.androidapp

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.callsafe.androidapp.adapters.CallHistoryAdapter
import com.callsafe.androidapp.adapters.IncomingCallsAdapter
import com.callsafe.androidapp.models.CallHistoryItem
import com.callsafe.androidapp.models.IncomingCall
import com.callsafe.androidapp.models.FCMTokenRequest
import com.callsafe.androidapp.network.RetrofitInstance
import com.callsafe.androidapp.network.SocketManager
import com.callsafe.androidapp.service.CallSafeBackgroundService
import com.callsafe.androidapp.utils.PermissionHelper
import com.callsafe.androidapp.utils.RingtonePlayer
import com.callsafe.androidapp.utils.SessionManager
import com.callsafe.androidapp.webrtc.WebRTCManager
import com.google.firebase.messaging.FirebaseMessaging
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textview.MaterialTextView
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.SessionDescription
import java.text.SimpleDateFormat
import java.util.*

class UserReceiveActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "UserReceiveActivity"
        private const val PERMISSION_REQUEST_RECORD_AUDIO = 1001
    }
    
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var sessionManager: SessionManager
    private lateinit var socketManager: SocketManager
    private lateinit var webrtcManager: WebRTCManager
    private lateinit var ringtonePlayer: RingtonePlayer
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
    
    private lateinit var incomingCallsAdapter: IncomingCallsAdapter
    private lateinit var callHistoryAdapter: CallHistoryAdapter
    
    private var handle: String = ""
    private var sourceId: String = ""
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
        sessionManager = SessionManager.getInstance(this)
        socketManager = SocketManager.getInstance()
        webrtcManager = WebRTCManager(this)
        ringtonePlayer = RingtonePlayer(this)
        
        // Check permissions for incoming calls
        checkCallPermissions()
        
        // Check if user has a valid session
        if (!sessionManager.isSessionValid()) {
            Toast.makeText(this, "Session expired. Please login again.", Toast.LENGTH_LONG).show()
            navigateToLogin()
            return
        }
        
        Log.i(TAG, "Starting call receive activity")
        
        initViews()
        setupRecyclerViews() 
        setupClickListeners()
        setupWebRTCListeners()
        setupSocketEventListeners()
        
        // CRITICAL FIX: Request microphone permission before connecting
        checkAndRequestAudioPermission()
        
        // Initialize FCM
        initializeFCM()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Clean up on destroy
        
        // Note: Don't disconnect socket here - background service maintains connection
        // socketManager.goOffline() // Commented out - background service handles this
        
        // Clean up WebRTC
        webrtcManager.dispose()
        
        // Clean up ringtone
        ringtonePlayer.dispose()
        
        // Clean up call timer
        stopCallTimer()
        
        // Note: Don't remove event listeners - background service needs them
        // Event listeners will be managed by the background service
        Log.i(TAG, "🔧 Preserving event listeners for background service")
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
        tvConnectionStatus.text = "Initializing..."
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
            endCall()
        }
    }
    
    private fun setupWebRTCListeners() {
        Log.i(TAG, "🔧 Setting up WebRTC listeners")
        
        // Handle WebRTC answer creation
        webrtcManager.setOnAnswerCreatedListener { answer ->
            Log.i(TAG, "✅ WebRTC answer created, sending to server")
            currentCallId?.let { callId ->
                socketManager.sendAnswer(callId, answer.description, handle, currentCallSourceId)
            }
        }
        
        // Handle ICE candidates
        webrtcManager.setOnIceCandidateListener { candidate ->
            Log.d(TAG, "🧊 Local ICE candidate generated")
            currentCallId?.let { callId ->
                socketManager.sendIceCandidate(callId, candidate, handle, currentCallSourceId)
            }
        }
        
        // Handle connection state changes
        webrtcManager.setOnConnectionStateChangeListener { state ->
            Log.i(TAG, "🔌 WebRTC connection state: $state")
            runOnUiThread {
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        showCurrentCall("Connected to Customer")
                        startCallTimer()
                        Log.i(TAG, "✅ WebRTC connection established")
                    }
                    PeerConnection.PeerConnectionState.DISCONNECTED,
                    PeerConnection.PeerConnectionState.FAILED -> {
                        Log.w(TAG, "⚠️ WebRTC connection lost")
                        // Don't show "Connection Lost" - the call_ended event will handle UI cleanup properly
                        // Showing "Connection Lost" creates confusion when calls end normally
                    }
                    PeerConnection.PeerConnectionState.CONNECTING -> {
                        showCurrentCall("Connecting...")
                    }
                    else -> {
                        Log.d(TAG, "🔄 WebRTC state: $state")
                    }
                }
            }
        }
        
        // Handle remote audio
        webrtcManager.setOnRemoteAudioTrackListener { audioTrack ->
            Log.i(TAG, "🔊 Remote audio track received")
            runOnUiThread {
                Toast.makeText(this, "Audio connected!", Toast.LENGTH_SHORT).show()
            }
        }
        
        // Handle WebRTC state changes for server synchronization
        webrtcManager.setOnWebRTCStateChangeListener { state, reason ->
            Log.i(TAG, "📡 WebRTC state change: $state, reason: $reason")
            currentCallId?.let { callId ->
                when (state) {
                    "webrtc_connected" -> {
                        socketManager.emitWebRTCConnected(callId, handle, currentCallSourceId)
                    }
                    "webrtc_failed" -> {
                        socketManager.emitWebRTCFailed(callId, handle, currentCallSourceId, reason)
                    }
                    "webrtc_disconnected" -> {
                        socketManager.emitWebRTCDisconnected(callId, handle, currentCallSourceId, reason)
                    }
                }
            }
        }
        
        Log.i(TAG, "✅ WebRTC listeners configured")
    }
    
    // CRITICAL FIX: Check and request microphone permission
    private fun checkAndRequestAudioPermission() {
        Log.d(TAG, "🎤 Checking microphone permission")
        
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            
            Log.w(TAG, "⚠️ Microphone permission not granted, requesting...")
            
            if (ActivityCompat.shouldShowRequestPermissionRationale(this, Manifest.permission.RECORD_AUDIO)) {
                // Show explanation to user
                Toast.makeText(this, 
                    "Microphone permission is required for voice calls. Please grant the permission.", 
                    Toast.LENGTH_LONG).show()
            }
            
            // Request the permission
            ActivityCompat.requestPermissions(this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                PERMISSION_REQUEST_RECORD_AUDIO)
        } else {
            Log.i(TAG, "✅ Microphone permission already granted")
            // Permission already granted, proceed with setup
            loadCachedDataAndConnect()
        }
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int, 
        permissions: Array<out String>, 
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        when (requestCode) {
            PERMISSION_REQUEST_RECORD_AUDIO -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Log.i(TAG, "✅ Microphone permission granted by user")
                    Toast.makeText(this, "Microphone permission granted", Toast.LENGTH_SHORT).show()
                    // Permission granted, proceed with setup
                    loadCachedDataAndConnect()
                } else {
                    Log.e(TAG, "❌ Microphone permission denied by user")
                    Toast.makeText(this, 
                        "Microphone permission is required for voice calls. Please enable it in Settings.", 
                        Toast.LENGTH_LONG).show()
                    
                    // Could optionally finish the activity or disable call functionality
                    // For now, still try to connect but warn user
                    loadCachedDataAndConnect()
                }
            }
        }
    }
    
    private fun loadCachedDataAndConnect() {
        // Load all data from cache - no API calls needed!
        val user = sessionManager.getUser()
        val userHandle = sessionManager.getUserHandle()
        val userSourceId = sessionManager.getSourceId()
        
        if (user == null || userHandle == null) {
            Log.e(TAG, "Cached data is invalid, redirecting to login")
            Toast.makeText(this, "Session data corrupted. Please login again.", Toast.LENGTH_LONG).show()
            sessionManager.clearSession()
            navigateToLogin()
            return
        }
        
        Log.i(TAG, "Using cached data - User: ${user.name}, Handle: $userHandle, Session age: ${sessionManager.getSessionAgeInDays()} days")
        
        // Set handle from cached data
        handle = userHandle
        sourceId = userSourceId ?: ""
        
        // Set FCM token in SocketManager if available
        val cachedFCMToken = sessionManager.getFCMToken()
        if (cachedFCMToken != null) {
            Log.i(TAG, "📱 Setting cached FCM token in SocketManager: ${cachedFCMToken.take(20)}...")
            socketManager.setFCMToken(cachedFCMToken)
        }
        
        // Load call history from local storage
        loadCallHistory()
        
        // Start background service for always-on connectivity
        startBackgroundService()
        
        // Wait for background service to establish connection instead of creating duplicate
        tvConnectionStatus.text = "Starting background service..."
        
        // Check if already connected via background service
        Handler(Looper.getMainLooper()).postDelayed({
            checkBackgroundServiceConnection()
        }, 2000)
        
        // Timeout fallback - if still connecting after 15 seconds, force reconnect
        Handler(Looper.getMainLooper()).postDelayed({
            if (tvConnectionStatus.text.toString().contains("connecting") || 
                tvConnectionStatus.text.toString().contains("Connecting") ||
                tvConnectionStatus.text.toString().contains("Please wait")) {
                Log.w(TAG, "⚠️ Connection timeout - forcing reconnect")
                tvConnectionStatus.text = "Connection timeout - retrying..."
                
                // Force disconnect and reconnect
                socketManager.disconnect()
                Handler(Looper.getMainLooper()).postDelayed({
                    connectToServer()
                }, 1000)
            }
        }, 15000)
    }
    
    private fun checkBackgroundServiceConnection() {
        // Check if SocketManager is already connected (via background service)
        if (socketManager.isConnected()) {
            Log.i(TAG, "✅ Background service already connected")
            tvConnectionStatus.text = "Connected via background service"
            isConnected = true
            
            // DON'T call goOnlineWithHandle() here - background service already did it
            // Just update UI to ready state
            tvConnectionStatus.text = "Ready to receive calls"
        } else {
            Log.i(TAG, "⚠️ Background service not connected yet, waiting...")
            tvConnectionStatus.text = "Background service connecting..."
            
            // Wait a bit longer and check again, or fall back to direct connection
            Handler(Looper.getMainLooper()).postDelayed({
                if (socketManager.isConnected()) {
                    Log.i(TAG, "✅ Background service connected while waiting")
                    tvConnectionStatus.text = "Ready to receive calls"
                    isConnected = true
                } else {
                    Log.i(TAG, "⚠️ Background service still not ready, creating fallback connection")
                    connectToServer()
                }
            }, 3000)
        }
    }
    
    private fun navigateToLogin() {
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
    
    private fun logout() {
        // Clear session using SessionManager
        sessionManager.clearSession()
        
        // Also clear old SharedPreferences for backward compatibility
        with(sharedPreferences.edit()) {
            clear()
            apply()
        }
        
        Toast.makeText(this, "Logged out successfully", Toast.LENGTH_SHORT).show()
        navigateToLogin()
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
                showError("Lost connection to server. Please try again.")
            }
        }
        
        socketManager.on("call_no_longer_available") { data ->
            Log.d(TAG, "📞 Call no longer available: $data")
            handleCallNoLongerAvailable(data)
        }
        
        socketManager.on("agent_registered") { data ->
            Log.i(TAG, "✅ AGENT REGISTERED - Ready for calls (from background service)")
            runOnUiThread {
                tvConnectionStatus.text = "Ready to receive calls"
                isConnected = true
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
                    
                    // Automatically connect with handle
                    Handler(Looper.getMainLooper()).postDelayed({
                        goOnlineWithHandle()
                    }, 1000)
                    
                } else {
                    Log.e(TAG, "Connection failed: $error")
                    tvConnectionStatus.text = "Connection failed"
                    isConnected = false
                    showError("Failed to connect to server: $error")
                }
            }
        }
    }
    
    
    private fun goOnlineWithHandle() {
        Log.i(TAG, "Connecting with handle: $handle")
        socketManager.goOnlineWithHandle(handle, sourceId.takeIf { it.isNotEmpty() })
        tvConnectionStatus.text = "Connecting - Please wait..."
    }
    
    private fun startBackgroundService() {
        Log.i(TAG, "🚀 Starting CallSafe background service")
        
        // Request battery optimization exemption for reliable background operation
        requestBatteryOptimizationExemption()
        
        try {
            CallSafeBackgroundService.startService(this)
            tvConnectionStatus.text = "Background service started - Ready for calls"
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start background service", e)
            tvConnectionStatus.text = "Failed to start background service"
        }
    }
    
    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val packageName = packageName
            
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                Log.i(TAG, "🔋 Requesting battery optimization exemption")
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ Could not request battery optimization exemption", e)
                    // Fallback: Open battery optimization settings
                    try {
                        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                        startActivity(intent)
                    } catch (e2: Exception) {
                        Log.w(TAG, "⚠️ Could not open battery optimization settings", e2)
                    }
                }
            } else {
                Log.i(TAG, "✅ Battery optimization already disabled")
            }
        }
    }
    
    
    private fun acceptCall(callId: String) {
        Log.d(TAG, "=== ACCEPT CALL CLICKED ===")
        Log.d(TAG, "Call ID: $callId")
        
        // Stop ringtone when call is accepted
        ringtonePlayer.stopRinging()
        Log.d(TAG, "🔇 Ringtone stopped - call accepted")
        
        if (!isConnected) {
            Log.w(TAG, "Agent not connected, cannot accept call")
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
        
        // Stop ringtone when call is declined
        ringtonePlayer.stopRinging()
        Log.d(TAG, "🔇 Ringtone stopped - call declined")
        
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
            
            // End WebRTC call first
            webrtcManager.endCall()
            
            // Notify server
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
        
        // Use WebRTC to actually mute/unmute
        webrtcManager.setMuted(isMuted)
        
        Log.d(TAG, "🔇 Audio ${if (isMuted) "muted" else "unmuted"}")
        Toast.makeText(this, if (isMuted) "Microphone muted" else "Microphone unmuted", Toast.LENGTH_SHORT).show()
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
            
            // Start playing ringtone for incoming call
            ringtonePlayer.startRinging()
            Log.i(TAG, "🔔 Ringtone started for incoming call")
            
            Toast.makeText(this, "Incoming call from $sourceId!", Toast.LENGTH_SHORT).show()
            Log.i(TAG, "✅ UI updated with incoming call")
        }
        
        // Auto-remove call after 30 seconds if not answered (like website)
        Handler(Looper.getMainLooper()).postDelayed({
            runOnUiThread {
                Log.d(TAG, "⏰ Auto-removing call $callId after 30 seconds")
                // Stop ringtone if call times out
                if (incomingCalls.any { it.callId == callId }) {
                    ringtonePlayer.stopRinging()
                    Log.d(TAG, "🔇 Ringtone stopped - call timed out")
                }
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
            // Stop ringtone when call is routed (call is now being processed)
            if (incomingCalls.any { it.callId == callId }) {
                ringtonePlayer.stopRinging()
                Log.d(TAG, "🔇 Ringtone stopped - call routed")
            }
            
            // Remove from incoming calls list since call is now being processed
            incomingCalls.removeAll { it.callId == callId }
            updateIncomingCallsUI()
            
            currentCallId = callId
            showCurrentCall("Call routed - Connecting...")
        }
    }
    
    private fun handleOffer(data: Any?) {
        Log.i(TAG, "📥 Handling WebRTC offer")
        
        // Extract offer data - EXACTLY like website does
        val callId: String
        val offerSdp: String
        val offerType: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId", "")
                val offerObj = data.optJSONObject("offer")
                offerSdp = offerObj?.optString("sdp", "") ?: ""
                offerType = offerObj?.optString("type", "offer") ?: "offer"
                Log.i(TAG, "📋 JSON: callId=$callId, SDP length=${offerSdp.length}, type=$offerType")
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                val offerObj = data["offer"] as? Map<*, *>
                offerSdp = offerObj?.get("sdp")?.toString() ?: ""
                offerType = offerObj?.get("type")?.toString() ?: "offer"
                Log.i(TAG, "📋 Map: callId=$callId, SDP length=${offerSdp.length}, type=$offerType")
            }
            else -> {
                Log.e(TAG, "❌ Invalid offer data format: ${data?.javaClass}")
                return
            }
        }
        
        // Validate required data
        if (callId.isEmpty() || offerSdp.isEmpty()) {
            Log.e(TAG, "❌ Missing required data - callId: '$callId', SDP length: ${offerSdp.length}")
            return
        }
        
        // Validate call ID matches current call
        if (currentCallId != callId) {
            Log.e(TAG, "❌ Call ID mismatch - expected: $currentCallId, got: $callId")
            return
        }
        
        Log.i(TAG, "✅ Processing WebRTC offer for callId: $callId")
        
        // CRITICAL CHECK: Verify microphone permission before proceeding
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "❌ Cannot process WebRTC offer - microphone permission not granted")
            Toast.makeText(this, "Cannot start call - microphone permission required", Toast.LENGTH_LONG).show()
            return
        }
        
        // Create WebRTC offer object
        val offer = SessionDescription(SessionDescription.Type.OFFER, offerSdp)
        
        // Process offer and create answer using WebRTCManager
        val answer = webrtcManager.createAnswer(callId, offer)
        
        // Update UI to show connecting state
        runOnUiThread {
            showCurrentCall("Creating Answer...")
            Log.i(TAG, "📤 WebRTC offer being processed, answer will be sent automatically")
        }
    }
    
    private fun handleIceCandidate(data: Any?) {
        Log.d(TAG, "🧊 Handling ICE candidate")
        
        // Extract ICE candidate data
        val callId: String
        val candidateData: String
        val sdpMid: String
        val sdpMLineIndex: Int
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId", "")
                val candidateObj = data.optJSONObject("candidate")
                candidateData = candidateObj?.optString("candidate", "") ?: ""
                sdpMid = candidateObj?.optString("sdpMid", "") ?: ""
                sdpMLineIndex = candidateObj?.optInt("sdpMLineIndex", 0) ?: 0
                Log.d(TAG, "📋 JSON ICE: callId=$callId, candidate=${candidateData.take(50)}...")
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                val candidateObj = data["candidate"] as? Map<*, *>
                candidateData = candidateObj?.get("candidate")?.toString() ?: ""
                sdpMid = candidateObj?.get("sdpMid")?.toString() ?: ""
                sdpMLineIndex = candidateObj?.get("sdpMLineIndex")?.toString()?.toIntOrNull() ?: 0
                Log.d(TAG, "📋 Map ICE: callId=$callId, candidate=${candidateData.take(50)}...")
            }
            else -> {
                Log.e(TAG, "❌ Invalid ICE candidate data format: ${data?.javaClass}")
                return
            }
        }
        
        // Validate required data
        if (callId.isEmpty() || candidateData.isEmpty()) {
            Log.e(TAG, "❌ Missing ICE candidate data - callId: '$callId', candidate length: ${candidateData.length}")
            return
        }
        
        // Validate call ID matches current call
        if (currentCallId != callId) {
            Log.e(TAG, "❌ ICE candidate call ID mismatch - expected: $currentCallId, got: $callId")
            return
        }
        
        Log.d(TAG, "✅ Adding ICE candidate for callId: $callId")
        
        try {
            // Create WebRTC ICE candidate
            val iceCandidate = IceCandidate(sdpMid, sdpMLineIndex, candidateData)
            
            // Add to WebRTC manager
            webrtcManager.addIceCandidate(iceCandidate)
            
            Log.d(TAG, "✅ ICE candidate added successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to add ICE candidate", e)
        }
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
                
                // Also remove from incoming calls list to prevent "Connection Lost" state
                incomingCalls.removeAll { it.callId == callId }
                updateIncomingCallsUI()
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
            // Stop ringtone if call is cancelled
            if (incomingCalls.any { it.callId == callId }) {
                ringtonePlayer.stopRinging()
                Log.d(TAG, "🔇 Ringtone stopped - call cancelled")
            }
            
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
        
        var callId: String = ""
        var callAttemptId: String = ""
        var sourceId: String = ""
        var reason: String = "customer_cancelled"
        
        // Parse cancellation data with callAttemptId support
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId", "")
                callAttemptId = data.optString("callAttemptId", "")
                sourceId = data.optString("sourceId", "")
                reason = data.optString("reason", "customer_cancelled")
            }
            is String -> {
                try {
                    val json = JSONObject(data)
                    callId = json.optString("callId", "")
                    callAttemptId = json.optString("callAttemptId", "")
                    sourceId = json.optString("sourceId", "")
                    reason = json.optString("reason", "customer_cancelled")
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Failed to parse call_request_cancelled data")
                    return
                }
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                callAttemptId = data["callAttemptId"]?.toString() ?: ""
                sourceId = data["sourceId"]?.toString() ?: ""
                reason = data["reason"]?.toString() ?: "customer_cancelled"
            }
            else -> {
                Log.e(TAG, "❌ Invalid data format for call_request_cancelled")
                return
            }
        }
        
        Log.d(TAG, "📞 Parsed cancellation data - callId: $callId, callAttemptId: $callAttemptId, sourceId: $sourceId, reason: $reason")
        
        runOnUiThread {
            var cancelledCall: IncomingCall? = null
            var matchMethod = "none"
            
            // METHOD 1: Try callId first (most reliable)
            if (callId.isNotEmpty()) {
                cancelledCall = incomingCalls.find { it.callId == callId }
                if (cancelledCall != null) {
                    matchMethod = "callId"
                    Log.d(TAG, "📞 Found call by callId: $callId")
                } else {
                    Log.d(TAG, "📞 CallId not found in incoming calls: $callId")
                }
            }
            
            // METHOD 2: Fallback to sourceId matching (less reliable)
            if (cancelledCall == null && sourceId.isNotEmpty()) {
                val matchingCalls = incomingCalls.filter { it.sourceId == sourceId }
                Log.d(TAG, "📞 Found ${matchingCalls.size} calls with sourceId: $sourceId")
                
                when (matchingCalls.size) {
                    1 -> {
                        cancelledCall = matchingCalls[0]
                        matchMethod = "sourceId_single"
                        Log.d(TAG, "📞 Single sourceId match found: ${cancelledCall.callId}")
                    }
                    in 2..Int.MAX_VALUE -> {
                        // Multiple matches - use most recent
                        cancelledCall = matchingCalls.maxByOrNull { it.timestamp }
                        matchMethod = "sourceId_multiple"
                        Log.w(TAG, "📞 Multiple sourceId matches! Using most recent: ${cancelledCall?.callId}")
                        Log.w(TAG, "⚠️ This may cancel wrong call if multiple users have same sourceId!")
                    }
                    else -> {
                        Log.e(TAG, "📞 No calls found with sourceId: $sourceId")
                    }
                }
            }
            
            // Handle cancellation
            if (cancelledCall != null) {
                Log.d(TAG, "📞 Cancelling call using method: $matchMethod, call: ${cancelledCall.callId}")
                
                // Stop ringtone if call request is cancelled
                ringtonePlayer.stopRinging()
                Log.d(TAG, "🔇 Ringtone stopped - call request cancelled")
                
                // Remove from incoming calls
                incomingCalls.removeAll { it.callId == cancelledCall.callId }
                updateIncomingCallsUI()
                
                // Add to call history
                addToCallHistory(
                    callId = cancelledCall.callId,
                    duration = 0,
                    status = "missed",
                    sourceId = cancelledCall.sourceId,
                    reason = reason
                )
                
                Log.d(TAG, "✅ Call request cancellation handled successfully via $matchMethod")
            } else {
                Log.e(TAG, "⚠️ Could not find cancelled call in incoming calls list")
                Log.e(TAG, "Provided - callId: $callId, callAttemptId: $callAttemptId, sourceId: $sourceId")
                Log.e(TAG, "Current incoming calls: ${incomingCalls.map { "callId=${it.callId}, sourceId=${it.sourceId}" }}")
                
                // Still stop ringtone as a safety measure if no incoming calls remain
                if (incomingCalls.isEmpty()) {
                    Log.d(TAG, "🔇 No incoming calls remaining - stopping ringtone as safety measure")
                    ringtonePlayer.stopRinging()
                }
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
            // Stop ringtone if call is no longer available
            if (incomingCalls.any { it.callId == callId }) {
                ringtonePlayer.stopRinging()
                Log.d(TAG, "🔇 Ringtone stopped - call no longer available")
            }
            
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
            // Stop ringtone when call is missed
            if (incomingCalls.any { it.callId == callId }) {
                ringtonePlayer.stopRinging()
                Log.d(TAG, "🔇 Ringtone stopped - call missed")
            }
            
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
    
    // Initialize Firebase Cloud Messaging
    private fun initializeFCM() {
        Log.i(TAG, "🔥 Initializing Firebase Cloud Messaging")
        
        // Enable auto-initialization
        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        
        // Get FCM token
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w(TAG, "❌ Fetching FCM registration token failed", task.exception)
                return@addOnCompleteListener
            }
            
            // Get new FCM registration token
            val token = task.result
            Log.i(TAG, "🎯 FCM Token received: ${token.take(20)}...")
            
            // Save token locally
            sessionManager.saveFCMToken(token)
            
            // Set token in SocketManager for modern registration
            socketManager.setFCMToken(token)
            
            // Send token to server
            sendFCMTokenToServer(token)
        }
        
        Log.i(TAG, "✅ FCM initialization completed")
    }
    
    private fun sendFCMTokenToServer(token: String) {
        Log.i(TAG, "📤 Sending FCM token to server")
        
        val userHandle = sessionManager.getUserHandle()
        val sourceId = sessionManager.getSourceId()
        
        if (userHandle == null) {
            Log.w(TAG, "⚠️ Cannot send FCM token - no user handle available")
            return
        }
        
        Log.i(TAG, "📤 FCM Token: ${token.take(20)}... for handle: $userHandle")
        
        // Send FCM token to server via API
        lifecycleScope.launch {
            try {
                val request = FCMTokenRequest(
                    handle = userHandle,
                    fcmToken = token,
                    platform = "android",
                    sourceId = sourceId
                )
                
                val signalingApiService = RetrofitInstance.signalingApi
                val response = signalingApiService.updateFCMToken(request)
                
                if (response.isSuccessful) {
                    Log.i(TAG, "✅ FCM token sent to server successfully")
                    val responseBody = response.body()
                    Log.i(TAG, "📋 Server response: ${responseBody?.message}")
                } else {
                    Log.e(TAG, "❌ Failed to send FCM token: ${response.code()} - ${response.message()}")
                    val errorBody = response.errorBody()?.string()
                    Log.e(TAG, "❌ Error details: $errorBody")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error sending FCM token to server", e)
                // Don't show error to user - this is a background operation
            }
        }
    }
    
    private fun checkCallPermissions() {
        Log.i(TAG, "🔍 Checking call permissions")
        
        // Log current permission status
        PermissionHelper.logPermissionStatus(this)
        
        // Check if full-screen notifications are enabled
        if (!PermissionHelper.canUseFullScreenIntent(this)) {
            Log.w(TAG, "⚠️ Full-screen notifications not enabled")
            val message = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                "To receive incoming calls when the app is closed, please enable 'Display over other apps' permission in Settings."
            } else {
                "To receive incoming calls when the app is closed, please ensure notifications are enabled in Settings."
            }
            showPermissionDialog(
                "Enable Call Notifications",
                message,
                "Open Settings"
            ) {
                PermissionHelper.openFullScreenIntentSettings(this)
            }
            return
        }
        
        // Check if notifications are enabled
        if (!PermissionHelper.canShowNotifications(this)) {
            Log.w(TAG, "⚠️ Notifications not enabled")
            showPermissionDialog(
                "Enable Notifications",
                "CallSafe needs notification permissions to show incoming calls.",
                "Open Settings"
            ) {
                PermissionHelper.openNotificationSettings(this)
            }
            return
        }
        
        // Check if overlay permission is granted (helpful but not critical)
        if (!PermissionHelper.canDrawOverlays(this)) {
            Log.w(TAG, "⚠️ Overlay permission not granted - may affect call display")
        }
        
        Log.i(TAG, "✅ All critical permissions are granted")
    }
    
    private fun showPermissionDialog(title: String, message: String, buttonText: String, onAction: () -> Unit) {
        runOnUiThread {
            androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton(buttonText) { _, _ ->
                    onAction()
                }
                .setNegativeButton("Later") { dialog, _ ->
                    dialog.dismiss()
                }
                .setCancelable(false)
                .show()
        }
    }
}