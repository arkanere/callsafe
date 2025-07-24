package com.callsafe.androidapp.service

import android.content.Context
import android.util.Log
import com.callsafe.androidapp.models.*
import com.callsafe.androidapp.network.SocketManager
import com.callsafe.androidapp.utils.SessionManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

/**
 * Coordinates multi-device call handling and state synchronization
 * This class manages the Android device as part of a multi-device handle ecosystem
 */
class MultiDeviceCoordinator(
    private val context: Context,
    private val socketManager: SocketManager,
    private val sessionManager: SessionManager
) {
    companion object {
        private const val TAG = "MultiDeviceCoordinator"
    }
    
    // Multi-device state management
    private val _multiDeviceState = MutableStateFlow(MultiDeviceCallState())
    val multiDeviceState: StateFlow<MultiDeviceCallState> = _multiDeviceState.asStateFlow()
    
    // Device registration manager
    private val deviceRegistrationManager = DeviceRegistrationManager(
        sessionManager = sessionManager,
        socketManager = socketManager
    )
    
    // Call reception coordinator
    private val callReceptionCoordinator = CallReceptionCoordinator(
        context = context,
        socketManager = socketManager,
        sessionManager = sessionManager
    )
    
    init {
        setupMultiDeviceEventListeners()
    }
    
    /**
     * Initialize multi-device coordination
     */
    fun initialize() {
        Log.i(TAG, "🌐 Initializing multi-device coordination")
        
        // Register this Android device with the signaling server
        deviceRegistrationManager.registerAsAndroidDevice()
        
        // Setup dual-channel call reception
        callReceptionCoordinator.setupDualChannelReception { callData ->
            handleIncomingCall(callData)
        }
    }
    
    /**
     * Handle incoming call from either FCM or WebSocket
     */
    fun handleFCMCall(callData: Map<String, String>) {
        Log.i(TAG, "📱 Handling FCM call notification")
        
        // Check if call is still available (not already accepted on web)
        validateCallStillAvailable(callData) { isValid ->
            if (isValid) {
                // Convert FCM data to standard call format
                val incomingCall = createIncomingCallFromFCM(callData)
                handleIncomingCall(incomingCall)
            } else {
                Log.i(TAG, "📞 Call already accepted on another device")
                handleCallAcceptedOnOtherDevice(callData["callId"] ?: "", "web")
            }
        }
    }
    
    /**
     * Handle incoming call from WebSocket
     */
    fun handleWebSocketCall(callData: Any?) {
        Log.i(TAG, "🌐 Handling WebSocket call notification")
        
        val incomingCall = createIncomingCallFromWebSocket(callData)
        if (incomingCall != null) {
            handleIncomingCall(incomingCall)
        }
    }
    
    /**
     * Handle call cancellation from other device
     */
    fun handleCallCancelledOnOtherDevice(callData: Any?) {
        Log.i(TAG, "❌ Call cancelled on other device")
        
        val callId = extractCallId(callData)
        if (callId != null) {
            updateMultiDeviceState { currentState ->
                currentState.copy(
                    localDeviceState = currentState.localDeviceState.copy(
                        incomingCalls = currentState.localDeviceState.incomingCalls.filter { 
                            it.callId != callId 
                        }
                    ),
                    callAcceptedByDevice = null
                )
            }
        }
    }
    
    /**
     * Accept call on this Android device
     */
    fun acceptCallOnAndroid(callId: String) {
        Log.i(TAG, "✅ Accepting call on Android device: $callId")
        
        // Update state to show call accepted on Android
        updateMultiDeviceState { currentState ->
            val incomingCall = currentState.localDeviceState.incomingCalls.find { it.callId == callId }
            
            if (incomingCall != null) {
                val activeCall = ActiveCall(
                    callId = callId,
                    sourceId = incomingCall.sourceId,
                    status = CallStatus.CONNECTING,
                    startTime = System.currentTimeMillis()
                )
                
                currentState.copy(
                    localDeviceState = currentState.localDeviceState.copy(
                        currentCall = activeCall,
                        incomingCalls = currentState.localDeviceState.incomingCalls.filter { 
                            it.callId != callId 
                        }
                    ),
                    callAcceptedByDevice = "android"
                )
            } else {
                currentState
            }
        }
        
        // Notify other devices that call was accepted here
        notifyCallAcceptedOnThisDevice(callId)
    }
    
    /**
     * Handle when call is accepted on another device (e.g., web)
     */
    private fun handleCallAcceptedOnOtherDevice(callId: String, deviceType: String) {
        Log.i(TAG, "📱 Call accepted on $deviceType device: $callId")
        
        updateMultiDeviceState { currentState ->
            currentState.copy(
                localDeviceState = currentState.localDeviceState.copy(
                    incomingCalls = currentState.localDeviceState.incomingCalls.filter { 
                        it.callId != callId 
                    }
                ),
                callAcceptedByDevice = deviceType,
                handleBusyWithCall = callId
            )
        }
        
        // Show UI feedback that call was answered elsewhere
        showCallAnsweredElsewhereNotification(deviceType)
    }
    
    private fun setupMultiDeviceEventListeners() {
        Log.i(TAG, "🔧 Setting up multi-device event listeners")
        
        // Listen for call accepted on other device
        socketManager.on("call_accepted_on_other_device") { data ->
            val callId = extractCallId(data)
            val deviceType = extractDeviceType(data) ?: "web"
            
            if (callId != null) {
                handleCallAcceptedOnOtherDevice(callId, deviceType)
            }
        }
        
        // Listen for call no longer available (accepted elsewhere)
        socketManager.on("call_no_longer_available") { data ->
            val callId = extractCallId(data)
            if (callId != null) {
                handleCallAcceptedOnOtherDevice(callId, "web")
            }
        }
        
        // Listen for multi-device status updates
        socketManager.on("multi_device_status") { data ->
            handleMultiDeviceStatusUpdate(data)
        }
        
        // Listen for device registry updates
        socketManager.on("device_registry_updated") { data ->
            handleDeviceRegistryUpdate(data)
        }
    }
    
    private fun handleIncomingCall(incomingCall: IncomingCall) {
        Log.i(TAG, "📞 Processing incoming call: ${incomingCall.callId}")
        
        updateMultiDeviceState { currentState ->
            currentState.copy(
                localDeviceState = currentState.localDeviceState.copy(
                    incomingCalls = currentState.localDeviceState.incomingCalls + incomingCall
                ),
                availableForCalls = false
            )
        }
    }
    
    private fun validateCallStillAvailable(callData: Map<String, String>, callback: (Boolean) -> Unit) {
        val callId = callData["callId"]
        if (callId == null) {
            callback(false)
            return
        }
        
        // Check with server if call is still available
        val data = JSONObject().apply {
            put("callId", callId)
        }
        
        socketManager.emit("check_call_availability", data)
        
        // Set up one-time listener for response
        socketManager.on("call_availability_response") { response ->
            val isAvailable = when (response) {
                is JSONObject -> response.optBoolean("available", false)
                is Map<*, *> -> response["available"] as? Boolean ?: false
                else -> false
            }
            callback(isAvailable)
        }
    }
    
    private fun notifyCallAcceptedOnThisDevice(callId: String) {
        val handle = sessionManager.getUserHandle()
        val sourceId = sessionManager.getSourceId()
        
        val data = JSONObject().apply {
            put("callId", callId)
            put("acceptedByDevice", "android")
            put("deviceId", android.provider.Settings.Secure.getString(
                context.contentResolver, 
                android.provider.Settings.Secure.ANDROID_ID
            ))
            handle?.let { put("handle", it) }
            sourceId?.let { put("sourceId", it) }
        }
        
        socketManager.emit("call_accepted_on_device", data)
    }
    
    private fun showCallAnsweredElsewhereNotification(deviceType: String) {
        // TODO: Show notification or UI feedback that call was answered on another device
        Log.i(TAG, "💬 Call answered on $deviceType device")
    }
    
    private fun handleMultiDeviceStatusUpdate(data: Any?) {
        // Handle updates about other devices in the handle ecosystem
        Log.d(TAG, "📱 Multi-device status update: $data")
    }
    
    private fun handleDeviceRegistryUpdate(data: Any?) {
        // Handle updates about device registry changes
        Log.d(TAG, "📋 Device registry update: $data")
    }
    
    private fun createIncomingCallFromFCM(callData: Map<String, String>): IncomingCall {
        return IncomingCall(
            callId = callData["callId"] ?: "",
            sourceId = callData["sourceId"] ?: "",
            timestamp = System.currentTimeMillis()
        )
    }
    
    private fun createIncomingCallFromWebSocket(data: Any?): IncomingCall? {
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
            else -> return null
        }
        
        return IncomingCall(
            callId = callId,
            sourceId = sourceId,
            timestamp = System.currentTimeMillis()
        )
    }
    
    private fun extractCallId(data: Any?): String? {
        return when (data) {
            is Map<*, *> -> data["callId"]?.toString()
            is JSONObject -> data.optString("callId", "").takeIf { it.isNotEmpty() }
            else -> null
        }
    }
    
    private fun extractDeviceType(data: Any?): String? {
        return when (data) {
            is Map<*, *> -> data["deviceType"]?.toString()
            is JSONObject -> data.optString("deviceType", "").takeIf { it.isNotEmpty() }
            else -> null
        }
    }
    
    private fun updateMultiDeviceState(update: (MultiDeviceCallState) -> MultiDeviceCallState) {
        _multiDeviceState.value = update(_multiDeviceState.value)
    }
    
    fun cleanup() {
        Log.i(TAG, "🧹 Cleaning up MultiDeviceCoordinator")
        deviceRegistrationManager.cleanup()
        callReceptionCoordinator.cleanup()
    }
    
    // Public API for service integration
    fun getCurrentMultiDeviceState(): MultiDeviceCallState = _multiDeviceState.value
    
    fun isCallAcceptedOnOtherDevice(callId: String): Boolean {
        val state = _multiDeviceState.value
        return state.callAcceptedByDevice != null && 
               state.callAcceptedByDevice != "android" &&
               state.handleBusyWithCall == callId
    }
}