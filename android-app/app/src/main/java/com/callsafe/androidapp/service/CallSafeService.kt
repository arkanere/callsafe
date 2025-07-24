package com.callsafe.androidapp.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.callsafe.androidapp.R
import com.callsafe.androidapp.UserReceiveActivity
import com.callsafe.androidapp.models.CallState
import com.callsafe.androidapp.models.MultiDeviceCallState
import com.callsafe.androidapp.models.MultiDeviceStateHelper
import com.callsafe.androidapp.network.SocketManager
import com.callsafe.androidapp.utils.SessionManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect

/**
 * The new central CallSafe service that owns all call logic
 * This replaces CallSafeBackgroundService and manages everything through CallManager
 */
class CallSafeService : Service() {
    
    companion object {
        private const val TAG = "CallSafeService"
        
        fun startService(context: Context) {
            val intent = Intent(context, CallSafeService::class.java).apply {
                action = CallSafeServiceContract.ACTION_CONNECT
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stopService(context: Context) {
            val intent = Intent(context, CallSafeService::class.java)
            context.stopService(intent)
        }
        
        // Convenience methods for UI communication
        fun sendAction(context: Context, action: String, extras: Intent.() -> Unit = {}) {
            val intent = Intent(context, CallSafeService::class.java).apply {
                this.action = action
                extras()
            }
            context.startService(intent)
        }
    }
    
    // Service components
    private lateinit var callManager: CallManager
    private lateinit var sessionManager: SessionManager
    private lateinit var socketManager: SocketManager
    private lateinit var localBroadcastManager: LocalBroadcastManager
    
    // Multi-device components
    private lateinit var multiDeviceCoordinator: MultiDeviceCoordinator
    
    // Coroutine scope for managing async operations
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    
    // Binder for UI components that want direct access
    private val binder = CallSafeBinder()
    
    inner class CallSafeBinder : Binder() {
        fun getService(): CallSafeService = this@CallSafeService
        fun getCallState(): CallState = callManager.callState.value
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "🚀 CallSafe service created")
        
        // Initialize components
        sessionManager = SessionManager.getInstance(this)
        socketManager = SocketManager.getInstance()
        localBroadcastManager = LocalBroadcastManager.getInstance(this)
        
        // Initialize multi-device coordinator
        multiDeviceCoordinator = MultiDeviceCoordinator(this, socketManager, sessionManager)
        
        // Initialize call manager
        callManager = CallManager(this, socketManager, sessionManager)
        
        // Create notification channels
        createNotificationChannels()
        
        // Start observing call state changes
        startStateObserver()
        
        // Start observing multi-device state changes
        startMultiDeviceStateObserver()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "🎯 Service command: ${intent?.action}")
        
        when (intent?.action) {
            CallSafeServiceContract.ACTION_CONNECT -> {
                handleConnect()
            }
            CallSafeServiceContract.ACTION_DISCONNECT -> {
                handleDisconnect()
            }
            CallSafeServiceContract.ACTION_ACCEPT_CALL -> {
                val callId = intent.getStringExtra(CallSafeServiceContract.EXTRA_CALL_ID)
                if (callId != null) {
                    handleAcceptCall(callId)
                }
            }
            CallSafeServiceContract.ACTION_DECLINE_CALL -> {
                val callId = intent.getStringExtra(CallSafeServiceContract.EXTRA_CALL_ID)
                if (callId != null) {
                    handleDeclineCall(callId)
                }
            }
            CallSafeServiceContract.ACTION_END_CALL -> {
                val callId = intent.getStringExtra(CallSafeServiceContract.EXTRA_CALL_ID)
                if (callId != null) {
                    handleEndCall(callId)
                }
            }
            CallSafeServiceContract.ACTION_MUTE_CALL -> {
                handleToggleMute()
            }
            CallSafeServiceContract.ACTION_UNMUTE_CALL -> {
                handleToggleMute()
            }
            CallSafeServiceContract.ACTION_GET_STATE -> {
                broadcastCurrentState()
            }
            null -> {
                // Default action - start service and connect
                handleConnect()
            }
        }
        
        return START_STICKY // Restart if killed by system
    }
    
    override fun onBind(intent: Intent?): IBinder = binder
    
    override fun onDestroy() {
        Log.i(TAG, "🛑 CallSafe service destroyed")
        
        // Cleanup
        callManager.cleanup()
        multiDeviceCoordinator.cleanup()
        serviceScope.cancel()
        
        super.onDestroy()
    }
    
    // Action handlers
    
    private fun handleConnect() {
        Log.i(TAG, "🔗 Handling connect request")
        
        if (!sessionManager.isSessionValid()) {
            Log.e(TAG, "❌ Invalid session, cannot connect")
            broadcastError("Invalid session. Please login again.")
            stopSelf()
            return
        }
        
        // Start foreground service
        startForeground(
            CallSafeServiceContract.NOTIFICATION_ID_SERVICE,
            createServiceNotification("Starting...")
        )
        
        // Initialize multi-device coordination
        multiDeviceCoordinator.initialize()
        
        // Connect through call manager
        callManager.connect()
    }
    
    private fun handleDisconnect() {
        Log.i(TAG, "🔌 Handling disconnect request")
        callManager.disconnect()
        stopForeground(true)
        stopSelf()
    }
    
    private fun handleAcceptCall(callId: String) {
        Log.i(TAG, "✅ Handling accept call: $callId")
        
        // Check if call is still available (not accepted on other device)
        if (!multiDeviceCoordinator.isCallAcceptedOnOtherDevice(callId)) {
            // Accept on multi-device coordinator first
            multiDeviceCoordinator.acceptCallOnAndroid(callId)
            
            // Then process through call manager
            callManager.acceptCall(callId)
        } else {
            Log.w(TAG, "⚠️ Call $callId already accepted on another device")
            broadcastError("Call was already answered on another device")
        }
    }
    
    private fun handleDeclineCall(callId: String) {
        Log.i(TAG, "❌ Handling decline call: $callId")
        callManager.declineCall(callId)
    }
    
    private fun handleEndCall(callId: String) {
        Log.i(TAG, "🔚 Handling end call: $callId")
        callManager.endCall(callId)
    }
    
    private fun handleToggleMute() {
        Log.i(TAG, "🔇 Handling toggle mute")
        callManager.toggleMute()
    }
    
    // State management and broadcasting
    
    private fun startStateObserver() {
        serviceScope.launch {
            callManager.callState.collect { state ->
                handleStateChange(state)
            }
        }
    }
    
    private fun startMultiDeviceStateObserver() {
        serviceScope.launch {
            multiDeviceCoordinator.multiDeviceState.collect { state ->
                handleMultiDeviceStateChange(state)
            }
        }
    }
    
    private fun handleStateChange(newState: CallState) {
        Log.d(TAG, "🔄 State changed: ${newState.connectionStatus}, active call: ${newState.currentCall?.callId}")
        
        // Update service notification
        updateServiceNotification(newState)
        
        // Broadcast state change to UI
        broadcastStateChange(newState)
        
        // Handle specific state changes
        when {
            newState.currentCall != null -> {
                // New call started
                broadcastCallStarted(newState.currentCall!!)
            }
            newState.incomingCalls.isNotEmpty() -> {
                // New incoming call
                newState.incomingCalls.forEach { call ->
                    broadcastIncomingCall(call)
                }
            }
        }
    }
    
    private fun handleMultiDeviceStateChange(newState: MultiDeviceCallState) {
        Log.d(TAG, "🌐 Multi-device state changed: ${newState.callAcceptedByDevice}")
        
        // Update service notification with multi-device awareness
        updateServiceNotificationForMultiDevice(newState)
        
        // Broadcast multi-device state change to UI
        broadcastMultiDeviceStateChange(newState)
        
        // Handle specific multi-device events
        when {
            newState.callAcceptedByDevice == "web" -> {
                Log.i(TAG, "📱 Call accepted on web device")
                // Could show notification that call is active elsewhere
            }
            newState.callAcceptedByDevice == "android" -> {
                Log.i(TAG, "📱 Call accepted on this Android device")
            }
        }
    }
    
    private fun broadcastStateChange(state: CallState) {
        val intent = Intent(CallSafeServiceContract.ACTION_STATE_CHANGED).apply {
            putExtra(CallSafeServiceContract.EXTRA_CALL_STATE, state)
        }
        localBroadcastManager.sendBroadcast(intent)
    }
    
    private fun broadcastCurrentState() {
        broadcastStateChange(callManager.callState.value)
    }
    
    private fun broadcastConnectionStatus(status: String) {
        val intent = Intent(CallSafeServiceContract.ACTION_CONNECTION_STATUS).apply {
            putExtra(CallSafeServiceContract.EXTRA_CONNECTION_STATUS, status)
        }
        localBroadcastManager.sendBroadcast(intent)
    }
    
    private fun broadcastIncomingCall(call: com.callsafe.androidapp.models.IncomingCall) {
        val intent = Intent(CallSafeServiceContract.ACTION_INCOMING_CALL).apply {
            putExtra(CallSafeServiceContract.EXTRA_CALL_ID, call.callId)
            putExtra(CallSafeServiceContract.EXTRA_SOURCE_ID, call.sourceId)
        }
        localBroadcastManager.sendBroadcast(intent)
    }
    
    private fun broadcastCallStarted(call: com.callsafe.androidapp.models.ActiveCall) {
        val intent = Intent(CallSafeServiceContract.ACTION_CALL_STARTED).apply {
            putExtra(CallSafeServiceContract.EXTRA_CALL_ID, call.callId)
            putExtra(CallSafeServiceContract.EXTRA_SOURCE_ID, call.sourceId)
        }
        localBroadcastManager.sendBroadcast(intent)
    }
    
    private fun broadcastError(message: String) {
        val intent = Intent(CallSafeServiceContract.ACTION_ERROR).apply {
            putExtra(CallSafeServiceContract.EXTRA_ERROR_MESSAGE, message)
        }
        localBroadcastManager.sendBroadcast(intent)
    }
    
    private fun broadcastMultiDeviceStateChange(state: MultiDeviceCallState) {
        val intent = Intent(CallSafeServiceContract.ACTION_MULTI_DEVICE_STATE_CHANGED).apply {
            putExtra(CallSafeServiceContract.EXTRA_MULTI_DEVICE_STATE, state)
        }
        localBroadcastManager.sendBroadcast(intent)
    }
    
    // Notification management
    
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Service notification channel
            val serviceChannel = NotificationChannel(
                CallSafeServiceContract.CHANNEL_ID_SERVICE,
                "CallSafe Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows CallSafe service status"
                setShowBadge(false)
            }
            
            // Incoming calls notification channel  
            val callsChannel = NotificationChannel(
                CallSafeServiceContract.CHANNEL_ID_INCOMING_CALLS,
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Shows incoming call notifications"
                setShowBadge(true)
            }
            
            notificationManager.createNotificationChannel(serviceChannel)
            notificationManager.createNotificationChannel(callsChannel)
        }
    }
    
    private fun createServiceNotification(status: String): Notification {
        val intent = Intent(this, UserReceiveActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CallSafeServiceContract.CHANNEL_ID_SERVICE)
            .setContentTitle("CallSafe")
            .setContentText(status)
            .setSmallIcon(R.drawable.ic_call)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    private fun updateServiceNotification(state: CallState) {
        val status = when {
            state.currentCall != null -> "In call with ${state.currentCall.sourceId}"
            state.incomingCalls.isNotEmpty() -> "Incoming call from ${state.incomingCalls.first().sourceId}"
            state.isAgentRegistered -> "Ready to receive calls"
            state.isConnected -> "Connected"
            else -> state.connectionStatus
        }
        
        val notification = createServiceNotification(status)
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(CallSafeServiceContract.NOTIFICATION_ID_SERVICE, notification)
    }
    
    private fun updateServiceNotificationForMultiDevice(state: MultiDeviceCallState) {
        val status = MultiDeviceStateHelper.getStatusMessage(state)
        val notification = createServiceNotification(status)
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(CallSafeServiceContract.NOTIFICATION_ID_SERVICE, notification)
    }
    
    // Public API for direct service access
    
    fun getCurrentCallState(): CallState = callManager.callState.value
    
    fun acceptCall(callId: String) = callManager.acceptCall(callId)
    fun declineCall(callId: String) = callManager.declineCall(callId)
    fun endCall(callId: String) = callManager.endCall(callId)
    fun toggleMute() = callManager.toggleMute()
    
    // Multi-device API
    fun getCurrentMultiDeviceState(): MultiDeviceCallState = multiDeviceCoordinator.getCurrentMultiDeviceState()
    fun isCallAcceptedOnOtherDevice(callId: String): Boolean = multiDeviceCoordinator.isCallAcceptedOnOtherDevice(callId)
}