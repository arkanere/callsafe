package com.callsafe.androidapp.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.callsafe.androidapp.models.CallState
import com.callsafe.androidapp.service.CallSafeService
import com.callsafe.androidapp.service.CallSafeServiceContract

/**
 * Helper class to simplify communication with CallSafeService from UI components
 * This handles the intent sending and broadcast receiving complexity
 */
class CallSafeServiceHelper(
    private val context: Context,
    private val listener: CallSafeServiceListener
) {
    companion object {
        private const val TAG = "CallSafeServiceHelper"
    }
    
    private val localBroadcastManager = LocalBroadcastManager.getInstance(context)
    private var isRegistered = false
    
    // Broadcast receiver for service events
    private val serviceReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return
            
            Log.d(TAG, "📡 Received broadcast: ${intent.action}")
            
            when (intent.action) {
                CallSafeServiceContract.ACTION_STATE_CHANGED -> {
                    val state = intent.getParcelableExtra<CallState>(CallSafeServiceContract.EXTRA_CALL_STATE)
                    if (state != null) {
                        listener.onStateChanged(state)
                    }
                }
                
                CallSafeServiceContract.ACTION_CONNECTION_STATUS -> {
                    val status = intent.getStringExtra(CallSafeServiceContract.EXTRA_CONNECTION_STATUS)
                    if (status != null) {
                        listener.onConnectionStatusChanged(status)
                    }
                }
                
                CallSafeServiceContract.ACTION_INCOMING_CALL -> {
                    val callId = intent.getStringExtra(CallSafeServiceContract.EXTRA_CALL_ID) ?: ""
                    val sourceId = intent.getStringExtra(CallSafeServiceContract.EXTRA_SOURCE_ID) ?: ""
                    listener.onIncomingCall(callId, sourceId)
                }
                
                CallSafeServiceContract.ACTION_CALL_STARTED -> {
                    val callId = intent.getStringExtra(CallSafeServiceContract.EXTRA_CALL_ID) ?: ""
                    val sourceId = intent.getStringExtra(CallSafeServiceContract.EXTRA_SOURCE_ID) ?: ""
                    listener.onCallStarted(callId, sourceId)
                }
                
                CallSafeServiceContract.ACTION_CALL_ENDED -> {
                    val callId = intent.getStringExtra(CallSafeServiceContract.EXTRA_CALL_ID) ?: ""
                    listener.onCallEnded(callId)
                }
                
                CallSafeServiceContract.ACTION_ERROR -> {
                    val error = intent.getStringExtra(CallSafeServiceContract.EXTRA_ERROR_MESSAGE) ?: ""
                    listener.onError(error)
                }
            }
        }
    }
    
    /**
     * Register to receive broadcasts from the service
     * Call this in onResume() or onCreate()
     */
    fun register() {
        if (isRegistered) return
        
        Log.d(TAG, "📝 Registering for service broadcasts")
        
        val filter = IntentFilter().apply {
            addAction(CallSafeServiceContract.ACTION_STATE_CHANGED)
            addAction(CallSafeServiceContract.ACTION_CONNECTION_STATUS)
            addAction(CallSafeServiceContract.ACTION_INCOMING_CALL)
            addAction(CallSafeServiceContract.ACTION_CALL_STARTED)
            addAction(CallSafeServiceContract.ACTION_CALL_ENDED)
            addAction(CallSafeServiceContract.ACTION_ERROR)
        }
        
        localBroadcastManager.registerReceiver(serviceReceiver, filter)
        isRegistered = true
        
        // Request current state
        requestCurrentState()
    }
    
    /**
     * Unregister from service broadcasts  
     * Call this in onPause() or onDestroy()
     */
    fun unregister() {
        if (!isRegistered) return
        
        Log.d(TAG, "🗑️ Unregistering from service broadcasts")
        localBroadcastManager.unregisterReceiver(serviceReceiver)
        isRegistered = false
    }
    
    // Service command methods
    
    /**
     * Start the service and connect to server
     */
    fun connect() {
        Log.d(TAG, "🔗 Sending connect command")
        CallSafeService.sendAction(context, CallSafeServiceContract.ACTION_CONNECT)
    }
    
    /**
     * Disconnect from server and stop service
     */
    fun disconnect() {
        Log.d(TAG, "🔌 Sending disconnect command")
        CallSafeService.sendAction(context, CallSafeServiceContract.ACTION_DISCONNECT)
    }
    
    /**
     * Accept an incoming call
     */
    fun acceptCall(callId: String) {
        Log.d(TAG, "✅ Sending accept call command: $callId")
        CallSafeService.sendAction(context, CallSafeServiceContract.ACTION_ACCEPT_CALL) {
            putExtra(CallSafeServiceContract.EXTRA_CALL_ID, callId)
        }
    }
    
    /**
     * Decline an incoming call
     */
    fun declineCall(callId: String) {
        Log.d(TAG, "❌ Sending decline call command: $callId")
        CallSafeService.sendAction(context, CallSafeServiceContract.ACTION_DECLINE_CALL) {
            putExtra(CallSafeServiceContract.EXTRA_CALL_ID, callId)
        }
    }
    
    /**
     * End the current active call
     */
    fun endCall(callId: String) {
        Log.d(TAG, "🔚 Sending end call command: $callId")
        CallSafeService.sendAction(context, CallSafeServiceContract.ACTION_END_CALL) {
            putExtra(CallSafeServiceContract.EXTRA_CALL_ID, callId)
        }
    }
    
    /**
     * Toggle mute state for current call
     */
    fun toggleMute() {
        Log.d(TAG, "🔇 Sending toggle mute command")
        CallSafeService.sendAction(context, CallSafeServiceContract.ACTION_MUTE_CALL)
    }
    
    /**
     * Request current state from service
     */
    fun requestCurrentState() {
        Log.d(TAG, "📊 Requesting current state")
        CallSafeService.sendAction(context, CallSafeServiceContract.ACTION_GET_STATE)
    }
    
    /**
     * Start the CallSafe service
     */
    fun startService() {
        Log.d(TAG, "🚀 Starting CallSafe service")
        CallSafeService.startService(context)
    }
    
    /**
     * Stop the CallSafe service
     */
    fun stopService() {
        Log.d(TAG, "🛑 Stopping CallSafe service")
        CallSafeService.stopService(context)
    }
}

/**
 * Interface for receiving service events
 * Implement this in your Activity/Fragment
 */
interface CallSafeServiceListener {
    
    /**
     * Called when the service state changes
     */
    fun onStateChanged(state: CallState)
    
    /**
     * Called when connection status changes
     */
    fun onConnectionStatusChanged(status: String)
    
    /**
     * Called when a new call comes in
     */
    fun onIncomingCall(callId: String, sourceId: String)
    
    /**
     * Called when a call starts (accepted and connecting)
     */
    fun onCallStarted(callId: String, sourceId: String)
    
    /**
     * Called when a call ends
     */
    fun onCallEnded(callId: String)
    
    /**
     * Called when an error occurs
     */
    fun onError(message: String)
}