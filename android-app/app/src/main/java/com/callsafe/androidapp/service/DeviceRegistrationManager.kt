package com.callsafe.androidapp.service

import android.util.Log
import com.callsafe.androidapp.network.SocketManager
import com.callsafe.androidapp.utils.SessionManager
import org.json.JSONObject

/**
 * Manages device registration with the signaling server for multi-device coordination
 * Handles registering this Android device as part of a handle's device ecosystem
 */
class DeviceRegistrationManager(
    private val sessionManager: SessionManager,
    private val socketManager: SocketManager
) {
    companion object {
        private const val TAG = "DeviceRegistrationManager"
    }
    
    private var isRegistered = false
    private var registrationData: DeviceRegistrationData? = null
    
    data class DeviceRegistrationData(
        val handle: String,
        val sourceId: String?,
        val deviceId: String,
        val fcmToken: String?,
        val capabilities: List<String>
    )
    
    /**
     * Register this Android device with the signaling server
     */
    fun registerAsAndroidDevice() {
        Log.i(TAG, "📱 Registering Android device with signaling server")
        
        val handle = sessionManager.getUserHandle()
        val sourceId = sessionManager.getSourceId()
        
        if (handle == null) {
            Log.e(TAG, "❌ Cannot register device: no user handle found")
            return
        }
        
        // Get device identifier
        val deviceId = getDeviceId()
        
        // Get FCM token (will be implemented when FCMManager is available)
        val fcmToken = getFCMToken()
        
        val deviceCapabilities = listOf(
            "webrtc_voice",
            "fcm_notifications", 
            "websocket_realtime",
            "call_coordination"
        )
        
        val registrationPayload = JSONObject().apply {
            put("handle", handle)
            put("deviceType", "android")
            put("deviceId", deviceId)
            put("capabilities", JSONObject().apply {
                put("webrtc", true)
                put("fcm", fcmToken != null)
                put("websocket", true)
                put("multiDevice", true)
            })
            
            sourceId?.let { put("sourceId", it) }
            fcmToken?.let { put("fcmToken", it) }
            
            // Protocol version for compatibility
            put("protocolVersion", "2.0")
            put("clientVersion", "android-1.0")
        }
        
        registrationData = DeviceRegistrationData(
            handle = handle,
            sourceId = sourceId,
            deviceId = deviceId,
            fcmToken = fcmToken,
            capabilities = deviceCapabilities
        )
        
        // Register with both device registration AND agent online
        registerDeviceWithServer(registrationPayload)
        registerAgentOnline(handle, sourceId)
    }
    
    /**
     * Handle multi-device event from server
     */
    fun handleMultiDeviceEvent(event: MultiDeviceEvent) {
        Log.i(TAG, "🌐 Handling multi-device event: ${event.type}")
        
        when (event) {
            is MultiDeviceEvent.CallAcceptedOnOtherDevice -> {
                Log.i(TAG, "📞 Call ${event.callId} accepted on ${event.deviceType}")
                // Coordinator will handle the actual call cancellation
            }
            is MultiDeviceEvent.CallEndedOnOtherDevice -> {
                Log.i(TAG, "📞 Call ${event.callId} ended on ${event.deviceType}")
            }
            is MultiDeviceEvent.DeviceStatusChanged -> {
                Log.i(TAG, "📱 Device status changed: ${event.deviceId} - ${event.status}")
                updateDeviceStatus(event)
            }
            is MultiDeviceEvent.HandleBusyStatusChanged -> {
                Log.i(TAG, "🔄 Handle busy status: ${event.isBusy}")
            }
        }
    }
    
    private fun registerDeviceWithServer(payload: JSONObject) {
        Log.d(TAG, "📤 Sending device registration")
        
        // Register device with multi-device capability
        socketManager.emit("register_android_device", payload)
        
        // Listen for registration confirmation
        socketManager.on("device_registration_confirmed") { data ->
            handleDeviceRegistrationConfirmed(data)
        }
        
        // Listen for registration errors
        socketManager.on("device_registration_error") { data ->
            handleDeviceRegistrationError(data)
        }
        
        // Listen for multi-device events
        setupMultiDeviceEventListeners()
    }
    
    private fun registerAgentOnline(handle: String, sourceId: String?) {
        Log.d(TAG, "📤 Registering agent online with handle: $handle")
        
        // Use existing socket manager method but with enhanced payload
        socketManager.goOnlineWithHandle(handle, sourceId)
    }
    
    private fun handleDeviceRegistrationConfirmed(data: Any?) {
        Log.i(TAG, "✅ Device registration confirmed")
        isRegistered = true
        
        when (data) {
            is JSONObject -> {
                val deviceId = data.optString("deviceId", "")
                val assignedCapabilities = data.optJSONArray("capabilities")
                Log.i(TAG, "📱 Assigned device ID: $deviceId")
                Log.i(TAG, "🔧 Capabilities: $assignedCapabilities")
            }
            is Map<*, *> -> {
                val deviceId = data["deviceId"]?.toString() ?: ""
                Log.i(TAG, "📱 Assigned device ID: $deviceId")
            }
        }
    }
    
    private fun handleDeviceRegistrationError(data: Any?) {
        Log.e(TAG, "❌ Device registration failed")
        isRegistered = false
        
        val errorMessage = when (data) {
            is JSONObject -> data.optString("error", "Unknown error")
            is Map<*, *> -> data["error"]?.toString() ?: "Unknown error"
            else -> "Registration failed"
        }
        
        Log.e(TAG, "Error details: $errorMessage")
        
        // Could implement retry logic here
        retryRegistrationAfterDelay()
    }
    
    private fun setupMultiDeviceEventListeners() {
        Log.d(TAG, "🔧 Setting up multi-device event listeners")
        
        // Call coordination events
        socketManager.on("call_accepted_on_other_device") { data ->
            val event = parseCallAcceptedEvent(data)
            if (event != null) {
                handleMultiDeviceEvent(event)
            }
        }
        
        socketManager.on("call_ended_on_other_device") { data ->
            val event = parseCallEndedEvent(data)
            if (event != null) {
                handleMultiDeviceEvent(event)
            }
        }
        
        // Device status events
        socketManager.on("device_status_changed") { data ->
            val event = parseDeviceStatusEvent(data)
            if (event != null) {
                handleMultiDeviceEvent(event)
            }
        }
        
        // Handle busy status
        socketManager.on("handle_busy_status") { data ->
            val event = parseHandleBusyEvent(data)
            if (event != null) {
                handleMultiDeviceEvent(event)
            }
        }
    }
    
    private fun parseCallAcceptedEvent(data: Any?): MultiDeviceEvent.CallAcceptedOnOtherDevice? {
        val callId: String
        val deviceType: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId", "").takeIf { it.isNotEmpty() } ?: return null
                deviceType = data.optString("deviceType", "web")
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString()?.takeIf { it.isNotEmpty() } ?: return null
                deviceType = data["deviceType"]?.toString() ?: "web"
            }
            else -> return null
        }
        
        return MultiDeviceEvent.CallAcceptedOnOtherDevice(callId, deviceType)
    }
    
    private fun parseCallEndedEvent(data: Any?): MultiDeviceEvent.CallEndedOnOtherDevice? {
        val callId: String
        val deviceType: String
        
        when (data) {
            is JSONObject -> {
                callId = data.optString("callId", "").takeIf { it.isNotEmpty() } ?: return null
                deviceType = data.optString("deviceType", "web")
            }
            is Map<*, *> -> {
                callId = data["callId"]?.toString()?.takeIf { it.isNotEmpty() } ?: return null
                deviceType = data["deviceType"]?.toString() ?: "web"
            }
            else -> return null
        }
        
        return MultiDeviceEvent.CallEndedOnOtherDevice(callId, deviceType)
    }
    
    private fun parseDeviceStatusEvent(data: Any?): MultiDeviceEvent.DeviceStatusChanged? {
        val deviceId: String
        val status: String
        
        when (data) {
            is JSONObject -> {
                deviceId = data.optString("deviceId", "").takeIf { it.isNotEmpty() } ?: return null
                status = data.optString("status", "unknown")
            }
            is Map<*, *> -> {
                deviceId = data["deviceId"]?.toString()?.takeIf { it.isNotEmpty() } ?: return null
                status = data["status"]?.toString() ?: "unknown"
            }
            else -> return null
        }
        
        return MultiDeviceEvent.DeviceStatusChanged(deviceId, status)
    }
    
    private fun parseHandleBusyEvent(data: Any?): MultiDeviceEvent.HandleBusyStatusChanged? {
        val isBusy: Boolean
        
        when (data) {
            is JSONObject -> {
                isBusy = data.optBoolean("isBusy", false)
            }
            is Map<*, *> -> {
                isBusy = data["isBusy"] as? Boolean ?: false
            }
            else -> return null
        }
        
        return MultiDeviceEvent.HandleBusyStatusChanged(isBusy)
    }
    
    private fun updateDeviceStatus(event: MultiDeviceEvent.DeviceStatusChanged) {
        Log.d(TAG, "📱 Updating device status: ${event.deviceId} -> ${event.status}")
        // Could update local state about other devices here
    }
    
    private fun retryRegistrationAfterDelay() {
        Log.d(TAG, "⏰ Scheduling registration retry in 5 seconds")
        
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            if (!isRegistered) {
                Log.d(TAG, "🔄 Retrying device registration")
                registerAsAndroidDevice()
            }
        }, 5000)
    }
    
    private fun getDeviceId(): String {
        // Use Android device ID for unique identification
        return try {
            android.provider.Settings.Secure.ANDROID_ID
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get device ID, using fallback")
            "android_${System.currentTimeMillis()}"
        }
    }
    
    private fun getFCMToken(): String? {
        // TODO: Get FCM token from FCMManager when available
        // For now, return null to indicate FCM not available yet
        return null
    }
    
    fun cleanup() {
        Log.i(TAG, "🧹 Cleaning up DeviceRegistrationManager")
        
        if (isRegistered) {
            // Unregister device before cleanup
            val payload = JSONObject().apply {
                put("deviceId", getDeviceId())
                put("reason", "app_shutdown")
            }
            socketManager.emit("unregister_device", payload)
        }
        
        isRegistered = false
        registrationData = null
    }
    
    // Public API
    fun isDeviceRegistered(): Boolean = isRegistered
    fun getRegistrationData(): DeviceRegistrationData? = registrationData
}

/**
 * Multi-device events that can occur in the handle ecosystem
 */
sealed class MultiDeviceEvent(val type: String) {
    data class CallAcceptedOnOtherDevice(
        val callId: String, 
        val deviceType: String
    ) : MultiDeviceEvent("call_accepted_other_device")
    
    data class CallEndedOnOtherDevice(
        val callId: String, 
        val deviceType: String
    ) : MultiDeviceEvent("call_ended_other_device")
    
    data class DeviceStatusChanged(
        val deviceId: String, 
        val status: String
    ) : MultiDeviceEvent("device_status_changed")
    
    data class HandleBusyStatusChanged(
        val isBusy: Boolean
    ) : MultiDeviceEvent("handle_busy_status_changed")
}