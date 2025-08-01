package tech.callsafe.business.managers

import android.content.Context
import android.util.Log
import org.json.JSONObject

class CallManager private constructor(context: Context) {
    private val socketManager = SocketManager.getInstance(context)
    private var currentCallAttemptId: String? = null
    private var callState: CallState = CallState.IDLE
    
    enum class CallState {
        IDLE, INCOMING, CONNECTING, CONNECTED, ENDED
    }
    
    companion object {
        private const val TAG = "CallManager"
        @Volatile
        private var INSTANCE: CallManager? = null
        
        fun getInstance(context: Context): CallManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: CallManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    fun acceptCall(callAttemptId: String, deviceType: String, deviceId: String) {
        Log.d(TAG, "[CALL] acceptCall() - callAttemptId: $callAttemptId, deviceType: $deviceType, deviceId: $deviceId")
        currentCallAttemptId = callAttemptId
        callState = CallState.CONNECTING
        Log.d(TAG, "[CALL] Call state changed to CONNECTING")
        
        val acceptData = JSONObject().apply {
            put("type", "call:accept")
            put("callAttemptId", callAttemptId)
            put("deviceType", deviceType)
            put("deviceId", deviceId)
            put("timestamp", System.currentTimeMillis())
        }
        
        Log.d(TAG, "[CALL] Emitting call:accept event with data: $acceptData")
        socketManager.emit("call:accept", acceptData)
    }
    
    fun rejectCall(callAttemptId: String, deviceType: String, reason: String? = null) {
        Log.d(TAG, "[CALL] rejectCall() - callAttemptId: $callAttemptId, deviceType: $deviceType, reason: $reason")
        val rejectData = JSONObject().apply {
            put("type", "call:reject")
            put("callAttemptId", callAttemptId)
            put("deviceType", deviceType)
            if (reason != null) put("reason", reason)
            put("timestamp", System.currentTimeMillis())
        }
        
        Log.d(TAG, "[CALL] Emitting call:reject event with data: $rejectData")
        socketManager.emit("call:reject", rejectData)
        
        Log.d(TAG, "[CALL] Call state changed to IDLE, clearing currentCallAttemptId")
        callState = CallState.IDLE
        currentCallAttemptId = null
    }
    
    fun endCall(callAttemptId: String, initiator: String, reason: String) {
        Log.d(TAG, "[CALL] endCall() - callAttemptId: $callAttemptId, initiator: $initiator, reason: $reason")
        val endData = JSONObject().apply {
            put("type", "call:end")
            put("callAttemptId", callAttemptId)
            put("initiator", initiator)
            put("reason", reason)
            put("timestamp", System.currentTimeMillis())
        }
        
        Log.d(TAG, "[CALL] Emitting call:end event with data: $endData")
        socketManager.emit("call:end", endData)
        
        Log.d(TAG, "[CALL] Call state changed to ENDED, clearing currentCallAttemptId")
        callState = CallState.ENDED
        currentCallAttemptId = null
    }
    
    fun updateDeviceStatus(deviceId: String, status: String) {
        Log.d(TAG, "[CALL] updateDeviceStatus() - deviceId: $deviceId, status: $status")
        val statusData = JSONObject().apply {
            put("type", "device:status")
            put("deviceId", deviceId)
            put("status", status)
            put("timestamp", System.currentTimeMillis())
            // Note: handle comes from JWT token in auth, not event data
        }
        
        Log.d(TAG, "[CALL] Emitting device:status event with data: $statusData")
        socketManager.emit("device:status", statusData)
    }
    
    fun getCurrentCallAttemptId(): String? {
        Log.d(TAG, "[CALL] getCurrentCallAttemptId() - returning: $currentCallAttemptId")
        return currentCallAttemptId
    }
    
    fun getCallState(): CallState {
        Log.d(TAG, "[CALL] getCallState() - returning: $callState")
        return callState
    }
    
    fun setCallState(state: CallState) {
        Log.d(TAG, "[CALL] setCallState() - changing from $callState to $state")
        callState = state
    }
}