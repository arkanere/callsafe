package tech.callsafe.business.managers

import android.content.Context
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.SessionDescription
import tech.callsafe.business.utils.getUniqueDeviceId

class SocketManager private constructor(private val context: Context) {
    private var socket: Socket? = null
    private val authManager: AuthenticationManager = AuthenticationManager(context)
    
    // WebRTC event listener interface for communication with active call
    interface WebRTCEventListener {
        fun onWebRTCOffer(callAttemptId: String, offer: SessionDescription)
        fun onWebRTCIceCandidate(callAttemptId: String, candidate: IceCandidate)
    }
    
    private var webrtcEventListener: WebRTCEventListener? = null
    
    companion object {
        @Volatile
        private var INSTANCE: SocketManager? = null
        
        fun getInstance(context: Context): SocketManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SocketManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    fun connect(): Boolean {
        val token = authManager.getStoredToken() ?: return false
        
        val options = IO.Options().apply {
            auth = mapOf("token" to token)
            transports = arrayOf("websocket", "polling")
            timeout = 30000 // 30-second timeout for consistency
            forceNew = true
        }
        
        socket = IO.socket("wss://tunnel.callsafe.tech/socket.io", options)
        
        socket?.apply {
            on(Socket.EVENT_CONNECT) {
                // Register device for call reception
                registerDevice()
            }
            
            on(Socket.EVENT_DISCONNECT) { args ->
                Log.w("Socket", "Disconnected: ${args[0]}")
                // Attempt reconnection if not server-initiated
                if (args[0] != "io server disconnect") {
                    attemptReconnection()
                }
            }
            
            on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e("Socket", "Connection error: ${args[0]}")
                handleConnectionError(args[0] as Exception)
            }
            
            setupEventHandlers()
            connect()
        }
        
        return true
    }
    
    private fun registerDevice() {
        val deviceId = getUniqueDeviceId(context)
        val fcmToken = getFCMToken()
        
        val deviceConnectEvent = JSONObject().apply {
            put("type", "device:connect")
            put("deviceType", "mobile")
            put("deviceId", deviceId)
            put("pushToken", fcmToken)
            put("timestamp", System.currentTimeMillis())
            // Note: handle comes from JWT token in auth, not event data
        }
        
        socket?.emit("device:connect", deviceConnectEvent)
    }
    
    private fun setupEventHandlers() {
        // Incoming call handler
        socket?.on("call:incoming") { args ->
            val data = args[0] as JSONObject
            handleIncomingCall(
                callAttemptId = data.getString("callAttemptId"),
                sourceId = data.getString("sourceId"),
                timestamp = data.getLong("timestamp")
            )
        }
        
        // Call cancelled handler
        socket?.on("call:cancelled") { args ->
            val data = args[0] as JSONObject
            handleCallCancelled(
                callAttemptId = data.getString("callAttemptId"),
                reason = data.getString("reason")
            )
        }
        
        // Call ended handler
        socket?.on("call:ended") { args ->
            val data = args[0] as JSONObject
            handleCallEnded(
                callAttemptId = data.getString("callAttemptId"),
                duration = data.getInt("duration"),
                reason = data.optString("reason")
            )
        }
        
        // Call failed handler (for server-side timeout and technical failures)
        socket?.on("call:failed") { args ->
            val data = args[0] as JSONObject
            handleCallFailed(
                callAttemptId = data.getString("callAttemptId"),
                reason = data.getString("reason")
            )
        }
        
        // WebRTC events
        socket?.on("webrtc:offer") { args ->
            val data = args[0] as JSONObject
            handleWebRTCOffer(data)
        }
        
        socket?.on("webrtc:ice-candidate") { args ->
            val data = args[0] as JSONObject
            handleWebRTCIceCandidate(data)
        }
        
        // Error handling
        socket?.on("error") { args ->
            val error = args[0] as JSONObject
            handleServerError(error)
        }
    }
    
    fun emit(eventType: String, data: JSONObject) {
        socket?.emit(eventType, data)
    }
    
    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
    
    fun setWebRTCEventListener(listener: WebRTCEventListener?) {
        webrtcEventListener = listener
    }
    
    private fun attemptReconnection() {
        // Implement reconnection logic if needed
        // For now, just try to reconnect after a delay
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            if (socket?.connected() != true) {
                connect()
            }
        }, 5000) // 5 second delay
    }
    
    private fun handleConnectionError(exception: Exception) {
        // Handle connection errors
        android.util.Log.e("SocketManager", "Connection error", exception)
    }
    
    private fun handleIncomingCall(callAttemptId: String, sourceId: String, timestamp: Long) {
        // Handle incoming call - show notification or activity
        // This would typically trigger the IncomingCallActivity
    }
    
    private fun handleCallCancelled(callAttemptId: String, reason: String) {
        // Handle call cancellation
    }
    
    private fun handleCallEnded(callAttemptId: String, duration: Int, reason: String?) {
        // Handle call ended
    }
    
    private fun handleCallFailed(callAttemptId: String, reason: String) {
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
        try {
            val callAttemptId = data.getString("callAttemptId")
            val candidateObject = data.getJSONObject("candidate")
            val candidate = candidateObject.getString("candidate")
            val sdpMLineIndex = candidateObject.getInt("sdpMLineIndex")
            val sdpMid = candidateObject.getString("sdpMid")
            
            // Create IceCandidate from server data
            val iceCandidate = IceCandidate(sdpMid, sdpMLineIndex, candidate)
            
            // Route to active WebRTC manager
            webrtcEventListener?.onWebRTCIceCandidate(callAttemptId, iceCandidate)
            
        } catch (e: Exception) {
            Log.e("SocketManager", "Error handling WebRTC ICE candidate", e)
            // ICE candidate failures are usually non-fatal, just log the error
        }
    }
    
    private fun handleServerError(error: JSONObject) {
        // Handle server errors
    }
    
    private fun getFCMToken(): String? {
        // Get FCM token from SharedPreferences
        val sharedPreferences = context.getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
        return sharedPreferences.getString("fcm_token", null)
    }
}