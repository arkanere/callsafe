package tech.callsafe.business.managers

import android.content.Context
import org.json.JSONObject

class CallManager private constructor(context: Context) {
    private val socketManager = SocketManager.getInstance(context)
    private var currentCallAttemptId: String? = null
    private var callState: CallState = CallState.IDLE
    
    enum class CallState {
        IDLE, INCOMING, CONNECTING, CONNECTED, ENDED
    }
    
    companion object {
        @Volatile
        private var INSTANCE: CallManager? = null
        
        fun getInstance(context: Context): CallManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: CallManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    fun acceptCall(callAttemptId: String, deviceType: String, deviceId: String) {
        currentCallAttemptId = callAttemptId
        callState = CallState.CONNECTING
        
        val acceptData = JSONObject().apply {
            put("type", "call:accept")
            put("callAttemptId", callAttemptId)
            put("deviceType", deviceType)
            put("deviceId", deviceId)
            put("timestamp", System.currentTimeMillis())
        }
        
        socketManager.emit("call:accept", acceptData)
    }
    
    fun rejectCall(callAttemptId: String, deviceType: String, reason: String? = null) {
        val rejectData = JSONObject().apply {
            put("type", "call:reject")
            put("callAttemptId", callAttemptId)
            put("deviceType", deviceType)
            if (reason != null) put("reason", reason)
            put("timestamp", System.currentTimeMillis())
        }
        
        socketManager.emit("call:reject", rejectData)
        
        callState = CallState.IDLE
        currentCallAttemptId = null
    }
    
    fun endCall(callAttemptId: String, initiator: String, reason: String) {
        val endData = JSONObject().apply {
            put("type", "call:end")
            put("callAttemptId", callAttemptId)
            put("initiator", initiator)
            put("reason", reason)
            put("timestamp", System.currentTimeMillis())
        }
        
        socketManager.emit("call:end", endData)
        
        callState = CallState.ENDED
        currentCallAttemptId = null
    }
    
    fun updateDeviceStatus(deviceId: String, status: String) {
        val statusData = JSONObject().apply {
            put("type", "device:status")
            put("deviceId", deviceId)
            put("status", status)
            put("timestamp", System.currentTimeMillis())
            // Note: handle comes from JWT token in auth, not event data
        }
        
        socketManager.emit("device:status", statusData)
    }
    
    fun getCurrentCallAttemptId(): String? = currentCallAttemptId
    fun getCallState(): CallState = callState
    
    fun setCallState(state: CallState) {
        callState = state
    }
}