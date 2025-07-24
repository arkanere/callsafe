package com.callsafe.androidapp.base

import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import com.callsafe.androidapp.models.CallState
import com.callsafe.androidapp.models.MultiDeviceCallState
import com.callsafe.androidapp.utils.CallSafeServiceHelper
import com.callsafe.androidapp.utils.CallSafeServiceListener

/**
 * Base activity that provides CallSafe service communication
 * All activities that need to interact with the service should extend this
 */
abstract class CallSafeBaseActivity : AppCompatActivity(), CallSafeServiceListener {
    
    companion object {
        private const val TAG = "CallSafeBaseActivity"
    }
    
    protected lateinit var serviceHelper: CallSafeServiceHelper
    protected var currentState: CallState = CallState()
    protected var currentMultiDeviceState: MultiDeviceCallState = MultiDeviceCallState()
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize service helper
        serviceHelper = CallSafeServiceHelper(this, this)
        
        Log.d(TAG, "🏗️ Base activity created: ${this::class.simpleName}")
    }
    
    override fun onResume() {
        super.onResume()
        Log.d(TAG, "▶️ Base activity resumed: ${this::class.simpleName}")
        
        // Register for service events
        serviceHelper.register()
    }
    
    override fun onPause() {
        super.onPause()
        Log.d(TAG, "⏸️ Base activity paused: ${this::class.simpleName}")
        
        // Unregister from service events
        serviceHelper.unregister()
    }
    
    // Default implementations of CallSafeServiceListener
    // Subclasses can override these as needed
    
    override fun onStateChanged(state: CallState) {
        Log.d(TAG, "🔄 State changed in ${this::class.simpleName}: ${state.connectionStatus}")
        currentState = state
        handleStateChange(state)
    }
    
    override fun onConnectionStatusChanged(status: String) {
        Log.d(TAG, "🔌 Connection status: $status")
        handleConnectionStatusChange(status)
    }
    
    override fun onIncomingCall(callId: String, sourceId: String) {
        Log.d(TAG, "📞 Incoming call in ${this::class.simpleName}: $callId from $sourceId")
        handleIncomingCall(callId, sourceId)
    }
    
    override fun onCallStarted(callId: String, sourceId: String) {
        Log.d(TAG, "📱 Call started in ${this::class.simpleName}: $callId")
        handleCallStarted(callId, sourceId)
    }
    
    override fun onCallEnded(callId: String) {
        Log.d(TAG, "📱 Call ended in ${this::class.simpleName}: $callId")
        handleCallEnded(callId)
    }
    
    override fun onError(message: String) {
        Log.e(TAG, "❌ Error in ${this::class.simpleName}: $message")
        handleError(message)
    }
    
    // Abstract/overridable methods for subclasses
    
    /**
     * Called when the service state changes
     * Override this to update your UI based on the new state
     */
    protected open fun handleStateChange(state: CallState) {
        // Default implementation does nothing
        // Subclasses should override to update UI
    }
    
    /**
     * Called when connection status changes
     * Override this to show connection status in UI
     */
    protected open fun handleConnectionStatusChange(status: String) {
        // Default implementation does nothing
    }
    
    /**
     * Called when an incoming call arrives
     * Override this to show incoming call UI
     */
    protected open fun handleIncomingCall(callId: String, sourceId: String) {
        // Default implementation does nothing
    }
    
    /**
     * Called when a call starts (after being accepted)
     * Override this to update call UI
     */
    protected open fun handleCallStarted(callId: String, sourceId: String) {
        // Default implementation does nothing
    }
    
    /**
     * Called when a call ends
     * Override this to clean up call UI
     */
    protected open fun handleCallEnded(callId: String) {
        // Default implementation does nothing
    }
    
    /**
     * Called when an error occurs
     * Override this to show error messages
     */
    protected open fun handleError(message: String) {
        // Default implementation does nothing
        // Subclasses should show error to user
    }
    
    // Convenience methods for common service operations
    
    protected fun connectToService() {
        serviceHelper.connect()
    }
    
    protected fun disconnectFromService() {
        serviceHelper.disconnect()
    }
    
    protected fun acceptCall(callId: String) {
        serviceHelper.acceptCall(callId)
    }
    
    protected fun declineCall(callId: String) {
        serviceHelper.declineCall(callId)
    }
    
    protected fun endCall(callId: String) {
        serviceHelper.endCall(callId)
    }
    
    protected fun toggleMute() {
        serviceHelper.toggleMute()
    }
    
    protected fun startCallSafeService() {
        serviceHelper.startService()
    }
    
    protected fun stopCallSafeService() {
        serviceHelper.stopService()
    }
    
    // Helper methods for checking state
    
    protected fun isConnected(): Boolean = currentState.isConnected
    
    protected fun isAgentRegistered(): Boolean = currentState.isAgentRegistered
    
    protected fun hasActiveCall(): Boolean = currentState.currentCall != null
    
    protected fun hasIncomingCalls(): Boolean = currentState.incomingCalls.isNotEmpty()
    
    protected fun getConnectionStatus(): String = currentState.connectionStatus
}