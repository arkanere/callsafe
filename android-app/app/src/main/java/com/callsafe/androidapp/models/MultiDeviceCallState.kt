package com.callsafe.androidapp.models

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * Represents the complete multi-device call state for a handle
 * This extends the basic CallState to include cross-device coordination information
 */
@Parcelize
data class MultiDeviceCallState(
    // Local device state (this Android device)
    val localDeviceState: DeviceState = DeviceState(),
    
    // Multi-device coordination state
    val otherDevicesActive: List<DeviceInfo> = emptyList(),
    val callAcceptedByDevice: String? = null, // "android", "web", null
    val callAcceptedTimestamp: Long = 0L,
    
    // Handle-level state (shared across all devices for this handle)
    val handleBusyWithCall: String? = null,
    val availableForCalls: Boolean = true,
    val handleLastActivity: Long = System.currentTimeMillis(),
    
    // Multi-device protocol information
    val protocolVersion: String = "2.0",
    val deviceSyncTimestamp: Long = System.currentTimeMillis()
) : Parcelable

/**
 * State specific to this Android device
 */
@Parcelize
data class DeviceState(
    // Connection state
    val isConnected: Boolean = false,
    val connectionStatus: String = "Disconnected",
    val lastConnectionAttempt: Long = 0L,
    
    // Agent registration state  
    val isAgentRegistered: Boolean = false,
    val agentHandle: String? = null,
    val sourceId: String? = null,
    
    // Device registration state
    val isDeviceRegistered: Boolean = false,
    val deviceId: String? = null,
    val deviceCapabilities: List<String> = emptyList(),
    
    // Active call state (on this device)
    val currentCall: ActiveCall? = null,
    
    // Incoming calls queue (for this device)
    val incomingCalls: List<IncomingCall> = emptyList(),
    
    // Call history (device-specific)
    val recentCallHistory: List<CallHistoryItem> = emptyList(),
    
    // Error state
    val lastError: String? = null,
    val errorTimestamp: Long = 0L,
    
    // Reception channels status
    val websocketConnected: Boolean = false,
    val fcmTokenAvailable: Boolean = false
) : Parcelable

/**
 * Information about other devices in the handle ecosystem
 */
@Parcelize
data class DeviceInfo(
    val deviceId: String,
    val deviceType: String, // "android", "web", "desktop"
    val isOnline: Boolean,
    val lastSeen: Long,
    val capabilities: List<String> = emptyList(),
    val currentCallId: String? = null // If this device is currently in a call
) : Parcelable

/**
 * Multi-device call coordination events
 */
sealed class MultiDeviceCallEvent {
    data class CallAcceptedOnOtherDevice(
        val callId: String,
        val deviceType: String,
        val deviceId: String,
        val timestamp: Long = System.currentTimeMillis()
    ) : MultiDeviceCallEvent()
    
    data class CallEndedOnOtherDevice(
        val callId: String,
        val deviceType: String,
        val deviceId: String,
        val reason: String,
        val timestamp: Long = System.currentTimeMillis()
    ) : MultiDeviceCallEvent()
    
    data class DeviceStatusChanged(
        val deviceId: String,
        val deviceType: String,
        val isOnline: Boolean,
        val timestamp: Long = System.currentTimeMillis()
    ) : MultiDeviceCallEvent()
    
    data class HandleBusyStatusChanged(
        val handleId: String,
        val isBusy: Boolean,
        val busyWithCallId: String?,
        val timestamp: Long = System.currentTimeMillis()
    ) : MultiDeviceCallEvent()
    
    data class CallReroutedBetweenDevices(
        val callId: String,
        val fromDevice: String,
        val toDevice: String,
        val reason: String,
        val timestamp: Long = System.currentTimeMillis()
    ) : MultiDeviceCallEvent()
}

/**
 * Multi-device call coordination status
 */
enum class CallCoordinationStatus {
    // Call available on all devices
    AVAILABLE_ALL_DEVICES,
    
    // Call accepted on this Android device
    ACCEPTED_THIS_DEVICE,
    
    // Call accepted on another device (web, etc.)
    ACCEPTED_OTHER_DEVICE,
    
    // Call was rerouted between devices
    REROUTED,
    
    // Call ended across all devices
    ENDED_ALL_DEVICES,
    
    // Call cancelled before acceptance
    CANCELLED,
    
    // Coordination failed (network issues, etc.)
    COORDINATION_FAILED
}

/**
 * Device capability flags for multi-device coordination
 */
object DeviceCapabilities {
    const val WEBRTC_VOICE = "webrtc_voice"
    const val WEBRTC_VIDEO = "webrtc_video"
    const val FCM_NOTIFICATIONS = "fcm_notifications"
    const val WEBSOCKET_REALTIME = "websocket_realtime"
    const val CALL_COORDINATION = "call_coordination"
    const val BACKGROUND_PROCESSING = "background_processing"
    const val UI_DISPLAY = "ui_display"
    const val AUDIO_OUTPUT = "audio_output"
    const val MICROPHONE_INPUT = "microphone_input"
}

/**
 * Helper functions for multi-device state management
 */
object MultiDeviceStateHelper {
    
    /**
     * Check if a call is currently active on any device for this handle
     */
    fun isHandleBusy(state: MultiDeviceCallState): Boolean {
        return state.handleBusyWithCall != null ||
               state.localDeviceState.currentCall != null ||
               state.otherDevicesActive.any { it.currentCallId != null }
    }
    
    /**
     * Get the device type that currently has an active call
     */
    fun getActiveCallDevice(state: MultiDeviceCallState): String? {
        return when {
            state.localDeviceState.currentCall != null -> "android"
            state.callAcceptedByDevice != null -> state.callAcceptedByDevice
            else -> state.otherDevicesActive.find { it.currentCallId != null }?.deviceType
        }
    }
    
    /**
     * Check if this Android device should show incoming call UI
     */
    fun shouldShowIncomingCallUI(state: MultiDeviceCallState, callId: String): Boolean {
        // Don't show if call already accepted on another device
        if (state.callAcceptedByDevice != null && state.callAcceptedByDevice != "android") {
            return false
        }
        
        // Don't show if handle is busy with another call
        if (state.handleBusyWithCall != null && state.handleBusyWithCall != callId) {
            return false
        }
        
        // Show if this device has the incoming call and no other device has accepted it
        return state.localDeviceState.incomingCalls.any { it.callId == callId }
    }
    
    /**
     * Get user-friendly status message for multi-device state
     */
    fun getStatusMessage(state: MultiDeviceCallState): String {
        return when {
            // Local device has active call
            state.localDeviceState.currentCall != null -> {
                "In call on this device"
            }
            
            // Call active on another device
            state.callAcceptedByDevice != null && state.callAcceptedByDevice != "android" -> {
                "Call active on ${state.callAcceptedByDevice} device"
            }
            
            // Handle busy with another call
            state.handleBusyWithCall != null -> {
                "Handle busy with another call"
            }
            
            // Incoming calls pending
            state.localDeviceState.incomingCalls.isNotEmpty() -> {
                val count = state.localDeviceState.incomingCalls.size
                if (count == 1) "Incoming call" else "$count incoming calls"
            }
            
            // Ready for calls
            state.availableForCalls && state.localDeviceState.isAgentRegistered -> {
                "Ready to receive calls"
            }
            
            // Connected but not registered
            state.localDeviceState.isConnected && !state.localDeviceState.isAgentRegistered -> {
                "Connected, registering..."
            }
            
            // Not connected
            !state.localDeviceState.isConnected -> {
                state.localDeviceState.connectionStatus
            }
            
            else -> "Ready"
        }
    }
    
    /**
     * Create a new state with updated device information
     */
    fun updateDeviceInfo(
        state: MultiDeviceCallState,
        deviceInfo: DeviceInfo
    ): MultiDeviceCallState {
        val updatedDevices = state.otherDevicesActive.toMutableList()
        val existingIndex = updatedDevices.indexOfFirst { it.deviceId == deviceInfo.deviceId }
        
        if (existingIndex >= 0) {
            updatedDevices[existingIndex] = deviceInfo
        } else {
            updatedDevices.add(deviceInfo)
        }
        
        return state.copy(
            otherDevicesActive = updatedDevices,
            deviceSyncTimestamp = System.currentTimeMillis()
        )
    }
    
    /**
     * Clear call from all devices (when call ends globally)
     */
    fun clearCallFromAllDevices(
        state: MultiDeviceCallState,
        callId: String
    ): MultiDeviceCallState {
        val updatedDevices = state.otherDevicesActive.map { device ->
            if (device.currentCallId == callId) {
                device.copy(currentCallId = null)
            } else {
                device
            }
        }
        
        return state.copy(
            localDeviceState = state.localDeviceState.copy(
                currentCall = if (state.localDeviceState.currentCall?.callId == callId) {
                    null
                } else {
                    state.localDeviceState.currentCall
                },
                incomingCalls = state.localDeviceState.incomingCalls.filter { 
                    it.callId != callId 
                }
            ),
            otherDevicesActive = updatedDevices,
            callAcceptedByDevice = if (state.handleBusyWithCall == callId) null else state.callAcceptedByDevice,
            handleBusyWithCall = if (state.handleBusyWithCall == callId) null else state.handleBusyWithCall,
            availableForCalls = true,
            deviceSyncTimestamp = System.currentTimeMillis()
        )
    }
}