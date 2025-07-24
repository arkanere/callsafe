package com.callsafe.androidapp.service

import android.app.ActivityManager
import android.content.Context
import android.util.Log
import com.callsafe.androidapp.models.IncomingCall
import com.callsafe.androidapp.network.SocketManager
import com.callsafe.androidapp.utils.SessionManager
import org.json.JSONObject

/**
 * Coordinates dual-channel call reception (FCM + WebSocket) for optimal user experience
 * Handles incoming calls from both FCM notifications and WebSocket real-time events
 */
class CallReceptionCoordinator(
    private val context: Context,
    private val socketManager: SocketManager,
    private val sessionManager: SessionManager
) {
    companion object {
        private const val TAG = "CallReceptionCoordinator"
    }
    
    private var callHandler: ((IncomingCall) -> Unit)? = null
    private var isSetup = false
    
    /**
     * Setup dual-channel call reception
     */
    fun setupDualChannelReception(callHandler: (IncomingCall) -> Unit) {
        Log.i(TAG, "🔄 Setting up dual-channel call reception")
        
        this.callHandler = callHandler
        
        // Setup WebSocket call handling
        setupWebSocketCallReception()
        
        // FCM handling is managed by CallSafeFirebaseMessagingService
        // but we coordinate with it through the service
        
        isSetup = true
        Log.i(TAG, "✅ Dual-channel reception setup complete")
    }
    
    /**
     * Handle incoming call data and determine the best reception channel
     */
    fun handleIncomingCall(callData: CallData) {
        Log.i(TAG, "📞 Coordinating incoming call reception")
        
        when {
            // Case 1: App is foreground with WebSocket -> Instant response
            isAppForeground() && socketManager.isConnected() -> {
                Log.i(TAG, "🌐 Handling via WebSocket (app foreground)")
                handleWebSocketCall(callData)
            }
            
            // Case 2: App is background -> Relies on FCM notification
            isAppBackground() -> {
                Log.i(TAG, "📱 App in background, FCM notification should handle")
                // FCM notification will launch IncomingCallActivity
                // When activity launches, it will check if call still available
                // This method might be called when the FCM launches the activity
                handleFCMTriggeredCall(callData)
            }
            
            // Case 3: Both channels active -> WebSocket wins for speed  
            else -> {
                Log.i(TAG, "⚡ Using WebSocket for faster response")
                handleWebSocketCall(callData)
            }
        }
    }
    
    private fun setupWebSocketCallReception() {
        Log.d(TAG, "🌐 Setting up WebSocket call reception")
        
        socketManager.on("new_incoming_call") { data ->
            Log.i(TAG, "📞 WebSocket incoming call received")
            
            val callData = parseWebSocketCallData(data)
            if (callData != null) {
                val incomingCall = IncomingCall(
                    callId = callData.callId,
                    sourceId = callData.sourceId,
                    timestamp = System.currentTimeMillis()
                )
                
                callHandler?.invoke(incomingCall)
            }
        }
        
        // Handle call routing confirmation
        socketManager.on("call_routed") { data ->
            Log.d(TAG, "🔄 Call routed via WebSocket")
            // Call is being processed, UI should already be showing
        }
    }
    
    private fun handleWebSocketCall(callData: CallData) {
        Log.i(TAG, "🌐 Processing WebSocket call: ${callData.callId}")
        
        val incomingCall = IncomingCall(
            callId = callData.callId,
            sourceId = callData.sourceId,
            timestamp = System.currentTimeMillis()
        )
        
        // Immediately show call UI
        callHandler?.invoke(incomingCall)
    }
    
    private fun handleFCMTriggeredCall(callData: CallData) {
        Log.i(TAG, "📱 Processing FCM-triggered call: ${callData.callId}")
        
        // When FCM notification launches the app/activity, we need to:
        // 1. Check if call is still available (not accepted on web)
        // 2. If available, show the call UI
        // 3. If not available, show "call answered elsewhere" message
        
        validateCallStillAvailable(callData.callId) { isAvailable ->
            if (isAvailable) {
                val incomingCall = IncomingCall(
                    callId = callData.callId,
                    sourceId = callData.sourceId,
                    timestamp = System.currentTimeMillis()
                )
                
                callHandler?.invoke(incomingCall)
            } else {
                Log.i(TAG, "📞 Call no longer available (accepted elsewhere)")
                handleCallNoLongerAvailable(callData.callId)
            }
        }
    }
    
    private fun validateCallStillAvailable(callId: String, callback: (Boolean) -> Unit) {
        Log.d(TAG, "🔍 Validating call availability: $callId")
        
        val data = JSONObject().apply {
            put("callId", callId)
            put("requestId", System.currentTimeMillis().toString())
        }
        
        // Set up one-time listener for response
        val responseListener = { response: Any? ->
            val isAvailable = when (response) {
                is JSONObject -> {
                    val responseCallId = response.optString("callId", "")
                    val available = response.optBoolean("available", false)
                    
                    if (responseCallId == callId) {
                        available
                    } else {
                        false
                    }
                }
                is Map<*, *> -> {
                    val responseCallId = response["callId"]?.toString()
                    val available = response["available"] as? Boolean ?: false
                    
                    if (responseCallId == callId) {
                        available
                    } else {
                        false
                    }
                }
                else -> false
            }
            
            Log.d(TAG, "📋 Call $callId availability: $isAvailable")
            callback(isAvailable)
        }
        
        // Set up temporary listener
        socketManager.on("call_availability_response", responseListener)
        
        // Remove listener after timeout
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            socketManager.off("call_availability_response")
            Log.w(TAG, "⏰ Call availability check timed out for $callId")
            callback(false) // Assume not available if timeout
        }, 3000) // 3 second timeout
        
        // Send the request
        socketManager.emit("check_call_availability", data)
    }
    
    private fun handleCallNoLongerAvailable(callId: String) {
        Log.i(TAG, "❌ Call $callId no longer available")
        
        // Could show a brief notification that call was answered elsewhere
        // or update UI to show "Call answered on another device"
        
        // For now, just log it - the UI layer will handle display
    }
    
    private fun isAppForeground(): Boolean {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val runningTasks = activityManager.getRunningTasks(1)
        
        return if (runningTasks.isNotEmpty()) {
            val topActivity = runningTasks[0].topActivity
            topActivity?.packageName == context.packageName
        } else {
            false
        }
    }
    
    private fun isAppBackground(): Boolean = !isAppForeground()
    
    private fun parseWebSocketCallData(data: Any?): CallData? {
        val callId: String
        val sourceId: String
        
        when (data) {
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: return null
                sourceId = data["sourceId"]?.toString() ?: ""
            }
            is JSONObject -> {
                callId = data.optString("callId", "").takeIf { it.isNotEmpty() } ?: return null
                sourceId = data.optString("sourceId", "")
            }
            else -> {
                Log.e(TAG, "❌ Invalid WebSocket call data format: $data")
                return null
            }
        }
        
        return CallData(callId, sourceId)
    }
    
    /**
     * Create CallData from FCM notification data
     */
    fun createCallDataFromFCM(fcmData: Map<String, String>): CallData? {
        val callId = fcmData["callId"] ?: return null
        val sourceId = fcmData["sourceId"] ?: ""
        
        return CallData(callId, sourceId)
    }
    
    /**
     * Handle call that was accepted on another device
     */
    fun handleCallAcceptedElsewhere(callId: String, deviceType: String) {
        Log.i(TAG, "📱 Call $callId accepted on $deviceType")
        
        // This information can be used by the UI to show appropriate messaging
        // or update the call state to reflect that it's active elsewhere
    }
    
    /**
     * Prioritize channels based on app state and connectivity
     */
    private fun getChannelPriority(): List<String> {
        return when {
            // App foreground + WebSocket connected = WebSocket first
            isAppForeground() && socketManager.isConnected() -> {
                listOf("websocket", "fcm")
            }
            // App background = FCM first for wake-up capability
            isAppBackground() -> {
                listOf("fcm", "websocket")
            }
            // Default: WebSocket preferred for real-time
            else -> {
                listOf("websocket", "fcm")
            }
        }
    }
    
    fun cleanup() {
        Log.i(TAG, "🧹 Cleaning up CallReceptionCoordinator")
        
        // Remove WebSocket listeners
        socketManager.off("new_incoming_call")
        socketManager.off("call_routed")
        socketManager.off("call_availability_response")
        
        callHandler = null
        isSetup = false
    }
    
    /**
     * Data class for call information
     */
    data class CallData(
        val callId: String,
        val sourceId: String
    )
    
    // Public API
    fun isSetup(): Boolean = isSetup
    
    fun getCurrentChannelPriority(): List<String> = getChannelPriority()
}