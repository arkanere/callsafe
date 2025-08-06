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
        Log.d(TAG, "[FLOW] acceptCall() - ENTRY POINT: Call acceptance initiated")
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
        Log.d(TAG, "[FLOW] acceptCall() - Calling SocketManager.emit() to send acceptance to server")
        socketManager.emit("call:accept", acceptData)
        
        // Mark call as accepted for history tracking
        Log.d(TAG, "[CALL] acceptCall() - Marking call as accepted for history tracking")
        socketManager.markCallAccepted(callAttemptId)
        Log.d(TAG, "[CALL] acceptCall() - Call marked as accepted successfully")
    }
    
    fun rejectCall(callAttemptId: String, deviceType: String, reason: String? = null) {
        Log.d(TAG, "[FLOW] rejectCall() - ENTRY POINT: Call rejection initiated")
        Log.d(TAG, "[CALL] rejectCall() - callAttemptId: $callAttemptId, deviceType: $deviceType, reason: $reason")
        val rejectData = JSONObject().apply {
            put("type", "call:reject")
            put("callAttemptId", callAttemptId)
            put("deviceType", deviceType)
            if (reason != null) put("reason", reason)
            put("timestamp", System.currentTimeMillis())
        }
        
        Log.d(TAG, "[CALL] Emitting call:reject event with data: $rejectData")
        Log.d(TAG, "[FLOW] rejectCall() - Calling SocketManager.emit() to send rejection to server")
        socketManager.emit("call:reject", rejectData)
        
        Log.d(TAG, "[CALL] Call state changed to IDLE, clearing currentCallAttemptId")
        callState = CallState.IDLE
        currentCallAttemptId = null
    }
    
    fun endCall(callAttemptId: String, initiator: String, reason: String) {
        Log.d(TAG, "[FLOW] endCall() - ENTRY POINT: Call termination initiated")
        Log.d(TAG, "[CALL] endCall() - callAttemptId: $callAttemptId, initiator: $initiator, reason: $reason")
        val endData = JSONObject().apply {
            put("type", "call:end")
            put("callAttemptId", callAttemptId)
            put("initiator", initiator)
            put("reason", reason)
            put("timestamp", System.currentTimeMillis())
        }
        
        Log.d(TAG, "[CALL] Emitting call:end event with data: $endData")
        Log.d(TAG, "[FLOW] endCall() - Calling SocketManager.emit() to send end signal to server")
        socketManager.emit("call:end", endData)
        
        // Also save to call history locally since server might not send call:ended event
        Log.d(TAG, "[CALL] endCall() - Saving call to history locally")
        socketManager.saveCallEndedLocally(callAttemptId, reason)
        Log.d(TAG, "[CALL] endCall() - Call saved to history locally")
        
        Log.d(TAG, "[CALL] Call state changed to ENDED, clearing currentCallAttemptId")
        callState = CallState.ENDED
        currentCallAttemptId = null
    }
    
    fun updateDeviceStatus(deviceId: String, status: String) {
        Log.d(TAG, "[FLOW] updateDeviceStatus() - ENTRY POINT: Device status update")
        Log.d(TAG, "[CALL] updateDeviceStatus() - deviceId: $deviceId, status: $status")
        val statusData = JSONObject().apply {
            put("type", "device:status")
            put("deviceId", deviceId)
            put("status", status)
            put("timestamp", System.currentTimeMillis())
            // Note: handle comes from JWT token in auth, not event data
        }
        
        Log.d(TAG, "[CALL] Emitting device:status event with data: $statusData")
        Log.d(TAG, "[FLOW] updateDeviceStatus() - Calling SocketManager.emit() to update status")
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
        Log.d(TAG, "[FLOW] setCallState() - ENTRY POINT: Call state change")
        Log.d(TAG, "[CALL] setCallState() - changing from $callState to $state")
        callState = state
    }
}