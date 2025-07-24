package com.callsafe.androidapp.service

import android.content.Context
import android.util.Log
import com.callsafe.androidapp.models.*
import com.callsafe.androidapp.network.SocketManager
import com.callsafe.androidapp.utils.SessionManager
import com.callsafe.androidapp.webrtc.WebRTCManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.PeerConnection
import org.webrtc.SessionDescription

/**
 * Manages all call-related business logic and state
 * This is the brain of the service that coordinates all call operations
 */
class CallManager(
    private val context: Context,
    private val socketManager: SocketManager,
    private val sessionManager: SessionManager
) {
    companion object {
        private const val TAG = "CallManager"
    }
    
    // State management
    private val _callState = MutableStateFlow(CallState())
    val callState: StateFlow<CallState> = _callState.asStateFlow()
    
    // WebRTC manager for handling voice calls
    private var webrtcManager: WebRTCManager? = null
    
    // Call timeout handling
    private val callTimeouts = mutableMapOf<String, android.os.Handler>()
    
    init {
        setupSocketEventListeners()
        setupWebRTCManager()
    }
    
    /**
     * Connect to the server and register as an agent
     */
    fun connect() {
        Log.i(TAG, "🔗 Initiating connection to server")
        
        val handle = sessionManager.getUserHandle()
        val sourceId = sessionManager.getSourceId()
        
        if (handle == null) {
            updateState { it.copy(
                lastError = "No user handle found", 
                errorTimestamp = System.currentTimeMillis()
            )}
            return
        }
        
        updateState { it.copy(
            connectionStatus = "Connecting...",
            lastConnectionAttempt = System.currentTimeMillis()
        )}
        
        socketManager.connect { success, error ->
            if (success) {
                Log.i(TAG, "✅ Connected to server, registering agent")
                updateState { it.copy(
                    isConnected = true,
                    connectionStatus = "Connected"
                )}
                
                // Register as agent
                socketManager.goOnlineWithHandle(handle, sourceId)
            } else {
                Log.e(TAG, "❌ Failed to connect: $error")
                updateState { it.copy(
                    isConnected = false,
                    connectionStatus = "Connection failed",
                    lastError = error,
                    errorTimestamp = System.currentTimeMillis()
                )}
            }
        }
    }
    
    /**
     * Disconnect from server
     */
    fun disconnect() {
        Log.i(TAG, "🔌 Disconnecting from server")
        
        // End any active call first
        getCurrentCall()?.let { call ->
            endCall(call.callId, "manual")
        }
        
        socketManager.goOffline()
        socketManager.disconnect()
        
        updateState { it.copy(
            isConnected = false,
            isAgentRegistered = false,
            connectionStatus = "Disconnected",
            currentCall = null,
            incomingCalls = emptyList()
        )}
    }
    
    /**
     * Accept an incoming call
     */
    fun acceptCall(callId: String) {
        Log.i(TAG, "✅ Accepting call: $callId")
        
        val incomingCall = _callState.value.incomingCalls.find { it.callId == callId }
        if (incomingCall == null) {
            Log.e(TAG, "❌ Cannot accept call: call not found")
            return
        }
        
        // Remove from incoming calls and set as current call
        val activeCall = ActiveCall(
            callId = callId,
            sourceId = incomingCall.sourceId,
            status = CallStatus.CONNECTING,
            startTime = System.currentTimeMillis()
        )
        
        updateState { state ->
            state.copy(
                currentCall = activeCall,
                incomingCalls = state.incomingCalls.filter { it.callId != callId }
            )
        }
        
        // Cancel timeout for this call
        callTimeouts[callId]?.let { handler ->
            handler.removeCallbacksAndMessages(null)
            callTimeouts.remove(callId)
        }
        
        // Accept call on server
        val handle = sessionManager.getUserHandle()
        socketManager.acceptCall(callId, handle, incomingCall.sourceId)
    }
    
    /**
     * Decline an incoming call
     */
    fun declineCall(callId: String) {
        Log.i(TAG, "❌ Declining call: $callId")
        
        val incomingCall = _callState.value.incomingCalls.find { it.callId == callId }
        if (incomingCall == null) {
            Log.e(TAG, "❌ Cannot decline call: call not found")
            return
        }
        
        // Remove from incoming calls
        updateState { state ->
            state.copy(
                incomingCalls = state.incomingCalls.filter { it.callId != callId }
            )
        }
        
        // Cancel timeout
        callTimeouts[callId]?.let { handler ->
            handler.removeCallbacksAndMessages(null)
            callTimeouts.remove(callId)
        }
        
        // Decline call on server
        val handle = sessionManager.getUserHandle()
        socketManager.declineCall(callId, handle, incomingCall.sourceId)
        
        // Add to call history
        addToCallHistory(callId, 0, "missed", incomingCall.sourceId, "agent_declined")
    }
    
    /**
     * End the current active call
     */
    fun endCall(callId: String, reason: String = "manual") {
        Log.i(TAG, "🔚 Ending call: $callId")
        
        val currentCall = getCurrentCall()
        if (currentCall == null || currentCall.callId != callId) {
            Log.w(TAG, "⚠️ No matching active call to end")
            return
        }
        
        val duration = ((System.currentTimeMillis() - currentCall.startTime) / 1000).toInt()
        
        // End WebRTC call
        webrtcManager?.endCall()
        
        // Notify server
        val handle = sessionManager.getUserHandle()
        socketManager.endCall(callId, handle, currentCall.sourceId, reason)
        
        // Update state
        updateState { it.copy(currentCall = null) }
        
        // Add to call history
        addToCallHistory(callId, duration, "completed", currentCall.sourceId, reason)
    }
    
    /**
     * Toggle mute state for current call
     */
    fun toggleMute() {
        val currentCall = getCurrentCall() ?: return
        val newMutedState = !currentCall.isMuted
        
        Log.i(TAG, "🔇 ${if (newMutedState) "Muting" else "Unmuting"} call")
        
        webrtcManager?.setMuted(newMutedState)
        
        updateState { state ->
            state.copy(
                currentCall = currentCall.copy(isMuted = newMutedState)
            )
        }
    }
    
    // Private helper methods
    
    private fun setupSocketEventListeners() {
        Log.i(TAG, "🔧 Setting up socket event listeners")
        
        socketManager.on("agent_registered") { data ->
            Log.i(TAG, "✅ Agent registered successfully")
            updateState { it.copy(
                isAgentRegistered = true,
                connectionStatus = "Ready to receive calls"
            )}
        }
        
        socketManager.on("new_incoming_call") { data ->
            handleNewIncomingCall(data)
        }
        
        socketManager.on("call_routed") { data ->
            handleCallRouted(data)
        }
        
        socketManager.on("offer") { data ->
            handleWebRTCOffer(data)
        }
        
        socketManager.on("ice_candidate") { data ->
            handleIceCandidate(data)
        }
        
        socketManager.on("call_ended") { data ->
            handleCallEnded(data)
        }
        
        socketManager.on("call_cancelled") { data ->
            handleCallCancelled(data)
        }
        
        Log.i(TAG, "✅ Socket event listeners configured")
    }
    
    private fun setupWebRTCManager() {
        webrtcManager = WebRTCManager(context).apply {
            setOnAnswerCreatedListener { answer ->
                val currentCall = getCurrentCall()
                currentCall?.let { call ->
                    val handle = sessionManager.getUserHandle()
                    socketManager.sendAnswer(call.callId, answer.description, handle, call.sourceId)
                }
            }
            
            setOnIceCandidateListener { candidate ->
                val currentCall = getCurrentCall()
                currentCall?.let { call ->
                    val handle = sessionManager.getUserHandle()
                    socketManager.sendIceCandidate(call.callId, candidate, handle, call.sourceId)
                }
            }
            
            setOnConnectionStateChangeListener { state ->
                Log.i(TAG, "🔌 WebRTC connection state: $state")
                val currentCall = getCurrentCall() ?: return@setOnConnectionStateChangeListener
                
                when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        updateState { callState ->
                            callState.copy(
                                currentCall = currentCall.copy(status = CallStatus.CONNECTED)
                            )
                        }
                    }
                    PeerConnection.PeerConnectionState.FAILED,
                    PeerConnection.PeerConnectionState.DISCONNECTED -> {
                        updateState { callState ->
                            callState.copy(
                                currentCall = currentCall.copy(status = CallStatus.ENDED)
                            )
                        }
                    }
                    else -> {
                        // Handle other states as needed
                    }
                }
            }
        }
    }
    
    private fun handleNewIncomingCall(data: Any?) {
        Log.i(TAG, "📞 Processing new incoming call")
        
        val callId: String
        val sourceId: String
        
        when (data) {
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                sourceId = data["sourceId"]?.toString() ?: ""
            }
            is JSONObject -> {
                callId = data.optString("callId", "")
                sourceId = data.optString("sourceId", "")
            }
            else -> {
                Log.e(TAG, "❌ Invalid incoming call data format")
                return
            }
        }
        
        if (callId.isEmpty()) {
            Log.e(TAG, "❌ Missing call ID in incoming call")
            return
        }
        
        val incomingCall = IncomingCall(
            callId = callId,
            sourceId = sourceId,
            timestamp = System.currentTimeMillis()
        )
        
        // Add to incoming calls list
        updateState { state ->
            state.copy(
                incomingCalls = state.incomingCalls + incomingCall
            )
        }
        
        // Set timeout for call
        val handler = android.os.Handler(android.os.Looper.getMainLooper())
        handler.postDelayed({
            handleCallTimeout(callId)
        }, 30000) // 30 second timeout
        
        callTimeouts[callId] = handler
        
        Log.i(TAG, "✅ Added incoming call: $callId")
    }
    
    private fun handleCallRouted(data: Any?) {
        // Call has been accepted and is being routed
        Log.i(TAG, "📍 Call routed")
        // Current call should already be set when we accepted it
    }
    
    private fun handleWebRTCOffer(data: Any?) {
        Log.i(TAG, "📥 Processing WebRTC offer")
        
        val currentCall = getCurrentCall()
        if (currentCall == null) {
            Log.e(TAG, "❌ No active call for WebRTC offer")
            return
        }
        
        val callId: String
        val offerSdp: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId", "")
                val offerObj = data.optJSONObject("offer")
                offerSdp = offerObj?.optString("sdp", "") ?: ""
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                val offerObj = data["offer"] as? Map<*, *>
                offerSdp = offerObj?.get("sdp")?.toString() ?: ""
            }
            else -> {
                Log.e(TAG, "❌ Invalid WebRTC offer format")
                return
            }
        }
        
        if (callId != currentCall.callId || offerSdp.isEmpty()) {
            Log.e(TAG, "❌ Invalid offer data")
            return
        }
        
        val offer = SessionDescription(SessionDescription.Type.OFFER, offerSdp)
        webrtcManager?.createAnswer(callId, offer)
    }
    
    private fun handleIceCandidate(data: Any?) {
        Log.d(TAG, "🧊 Processing ICE candidate")
        
        val currentCall = getCurrentCall() ?: return
        
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
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                val candidateObj = data["candidate"] as? Map<*, *>
                candidateData = candidateObj?.get("candidate")?.toString() ?: ""
                sdpMid = candidateObj?.get("sdpMid")?.toString() ?: ""
                sdpMLineIndex = candidateObj?.get("sdpMLineIndex")?.toString()?.toIntOrNull() ?: 0
            }
            else -> return
        }
        
        if (callId == currentCall.callId && candidateData.isNotEmpty()) {
            val iceCandidate = IceCandidate(sdpMid, sdpMLineIndex, candidateData)
            webrtcManager?.addIceCandidate(iceCandidate)
        }
    }
    
    private fun handleCallEnded(data: Any?) {
        Log.i(TAG, "📞 Call ended by server")
        
        val callId: String
        val reason: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId", "")
                reason = data.optString("reason", "server_ended")
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                reason = data["reason"]?.toString() ?: "server_ended"
            }
            else -> return
        }
        
        val currentCall = getCurrentCall()
        if (currentCall?.callId == callId) {
            val duration = ((System.currentTimeMillis() - currentCall.startTime) / 1000).toInt()
            
            webrtcManager?.endCall()
            updateState { it.copy(currentCall = null) }
            
            addToCallHistory(callId, duration, "completed", currentCall.sourceId, reason)
        }
    }
    
    private fun handleCallCancelled(data: Any?) {
        Log.i(TAG, "📞 Call cancelled")
        
        val callId: String
        val sourceId: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId", "")
                sourceId = data.optString("sourceId", "")
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString() ?: ""
                sourceId = data["sourceId"]?.toString() ?: ""
            }
            else -> return
        }
        
        // Remove from incoming calls
        updateState { state ->
            state.copy(
                incomingCalls = state.incomingCalls.filter { it.callId != callId }
            )
        }
        
        // Cancel timeout
        callTimeouts[callId]?.let { handler ->
            handler.removeCallbacksAndMessages(null)
            callTimeouts.remove(callId)
        }
        
        addToCallHistory(callId, 0, "cancelled", sourceId, "customer_cancelled")
    }
    
    private fun handleCallTimeout(callId: String) {
        Log.i(TAG, "⏰ Call timeout: $callId")
        
        val incomingCall = _callState.value.incomingCalls.find { it.callId == callId }
        if (incomingCall != null) {
            updateState { state ->
                state.copy(
                    incomingCalls = state.incomingCalls.filter { it.callId != callId }
                )
            }
            
            addToCallHistory(callId, 0, "missed", incomingCall.sourceId, "timeout")
        }
        
        callTimeouts.remove(callId)
    }
    
    private fun addToCallHistory(callId: String, duration: Int, status: String, sourceId: String, reason: String) {
        val historyItem = CallHistoryItem(
            callId = callId,
            timestamp = System.currentTimeMillis(),
            duration = duration,
            status = status,
            sourceId = sourceId,
            reason = reason
        )
        
        updateState { state ->
            val newHistory = (listOf(historyItem) + state.recentCallHistory).take(10)
            state.copy(recentCallHistory = newHistory)
        }
    }
    
    private fun updateState(update: (CallState) -> CallState) {
        _callState.value = update(_callState.value)
    }
    
    private fun getCurrentCall(): ActiveCall? = _callState.value.currentCall
    
    fun cleanup() {
        Log.i(TAG, "🧹 Cleaning up CallManager")
        webrtcManager?.dispose()
        callTimeouts.values.forEach { it.removeCallbacksAndMessages(null) }
        callTimeouts.clear()
    }
}