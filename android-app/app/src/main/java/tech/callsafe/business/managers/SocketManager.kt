package tech.callsafe.business.managers

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription
import tech.callsafe.business.activities.LoginActivity
import tech.callsafe.business.protocol.Protocol
import tech.callsafe.business.utils.RingtoneManager
import tech.callsafe.business.utils.getUniqueDeviceId

class SocketManager private constructor(private val context: Context) {
    private var socket: Socket? = null
    private val authManager: AuthenticationManager = AuthenticationManager(context)
    private val callHistoryManager: CallHistoryManager = CallHistoryManager(context)
    
    // Connection state tracking (like widget's pattern)
    private var isSocketConnected = false
    private val messageQueue = mutableListOf<QueuedMessage>()
    
    // Data class for queued messages
    private data class QueuedMessage(
        val eventName: String,
        val data: JSONObject,
        val timestamp: Long
    )
    
    // Token validation components
    private val tokenValidationHandler = Handler(Looper.getMainLooper())
    private var tokenValidationRunnable: Runnable? = null
    private val TOKEN_VALIDATION_INTERVAL = 24 * 60 * 60 * 1000L // 24 hours in milliseconds
    
    // WebRTC event listener interface for communication with active call
    interface WebRTCEventListener {
        fun onWebRTCOffer(callAttemptId: String, offer: SessionDescription)
        fun onWebRTCIceCandidate(callAttemptId: String, candidate: IceCandidate)
    }
    
    // Call event listener interface for call lifecycle notifications
    interface CallEventListener {
        fun onCallEnded(callAttemptId: String, duration: Int, reason: String?)
        fun onCallFailed(callAttemptId: String, reason: String)
        fun onCallCancelled(callAttemptId: String, reason: String)
    }
    
    private var webrtcEventListener: WebRTCEventListener? = null
    private var callEventListener: CallEventListener? = null
    
    // Call tracking for history
    private val activeCallsData = mutableMapOf<String, CallData>()
    
    private data class CallData(
        val callAttemptId: String,
        val sourceId: String,
        val startTime: Long,
        var acceptedTime: Long? = null
    )
    
    companion object {
        private const val TAG = "SocketManager"
        @Volatile
        private var INSTANCE: SocketManager? = null
        
        fun getInstance(context: Context): SocketManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SocketManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    fun connect(): Boolean {
        Log.d(TAG, "[SOCKET] connect() called")
        val token = authManager.getStoredToken()
        if (token == null) {
            Log.w(TAG, "[SOCKET] No valid token found, cannot connect")
            return false
        }
        
        // If already connected, return true
        if (socket?.connected() == true) {
            Log.d(TAG, "[SOCKET] Already connected")
            return true
        }
        
        Log.d(TAG, "[SOCKET] Creating socket with token: [PRESENT]")
        val options = IO.Options().apply {
            auth = mapOf("token" to token)
            transports = arrayOf("websocket", "polling")
            timeout = 30000 // 30-second timeout for consistency
            forceNew = true
        }
        
        Log.d(TAG, "[SOCKET] Initializing socket connection to wss://tunnel.callsafe.tech")
        socket = IO.socket("wss://tunnel.callsafe.tech", options)
        
        socket?.apply {
            on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "[SOCKET] Connected successfully")
                isSocketConnected = true
                // Flush any queued messages (like widget pattern)
                flushMessageQueue()
                // Register device for call reception
                registerDevice()
                // Start periodic token validation after successful connection
                startTokenValidation()
            }
            
            on(Socket.EVENT_DISCONNECT) { args ->
                Log.w(TAG, "[SOCKET] Disconnected: ${args[0]}")
                isSocketConnected = false
                // Cold start design - stay disconnected after call ends
                Log.d(TAG, "[SOCKET] Staying disconnected for cold start behavior")
            }
            
            on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e(TAG, "[SOCKET] Connection error: ${args[0]}")
                val error = args[0]
                val exception = if (error is Exception) error else Exception(error.toString())
                handleConnectionError(exception)
            }
            
            Log.d(TAG, "[SOCKET] Setting up event handlers")
            setupEventHandlers()
            
            Log.d(TAG, "[SOCKET] Starting connection")
            connect()
        }
        
        return true
    }
    
    private fun registerDevice() {
        Log.d(TAG, "[SOCKET] registerDevice() called")
        val deviceId = getUniqueDeviceId(context)
        val fcmToken = getFCMToken()

        Log.d(TAG, "[SOCKET] Device registration - deviceId: $deviceId, fcmToken: ${if (fcmToken != null) "[PRESENT]" else "[NULL]"}, protocol: ${Protocol.VERSION}")

        val deviceConnectEvent = JSONObject().apply {
            put("type", Protocol.MessageTypes.DEVICE_CONNECT)
            put("deviceType", Protocol.DeviceType.MOBILE.value)
            put("deviceId", deviceId)
            put("pushToken", fcmToken)
            put("protocolVersion", Protocol.VERSION)
            put("timestamp", System.currentTimeMillis())
            // Note: handle comes from JWT token in auth, not event data
        }

        Log.d(TAG, "[SOCKET] Emitting ${Protocol.MessageTypes.DEVICE_CONNECT} event with protocol version ${Protocol.VERSION}")
        socket?.emit(Protocol.MessageTypes.DEVICE_CONNECT, deviceConnectEvent)

        // Immediately send device status as 'available' (matching web client behavior)
        Log.d(TAG, "[SOCKET] Sending initial device status to match web client")
        val statusData = JSONObject().apply {
            put("deviceId", deviceId)
            put("status", Protocol.DeviceStatus.AVAILABLE.value)
            put("timestamp", System.currentTimeMillis())
        }
        socket?.emit(Protocol.MessageTypes.DEVICE_STATUS, statusData)
        Log.d(TAG, "[SOCKET] Initial device status sent - device should now be available for calls")
    }
    
    private fun setupEventHandlers() {
        Log.d(TAG, "[SOCKET] Setting up event handlers")
        // Incoming call handler
        socket?.on(Protocol.MessageTypes.CALL_INCOMING) { args ->
            Log.d(TAG, "[SOCKET] Received call:incoming event")
            Log.d(TAG, "=== ANDROID INCOMING CALL DATA FORMAT ===")
            Log.d(TAG, "[SOCKET] Args array length: ${args.size}")
            Log.d(TAG, "[SOCKET] Raw args content: ${args.contentToString()}")
            val data = args[0] as JSONObject
            Log.d(TAG, "[SOCKET] Parsed JSON data: ${data}")
            Log.d(TAG, "[SOCKET] Data keys: ${data.keys().asSequence().toList()}")
            Log.d(TAG, "[SOCKET] Data toString: ${data.toString()}")
            Log.d(TAG, "[SOCKET] Data pretty JSON: ${data.toString(2)}")
            Log.d(TAG, "=== END ANDROID INCOMING CALL DATA ===")
            Log.d(TAG, "[SOCKET] Incoming call data: ${data}")
            handleIncomingCall(
                callAttemptId = data.getString("callAttemptId"),
                sourceId = data.getString("sourceId"),
                timestamp = data.getLong("timestamp")
            )
        }
        
        // Call cancelled handler
        socket?.on(Protocol.MessageTypes.CALL_CANCELLED) { args ->
            Log.d(TAG, "[SOCKET] Received call:cancelled event")
            val data = args[0] as JSONObject
            Log.d(TAG, "[SOCKET] Call cancelled data: ${data}")
            handleCallCancelled(
                callAttemptId = data.getString("callAttemptId"),
                reason = data.getString("reason")
            )
        }
        
        // Call ended handler
        socket?.on(Protocol.MessageTypes.CALL_ENDED) { args ->
            Log.d(TAG, "[SOCKET] Received call:ended event")
            val data = args[0] as JSONObject
            Log.d(TAG, "[SOCKET] Call ended data: ${data}")
            handleCallEnded(
                callAttemptId = data.getString("callAttemptId"),
                duration = data.getInt("duration"),
                reason = data.optString("reason")
            )
        }
        
        // Call failed handler (for server-side timeout and technical failures)
        socket?.on(Protocol.MessageTypes.CALL_FAILED) { args ->
            Log.d(TAG, "[SOCKET] Received call:failed event")
            val data = args[0] as JSONObject
            Log.d(TAG, "[SOCKET] Call failed data: ${data}")
            handleCallFailed(
                callAttemptId = data.getString("callAttemptId"),
                reason = data.getString("reason")
            )
        }
        
        // WebRTC events
        socket?.on(Protocol.MessageTypes.WEBRTC_OFFER) { args ->
            Log.d(TAG, "[SOCKET] Received webrtc:offer event")
            val data = args[0] as JSONObject
            Log.d(TAG, "[SOCKET] WebRTC offer data: ${data}")
            handleWebRTCOffer(data)
        }
        
        socket?.on(Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE) { args ->
            Log.d(TAG, "[SOCKET] Received webrtc:ice-candidate event")
            val data = args[0] as JSONObject
            Log.d(TAG, "[SOCKET] WebRTC ICE candidate data: ${data}")
            handleWebRTCIceCandidate(data)
        }
        
        // Error handling
        socket?.on(Protocol.MessageTypes.ERROR) { args ->
            Log.e(TAG, "[SOCKET] Received error event")
            val error = args[0] as JSONObject
            Log.e(TAG, "[SOCKET] Server error: ${error}")
            handleServerError(error)
        }
        
        // Test handler to ensure we're listening properly
        socket?.on("test") { args ->
            Log.d(TAG, "[SOCKET] TEST event received: ${args.contentToString()}")
        }
        
        // Handler for any events we might have missed
        socket?.on("call") { args ->
            Log.d(TAG, "[SOCKET] Generic 'call' event received: ${args.contentToString()}")
        }
        
        socket?.on("incoming") { args ->
            Log.d(TAG, "[SOCKET] Generic 'incoming' event received: ${args.contentToString()}")
        }
        
        Log.d(TAG, "[SOCKET] Event handlers setup complete")
    }
    
    fun emit(eventType: String, data: JSONObject) {
        if (socket?.connected() == true && isSocketConnected) {
            Log.d(TAG, "[SOCKET] Sending message immediately: $eventType")
            socket!!.emit(eventType, data)
        } else {
            Log.d(TAG, "[SOCKET] Queueing message - socket not connected: $eventType")
            messageQueue.add(QueuedMessage(eventType, data, System.currentTimeMillis()))
            
            // For critical events like call:reject, attempt immediate reconnection
            if (eventType == Protocol.MessageTypes.CALL_REJECT ||
                eventType == Protocol.MessageTypes.CALL_ACCEPT ||
                eventType == Protocol.MessageTypes.CALL_END) {
                Log.d(TAG, "[SOCKET] Critical event queued, attempting immediate reconnection")
                attemptImmediateReconnection()
            }
        }
    }
    
    /**
     * Flush queued messages when socket reconnects (like widget pattern)
     */
    private fun flushMessageQueue() {
        if (messageQueue.isEmpty()) return
        
        Log.d(TAG, "[SOCKET] Flushing ${messageQueue.size} queued messages")
        
        val iterator = messageQueue.iterator()
        while (iterator.hasNext()) {
            val message = iterator.next()
            val queuedDuration = System.currentTimeMillis() - message.timestamp
            Log.d(TAG, "[SOCKET] Sending queued message: ${message.eventName} (queued for ${queuedDuration}ms)")
            socket?.emit(message.eventName, message.data)
            iterator.remove()
        }
        
        Log.d(TAG, "[SOCKET] Message queue flushed successfully")
    }
    
    /**
     * Attempt immediate reconnection for critical events
     */
    private fun attemptImmediateReconnection() {
        Log.d(TAG, "[SOCKET] attemptImmediateReconnection() called")
        
        if (isSocketConnected) {
            Log.d(TAG, "[SOCKET] Already connected, no need to reconnect")
            return
        }
        
        val token = authManager.getStoredToken()
        if (token == null) {
            Log.w(TAG, "[SOCKET] No valid token for immediate reconnection")
            return
        }
        
        Log.d(TAG, "[SOCKET] Attempting immediate reconnection for critical event")
        connect()
    }

    fun disconnect() {
        Log.d(TAG, "[SOCKET] disconnect() called")
        // Stop token validation when disconnecting
        stopTokenValidation()
        isSocketConnected = false
        // Clear message queue on explicit disconnect
        if (messageQueue.isNotEmpty()) {
            Log.d(TAG, "[SOCKET] Clearing ${messageQueue.size} queued messages on disconnect")
            messageQueue.clear()
        }
        socket?.disconnect()
        socket = null
        Log.d(TAG, "[SOCKET] Socket disconnected and cleared")
    }
    
    fun isConnected(): Boolean {
        return socket?.connected() == true && isSocketConnected
    }
    
    fun setWebRTCEventListener(listener: WebRTCEventListener?) {
        webrtcEventListener = listener
    }
    
    fun setCallEventListener(listener: CallEventListener?) {
        callEventListener = listener
    }
    
    fun markCallAccepted(callAttemptId: String) {
        Log.d(TAG, "[SOCKET] markCallAccepted() - ENTRY POINT - callAttemptId: $callAttemptId")
        Log.d(TAG, "[SOCKET] markCallAccepted() - Checking if call exists in activeCallsData")
        
        val callData = activeCallsData[callAttemptId]
        if (callData != null) {
            Log.d(TAG, "[SOCKET] markCallAccepted() - Call found, setting accepted time")
            val acceptedTime = System.currentTimeMillis()
            callData.acceptedTime = acceptedTime
            Log.d(TAG, "[SOCKET] markCallAccepted() - Accepted time set to: $acceptedTime")
            Log.d(TAG, "[SOCKET] markCallAccepted() - Call marked as accepted successfully")
        } else {
            Log.w(TAG, "[SOCKET] markCallAccepted() - WARNING: Call not found in activeCallsData")
            Log.w(TAG, "[SOCKET] markCallAccepted() - Current activeCallsData keys: ${activeCallsData.keys}")
        }
        
        Log.d(TAG, "[SOCKET] markCallAccepted() - EXIT POINT")
    }
    
    fun registerIncomingCall(callAttemptId: String, sourceId: String, timestamp: Long = System.currentTimeMillis()) {
        Log.d(TAG, "[SOCKET] registerIncomingCall() - ENTRY POINT - callAttemptId: $callAttemptId, sourceId: $sourceId, timestamp: $timestamp")
        
        // Register this call for history tracking
        Log.d(TAG, "[SOCKET] registerIncomingCall() - Creating CallData object")
        val callData = CallData(
            callAttemptId = callAttemptId,
            sourceId = sourceId,
            startTime = timestamp
        )
        
        Log.d(TAG, "[SOCKET] registerIncomingCall() - Adding to activeCallsData map")
        activeCallsData[callAttemptId] = callData
        
        Log.d(TAG, "[SOCKET] registerIncomingCall() - Call registered successfully")
        Log.d(TAG, "[SOCKET] registerIncomingCall() - Current activeCallsData size: ${activeCallsData.size}")
        Log.d(TAG, "[SOCKET] registerIncomingCall() - EXIT POINT")
    }
    
    fun saveCallEndedLocally(callAttemptId: String, reason: String) {
        Log.d(TAG, "[SOCKET] saveCallEndedLocally() - ENTRY POINT - callAttemptId: $callAttemptId, reason: $reason")
        Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Current activeCallsData size: ${activeCallsData.size}")
        Log.d(TAG, "[SOCKET] saveCallEndedLocally() - All activeCallsData keys: ${activeCallsData.keys}")
        
        // Get call data if available
        Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Looking up call data for callAttemptId")
        val callData = activeCallsData[callAttemptId]
        if (callData != null) {
            Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Call data found")
            Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Call data: sourceId=${callData.sourceId}, startTime=${callData.startTime}, acceptedTime=${callData.acceptedTime}")
            
            // Calculate duration based on accepted time or start time
            Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Calculating call duration")
            val endTime = System.currentTimeMillis()
            val startTime = callData.acceptedTime ?: callData.startTime
            val duration = if (callData.acceptedTime != null) {
                // Call was accepted, calculate actual call duration
                val calculatedDuration = ((endTime - callData.acceptedTime!!) / 1000).toInt()
                Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Call was accepted, duration: ${calculatedDuration}s")
                calculatedDuration
            } else {
                // Call was never accepted, duration is 0
                Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Call was never accepted, duration: 0s")
                0
            }
            
            Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Final values - startTime: $startTime, endTime: $endTime, duration: ${duration}s")
            
            // Save to call history
            Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Starting coroutine to save call history")
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val status = if (duration > 0) "completed" else "missed"
                    Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Determined status: $status")
                    
                    Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Calling CallHistoryManager.saveCall()")
                    callHistoryManager.saveCall(
                        callAttemptId = callAttemptId,
                        sourceId = callData.sourceId,
                        startTime = startTime,
                        endTime = endTime,
                        duration = duration,
                        status = status,
                        reason = reason,
                        callType = "incoming",
                        deviceInfo = "Android Mobile",
                        connectionType = "webrtc"
                    )
                    Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Call saved to history successfully")
                    Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Saved with: duration=${duration}s, status=$status")
                } catch (e: Exception) {
                    Log.e(TAG, "[SOCKET] saveCallEndedLocally() - EXCEPTION while saving to history", e)
                    Log.e(TAG, "[SOCKET] saveCallEndedLocally() - Exception type: ${e.javaClass.simpleName}")
                    Log.e(TAG, "[SOCKET] saveCallEndedLocally() - Exception message: ${e.message}")
                }
            }
        } else {
            Log.w(TAG, "[SOCKET] saveCallEndedLocally() - WARNING: Call data not found")
            Log.w(TAG, "[SOCKET] saveCallEndedLocally() - Searched for callAttemptId: $callAttemptId")
            Log.w(TAG, "[SOCKET] saveCallEndedLocally() - Available keys: ${activeCallsData.keys}")
        }
        
        // Don't clean up tracking data here - let handleCallEnded() do final cleanup after server confirmation
        Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Keeping call data for server confirmation")
        Log.d(TAG, "[SOCKET] saveCallEndedLocally() - Current activeCallsData size: ${activeCallsData.size}")
        Log.d(TAG, "[SOCKET] saveCallEndedLocally() - EXIT POINT")
    }
    
    // REMOVED: attemptReconnection() method for cold start behavior
    // The socket will now stay disconnected after calls end, and only reconnect
    // when explicitly needed (e.g., new incoming calls via FCM)
    
    private fun handleConnectionError(exception: Exception) {
        Log.e(TAG, "[SOCKET] handleConnectionError() called")
        Log.e(TAG, "[SOCKET] Connection error details", exception)
        
        val errorMessage = exception.message?.lowercase() ?: ""
        
        // Check for JWT-related authentication errors
        if (errorMessage.contains("jwt expired") || 
            errorMessage.contains("authentication failed") ||
            errorMessage.contains("token expired") ||
            errorMessage.contains("unauthorized") ||
            errorMessage.contains("forbidden")) {
            
            Log.w(TAG, "[SOCKET] JWT authentication error detected, performing automatic logout")
            performAutomaticLogout("Your session has expired. Please log in again.")
        }
    }
    
    /**
     * Performs automatic logout when JWT expires or authentication fails
     */
    private fun performAutomaticLogout(reason: String = "Authentication failed") {
        Log.w(TAG, "[AUTH] performAutomaticLogout() called - reason: $reason")
        
        try {
            // Stop token validation timer
            stopTokenValidation()
            
            // Disconnect socket
            disconnect()
            
            // Clear stored credentials
            authManager.logout()
            
            // Create intent to redirect to login screen
            val intent = Intent(context, LoginActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                putExtra("logout_reason", reason)
            }
            
            Log.d(TAG, "[AUTH] Starting LoginActivity for automatic logout")
            context.startActivity(intent)
            
        } catch (e: Exception) {
            Log.e(TAG, "[AUTH] Error during automatic logout", e)
        }
    }
    
    /**
     * Starts periodic token validation (every 24 hours)
     */
    private fun startTokenValidation() {
        Log.d(TAG, "[TOKEN-VALIDATION] Starting periodic token validation (24-hour intervals)")
        
        stopTokenValidation() // Stop any existing validation
        
        tokenValidationRunnable = object : Runnable {
            override fun run() {
                Log.d(TAG, "[TOKEN-VALIDATION] Performing periodic token validation check")
                
                if (!authManager.isTokenValid()) {
                    Log.w(TAG, "[TOKEN-VALIDATION] Token expired during periodic check")
                    performAutomaticLogout("Your session has expired. Please log in again.")
                } else {
                    Log.d(TAG, "[TOKEN-VALIDATION] Token is still valid, scheduling next check")
                    // Schedule next validation in 24 hours
                    tokenValidationHandler.postDelayed(this, TOKEN_VALIDATION_INTERVAL)
                }
            }
        }
        
        // Start the first validation check in 24 hours
        tokenValidationHandler.postDelayed(tokenValidationRunnable!!, TOKEN_VALIDATION_INTERVAL)
    }
    
    /**
     * Stops periodic token validation
     */
    private fun stopTokenValidation() {
        Log.d(TAG, "[TOKEN-VALIDATION] Stopping periodic token validation")
        tokenValidationRunnable?.let { runnable ->
            tokenValidationHandler.removeCallbacks(runnable)
            tokenValidationRunnable = null
        }
    }
    
    private fun handleIncomingCall(callAttemptId: String, sourceId: String, timestamp: Long) {
        Log.d(TAG, "[SOCKET] handleIncomingCall() - callAttemptId: $callAttemptId, sourceId: $sourceId, timestamp: $timestamp")
        
        // Track this call for history - only add if not already present to avoid overwriting accepted calls
        if (!activeCallsData.containsKey(callAttemptId)) {
            activeCallsData[callAttemptId] = CallData(
                callAttemptId = callAttemptId,
                sourceId = sourceId,
                startTime = timestamp
            )
            Log.d(TAG, "[SOCKET] Call registered in activeCallsData for history tracking")
        } else {
            Log.d(TAG, "[SOCKET] Call already exists in activeCallsData, not overwriting")
        }
        
        // The call is now properly tracked and will be handled by FCM -> ActiveCallActivity flow
        // WebRTC events will be routed to the active call activity via the webrtcEventListener
        Log.d(TAG, "[SOCKET] Incoming call properly registered, ready for WebRTC events")
    }
    
    private fun handleCallCancelled(callAttemptId: String, reason: String) {
        Log.d(TAG, "[SOCKET] handleCallCancelled() - callAttemptId: $callAttemptId, reason: $reason")
        
        // Get call data if available
        val callData = activeCallsData[callAttemptId]
        if (callData != null) {
            // Save cancelled call to history
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val status = when (reason) {
                        "customer_cancelled" -> "cancelled"
                        "timeout" -> "missed"
                        "other_device_accepted" -> "answered_elsewhere"
                        else -> "cancelled"
                    }
                    
                    callHistoryManager.saveCall(
                        callAttemptId = callAttemptId,
                        sourceId = callData.sourceId,
                        startTime = callData.startTime,
                        endTime = System.currentTimeMillis(),
                        duration = 0,
                        status = status,
                        reason = reason,
                        callType = "incoming",
                        deviceInfo = "Android Mobile",
                        connectionType = "webrtc"
                    )
                    Log.d(TAG, "[SOCKET] Cancelled call saved to history with status: $status")
                } catch (e: Exception) {
                    Log.e(TAG, "[SOCKET] Failed to save cancelled call to history", e)
                }
            }
        }
        
        // Dismiss notification and stop ringtone (matching FCM handler behavior)
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(callAttemptId.hashCode())
            Log.d(TAG, "[SOCKET] Notification cancelled for callAttemptId: $callAttemptId")
            
            // Stop ringtone
            RingtoneManager.getInstance(context).stopRingtone()
            Log.d(TAG, "[SOCKET] Ringtone stopped")
        } catch (e: Exception) {
            Log.e(TAG, "[SOCKET] Failed to cancel notification", e)
        }
        
        // Notify activity via CallEventListener (consistent with existing pattern)
        callEventListener?.onCallCancelled(callAttemptId, reason)
        Log.d(TAG, "[SOCKET] CallEventListener notified of cancellation")
        
        // Clean up tracking data
        activeCallsData.remove(callAttemptId)
    }
    
    private fun handleCallEnded(callAttemptId: String, duration: Int, reason: String?) {
        Log.d(TAG, "[SOCKET] handleCallEnded() - ENTRY POINT - callAttemptId: $callAttemptId, duration: $duration, reason: $reason")
        Log.d(TAG, "[SOCKET] handleCallEnded() - Current activeCallsData size: ${activeCallsData.size}")
        
        // Get call data if available
        Log.d(TAG, "[SOCKET] handleCallEnded() - Looking up call data")
        val callData = activeCallsData[callAttemptId]
        if (callData != null) {
            Log.d(TAG, "[SOCKET] handleCallEnded() - Call data found")
            Log.d(TAG, "[SOCKET] handleCallEnded() - Call data: sourceId=${callData.sourceId}, startTime=${callData.startTime}, acceptedTime=${callData.acceptedTime}")
            
            // Save completed call to history
            Log.d(TAG, "[SOCKET] handleCallEnded() - Starting coroutine to save completed call")
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    Log.d(TAG, "[SOCKET] handleCallEnded() - Calculating timestamps")
                    val endTime = System.currentTimeMillis()
                    val startTime = callData.acceptedTime ?: callData.startTime
                    
                    Log.d(TAG, "[SOCKET] handleCallEnded() - Calling CallHistoryManager.saveCall() for completed call")
                    callHistoryManager.saveCall(
                        callAttemptId = callAttemptId,
                        sourceId = callData.sourceId,
                        startTime = startTime,
                        endTime = endTime,
                        duration = duration,
                        status = "completed",
                        reason = reason,
                        callType = "incoming",
                        deviceInfo = "Android Mobile",
                        connectionType = "webrtc"
                    )
                    Log.d(TAG, "[SOCKET] handleCallEnded() - Completed call saved to history successfully")
                    Log.d(TAG, "[SOCKET] handleCallEnded() - Saved with duration: ${duration}s, status: completed")
                } catch (e: Exception) {
                    Log.e(TAG, "[SOCKET] handleCallEnded() - EXCEPTION while saving completed call", e)
                    Log.e(TAG, "[SOCKET] handleCallEnded() - Exception details: ${e.message}")
                }
            }
        } else {
            Log.w(TAG, "[SOCKET] handleCallEnded() - WARNING: Call data not found")
            Log.w(TAG, "[SOCKET] handleCallEnded() - Cannot save to history for callAttemptId: $callAttemptId")
            Log.w(TAG, "[SOCKET] handleCallEnded() - Available keys: ${activeCallsData.keys}")
        }
        
        // Clean up tracking data
        Log.d(TAG, "[SOCKET] handleCallEnded() - Cleaning up activeCallsData")
        activeCallsData.remove(callAttemptId)
        Log.d(TAG, "[SOCKET] handleCallEnded() - Final activeCallsData size: ${activeCallsData.size}")
        
        // Cancel notification (ensure it's cleared regardless of CallManager state)
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(callAttemptId.hashCode())
            Log.d(TAG, "[SOCKET] Notification cancelled for ended call: $callAttemptId")
        } catch (e: Exception) {
            Log.e(TAG, "[SOCKET] Failed to cancel notification for ended call", e)
        }
        
        // Notify activity about call ending
        Log.d(TAG, "[SOCKET] handleCallEnded() - Notifying call event listener")
        callEventListener?.onCallEnded(callAttemptId, duration, reason)
        
        Log.d(TAG, "[SOCKET] handleCallEnded() - EXIT POINT")
    }
    
    private fun handleCallFailed(callAttemptId: String, reason: String) {
        Log.d(TAG, "[SOCKET] handleCallFailed() - callAttemptId: $callAttemptId, reason: $reason")
        
        // Get call data if available
        val callData = activeCallsData[callAttemptId]
        if (callData != null) {
            // Save failed call to history
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    callHistoryManager.saveCall(
                        callAttemptId = callAttemptId,
                        sourceId = callData.sourceId,
                        startTime = callData.startTime,
                        endTime = System.currentTimeMillis(),
                        duration = 0,
                        status = "failed",
                        reason = reason,
                        callType = "incoming",
                        deviceInfo = "Android Mobile",
                        connectionType = "webrtc"
                    )
                    Log.d(TAG, "[SOCKET] Failed call saved to history with reason: $reason")
                } catch (e: Exception) {
                    Log.e(TAG, "[SOCKET] Failed to save failed call to history", e)
                }
            }
        }
        
        // Handle call failure from server (e.g., connection_timeout, webrtc_failed)
        when (reason) {
            "connection_timeout" -> {
                // Server-side WebRTC connection timeout (30 seconds)
                Log.w("SocketManager", "Call failed due to connection timeout: $callAttemptId")
                // Notify the active call activity or WebRTC manager
                notifyCallFailure(callAttemptId, "Connection timed out")
            }
            "webrtc_failed" -> {
                // WebRTC negotiation failed
                Log.w("SocketManager", "Call failed due to WebRTC failure: $callAttemptId")
                notifyCallFailure(callAttemptId, "Call setup failed")
            }
            "connection_failed" -> {
                // General connection failure
                Log.w("SocketManager", "Call failed due to connection failure: $callAttemptId")
                notifyCallFailure(callAttemptId, "Connection failed")
            }
            else -> {
                // Other technical failures
                Log.w("SocketManager", "Call failed: $callAttemptId, reason: $reason")
                notifyCallFailure(callAttemptId, "Call failed due to technical issues")
            }
        }
        
        // Clean up tracking data
        activeCallsData.remove(callAttemptId)
        
        // Notify activity about call failure
        callEventListener?.onCallFailed(callAttemptId, reason)
    }
    
    private fun notifyCallFailure(callAttemptId: String, errorMessage: String) {
        // This would typically notify the active call activity or WebRTC manager
        // Implementation depends on how you want to communicate failures to UI
        // For example, could use a callback interface or event bus
    }
    
    private fun handleWebRTCOffer(data: JSONObject) {
        try {
            val callAttemptId = data.getString("callAttemptId")
            val offerObject = data.getJSONObject("offer")
            val sdp = offerObject.getString("sdp")
            val type = offerObject.getString("type")
            
            // Create SessionDescription from server data
            val sessionDescription = SessionDescription(
                SessionDescription.Type.fromCanonicalForm(type),
                sdp
            )
            
            // Route to active WebRTC manager
            webrtcEventListener?.onWebRTCOffer(callAttemptId, sessionDescription)
            
        } catch (e: Exception) {
            Log.e("SocketManager", "Error handling WebRTC offer", e)
            // If we can't parse the offer, it's a technical failure
            val callAttemptId = data.optString("callAttemptId")
            if (callAttemptId.isNotEmpty()) {
                notifyCallFailure(callAttemptId, "Failed to process WebRTC offer")
            }
        }
    }
    
    private fun handleWebRTCIceCandidate(data: JSONObject) {
        Log.d(TAG, "[ICE] handleWebRTCIceCandidate() - ENTRY POINT")
        Log.d(TAG, "[ICE] Raw data received: $data")
        
        try {
            Log.d(TAG, "[ICE] Extracting callAttemptId from data")
            val callAttemptId = data.getString("callAttemptId")
            Log.d(TAG, "[ICE] callAttemptId: $callAttemptId")
            
            Log.d(TAG, "[ICE] Extracting candidate object from data")
            val candidateObject = data.getJSONObject("candidate")
            Log.d(TAG, "[ICE] candidateObject: $candidateObject")
            
            Log.d(TAG, "[ICE] Extracting candidate SDP string")
            val candidate = candidateObject.getString("candidate")
            Log.d(TAG, "[ICE] candidate SDP: $candidate")
            
            Log.d(TAG, "[ICE] Extracting sdpMLineIndex")
            val sdpMLineIndex = candidateObject.getInt("sdpMLineIndex")
            Log.d(TAG, "[ICE] sdpMLineIndex: $sdpMLineIndex")
            
            Log.d(TAG, "[ICE] Extracting sdpMid")
            val sdpMid = candidateObject.getString("sdpMid")
            Log.d(TAG, "[ICE] sdpMid: $sdpMid")
            
            Log.d(TAG, "[ICE] Creating IceCandidate object")
            // Create IceCandidate from server data
            val iceCandidate = IceCandidate(sdpMid, sdpMLineIndex, candidate)
            Log.d(TAG, "[ICE] IceCandidate created successfully")
            Log.d(TAG, "[ICE] IceCandidate details - sdpMid: ${iceCandidate.sdpMid}, sdpMLineIndex: ${iceCandidate.sdpMLineIndex}")
            Log.d(TAG, "[ICE] IceCandidate SDP: ${iceCandidate.sdp}")
            
            Log.d(TAG, "[ICE] Checking if webrtcEventListener is available")
            if (webrtcEventListener != null) {
                Log.d(TAG, "[ICE] webrtcEventListener is available, calling onWebRTCIceCandidate")
                // Route to active WebRTC manager
                webrtcEventListener?.onWebRTCIceCandidate(callAttemptId, iceCandidate)
                Log.d(TAG, "[ICE] Successfully routed to webrtcEventListener")
            } else {
                Log.w(TAG, "[ICE] webrtcEventListener is NULL - cannot route ICE candidate!")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "[ICE] Error handling WebRTC ICE candidate: ${e.message}", e)
            Log.e(TAG, "[ICE] Exception details: ${e.javaClass.simpleName}")
            Log.e(TAG, "[ICE] Stack trace: ${e.stackTrace.contentToString()}")
            // ICE candidate failures are usually non-fatal, just log the error
        }
        
        Log.d(TAG, "[ICE] handleWebRTCIceCandidate() - EXIT POINT")
    }
    
    private fun handleServerError(error: JSONObject) {
        Log.e(TAG, "[SOCKET] handleServerError() - error: $error")
        // Handle server errors
    }
    
    private fun getFCMToken(): String? {
        Log.d(TAG, "[SOCKET] getFCMToken() called")
        // Get FCM token from SharedPreferences
        val sharedPreferences = context.getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
        val token = sharedPreferences.getString("fcm_token", null)
        Log.d(TAG, "[SOCKET] FCM token: ${if (token != null) "[PRESENT]" else "[NULL]"}")
        return token
    }
    
    /**
     * Registers FCM token with server via temporary socket connection
     * Used for automatic token refresh (WhatsApp-like behavior)
     */
    fun registerFCMTokenOnly(fcmToken: String) {
        Log.d(TAG, "[FCM-REGISTRATION] registerFCMTokenOnly() called with token")
        
        val token = authManager.getStoredToken()
        if (token == null) {
            Log.w(TAG, "[FCM-REGISTRATION] No auth token, cannot register FCM token")
            return
        }
        
        // Create temporary socket connection
        val options = IO.Options().apply {
            auth = mapOf("token" to token)
            transports = arrayOf("websocket", "polling")
            timeout = 10000 // Shorter timeout for token registration
            forceNew = true
        }
        
        try {
            val tempSocket = IO.socket("wss://tunnel.callsafe.tech", options)
            var isDisconnected = false
            
            // Helper function to safely disconnect once
            val safeDisconnect = {
                if (!isDisconnected) {
                    isDisconnected = true
                    Log.d(TAG, "[FCM-REGISTRATION] Disconnecting temporary socket")
                    tempSocket.disconnect()
                }
            }
            
            // Listen for successful device registration
            tempSocket.on(Protocol.MessageTypes.DEVICE_CONNECTED) { args ->
                Log.d(TAG, "[FCM-REGISTRATION] Device successfully registered with server")
                safeDisconnect()
            }
            
            // Listen for registration errors
            tempSocket.on(Protocol.MessageTypes.ERROR) { args ->
                val error = args?.firstOrNull()
                Log.e(TAG, "[FCM-REGISTRATION] Registration failed: $error")
                
                // Check for JWT-related errors during FCM registration
                val errorMessage = error?.toString()?.lowercase() ?: ""
                if (errorMessage.contains("jwt expired") || 
                    errorMessage.contains("authentication failed") ||
                    errorMessage.contains("token expired")) {
                    
                    Log.w(TAG, "[FCM-REGISTRATION] JWT error during FCM registration, performing automatic logout")
                    performAutomaticLogout("Your session has expired. Please log in again.")
                }
                
                safeDisconnect()
            }
            
            // Set up one-time connection for token registration
            tempSocket.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "[FCM-REGISTRATION] Temporary socket connected, registering FCM token")
                
                val deviceId = getUniqueDeviceId(context)
                val deviceConnectEvent = JSONObject().apply {
                    put("type", Protocol.MessageTypes.DEVICE_CONNECT)
                    put("deviceType", Protocol.DeviceType.MOBILE.value)
                    put("deviceId", deviceId)
                    put("pushToken", fcmToken)
                    put("protocolVersion", Protocol.VERSION)
                    put("timestamp", System.currentTimeMillis())
                }

                tempSocket.emit(Protocol.MessageTypes.DEVICE_CONNECT, deviceConnectEvent)
            }
            
            tempSocket.on(Socket.EVENT_CONNECT_ERROR) { args ->
                val error = args?.firstOrNull()
                Log.e(TAG, "[FCM-REGISTRATION] Temporary socket connection failed: $error")
                
                // Check for JWT-related connection errors during FCM registration
                val errorMessage = error?.toString()?.lowercase() ?: ""
                if (errorMessage.contains("jwt expired") || 
                    errorMessage.contains("authentication failed") ||
                    errorMessage.contains("token expired")) {
                    
                    Log.w(TAG, "[FCM-REGISTRATION] JWT connection error during FCM registration")
                    performAutomaticLogout("Your session has expired. Please log in again.")
                }
                
                safeDisconnect()
            }
            
            tempSocket.on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "[FCM-REGISTRATION] Temporary socket disconnected")
            }
            
            // Safety timeout as fallback (10 seconds)
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                if (!isDisconnected) {
                    Log.w(TAG, "[FCM-REGISTRATION] Timeout waiting for server response, disconnecting")
                    safeDisconnect()
                }
            }, 10000)
            
            // Connect temporarily
            tempSocket.connect()
            
        } catch (e: Exception) {
            Log.e(TAG, "[FCM-REGISTRATION] Failed to create temporary socket", e)
        }
    }
}