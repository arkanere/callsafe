package com.callsafe.androidapp.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.callsafe.androidapp.IncomingCallActivity
import com.callsafe.androidapp.R
import com.callsafe.androidapp.UserReceiveActivity
import com.callsafe.androidapp.network.SocketManager
import com.callsafe.androidapp.utils.PermissionHelper
import com.callsafe.androidapp.utils.SessionManager
import org.json.JSONObject

class CallSafeBackgroundService : Service() {
    
    companion object {
        private const val TAG = "CallSafeBackgroundService"
        private const val NOTIFICATION_ID = 2001
        private const val CHANNEL_ID = "callsafe_background"
        private const val CHANNEL_NAME = "CallSafe Background Service"
        
        fun startService(context: Context) {
            val intent = Intent(context, CallSafeBackgroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
        
        fun stopService(context: Context) {
            val intent = Intent(context, CallSafeBackgroundService::class.java)
            context.stopService(intent)
        }
    }
    
    private var socketManager: SocketManager? = null
    private var sessionManager: SessionManager? = null
    private var isServiceRunning = false
    
    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "🚀 CallSafe Background Service created")
        
        sessionManager = SessionManager.getInstance(this)
        socketManager = SocketManager.getInstance()
        
        createNotificationChannel()
        // Note: setupSocketEventListeners() will be called after connection is established
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "🚀 Background service started")
        
        // Handle call actions
        val action = intent?.getStringExtra("action")
        when (action) {
            "decline_call" -> {
                val callId = intent.getStringExtra("callId")
                if (callId != null) {
                    handleDeclineCall(callId)
                }
                return START_STICKY
            }
        }
        
        if (!isServiceRunning) {
            // Log permission status for debugging
            PermissionHelper.logPermissionStatus(this)
            
            startForeground(NOTIFICATION_ID, createServiceNotification())
            connectToServerAsAgent()
            isServiceRunning = true
        }
        
        // Return START_STICKY to restart service if killed by system
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? {
        return null // This is a started service, not bound
    }
    
    override fun onDestroy() {
        Log.i(TAG, "🛑 Background service destroyed")
        
        // Disconnect from server
        socketManager?.goOffline()
        isServiceRunning = false
        
        super.onDestroy()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps CallSafe running in background to receive calls"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createServiceNotification(): Notification {
        val intent = Intent(this, UserReceiveActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CallSafe Active")
            .setContentText("Ready to receive calls")
            .setSmallIcon(R.drawable.ic_call)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    private fun connectToServerAsAgent() {
        val sessionManager = this.sessionManager ?: return
        val socketManager = this.socketManager ?: return
        
        if (!sessionManager.isSessionValid()) {
            Log.e(TAG, "❌ Invalid session, cannot connect as agent")
            stopSelf()
            return
        }
        
        val handle = sessionManager.getUserHandle()
        val sourceId = sessionManager.getSourceId()
        
        if (handle == null) {
            Log.e(TAG, "❌ No handle found, cannot connect as agent")
            stopSelf()
            return
        }
        
        Log.i(TAG, "🔗 Connecting to server as agent with handle: $handle")
        
        socketManager.connect { success, error ->
            if (success) {
                Log.i(TAG, "✅ Connected to server in background")
                
                // Setup event listeners after successful connection
                setupSocketEventListeners()
                
                // Register as agent after successful connection
                socketManager.goOnlineWithHandle(handle, sourceId.takeIf { !it.isNullOrEmpty() })
                
                updateServiceNotification("Connected - Ready for calls")
            } else {
                Log.e(TAG, "❌ Failed to connect to server: $error")
                updateServiceNotification("Connection failed")
                
                // Retry connection after delay
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    connectToServerAsAgent()
                }, 10000) // Retry after 10 seconds
            }
        }
    }
    
    private fun setupSocketEventListeners() {
        val socketManager = this.socketManager ?: return
        
        Log.i(TAG, "🔧 Setting up socket event listeners for background service")
        
        // Listen for incoming calls
        socketManager.on("new_incoming_call") { data ->
            Log.i(TAG, "📞 BACKGROUND: Received new incoming call")
            handleIncomingCallInBackground(data)
        }
        Log.i(TAG, "✅ BACKGROUND: Registered listener for 'new_incoming_call'")
        
        // Listen for agent registration confirmation
        socketManager.on("agent_registered") { data ->
            Log.i(TAG, "✅ BACKGROUND: Agent registered successfully")
            updateServiceNotification("Ready to receive calls")
        }
        
        // Listen for call routing
        socketManager.on("call_routed") { data ->
            Log.i(TAG, "📍 BACKGROUND: Call routed")
            handleIncomingCallInBackground(data)
        }
        
        // Listen for missed calls
        socketManager.on("missed_call") { data ->
            Log.i(TAG, "📵 BACKGROUND: Missed call notification")
            // Update service notification back to ready state
            updateServiceNotification("Ready to receive calls")
        }
        
        // Listen for connection events
        socketManager.on("connect") { _ ->
            Log.i(TAG, "🔗 BACKGROUND: Socket connected")
        }
        
        socketManager.on("disconnect") { _ ->
            Log.i(TAG, "🔌 BACKGROUND: Socket disconnected - attempting reconnect")
            // Attempt to reconnect after a delay
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                connectToServerAsAgent()
            }, 5000)
        }
        
        Log.i(TAG, "✅ BACKGROUND: Event listeners setup completed")
    }
    
    private fun handleIncomingCallInBackground(data: Any?) {
        Log.i(TAG, "🚨 BACKGROUND: Processing incoming call")
        
        try {
            val callData = when (data) {
                is JSONObject -> data
                is Array<*> -> if (data.isNotEmpty()) data[0] as? JSONObject else null
                else -> null
            } ?: return
            
            val callId = callData.optString("callId", "")
            val sourceId = callData.optString("sourceId", "")
            val callerName = callData.optString("callerName", "Unknown Caller")
            
            if (callId.isEmpty()) {
                Log.e(TAG, "❌ BACKGROUND: Invalid call data - missing callId")
                return
            }
            
            Log.i(TAG, "📞 BACKGROUND: Launching incoming call activity")
            Log.i(TAG, "Call ID: $callId, Source: $sourceId, Caller: $callerName")
            
            // Launch the incoming call activity
            launchIncomingCallActivity(callId, sourceId, callerName)
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ BACKGROUND: Error processing incoming call", e)
        }
    }
    
    private fun launchIncomingCallActivity(callId: String, sourceId: String, callerName: String) {
        Log.i(TAG, "🚨 BACKGROUND: Showing full-screen incoming call notification")
        
        // Update background service notification to show incoming call
        updateServiceNotification("📞 Incoming call from $callerName")
        
        // Check if we can show full-screen notifications
        if (!canUseFullScreenIntent()) {
            Log.w(TAG, "⚠️ Full-screen intent permission not granted, trying alternative approach")
            showIncomingCallNotificationFallback(callId, sourceId, callerName)
            return
        }
        
        // Create intent for incoming call activity
        val intent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                   Intent.FLAG_ACTIVITY_CLEAR_TOP or
                   Intent.FLAG_ACTIVITY_SINGLE_TOP or
                   Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or
                   Intent.FLAG_ACTIVITY_NO_USER_ACTION
            putExtra("callId", callId)
            putExtra("sourceId", sourceId)
            putExtra("callerName", callerName)
            putExtra("handle", sessionManager?.getUserHandle() ?: "")
        }
        
        // Create full-screen intent for the notification
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, 
            callId.hashCode(), 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Create the notification channel for incoming calls if not exists
        createIncomingCallNotificationChannel()
        
        // Create full-screen notification
        val notification = NotificationCompat.Builder(this, "incoming_call_channel")
            .setContentTitle("Incoming Call")
            .setContentText("Call from $callerName")
            .setSmallIcon(R.drawable.ic_call)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setAutoCancel(false)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            // Add action buttons
            .addAction(R.drawable.ic_call, "Answer", createAnswerPendingIntent(callId))
            .addAction(R.drawable.ic_call_end, "Decline", createDeclinePendingIntent(callId))
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(callId.hashCode(), notification)
        
        Log.i(TAG, "✅ BACKGROUND: Full-screen notification displayed")
        
        // Also try to launch activity directly (will work if app is in foreground or has overlay permission)
        try {
            startActivity(intent)
            Log.i(TAG, "✅ BACKGROUND: Activity launch attempted")
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ BACKGROUND: Activity launch failed: ${e.message}")
        }
    }
    
    private fun canUseFullScreenIntent(): Boolean {
        return PermissionHelper.canUseFullScreenIntent(this)
    }
    
    private fun showIncomingCallNotificationFallback(callId: String, sourceId: String, callerName: String) {
        Log.i(TAG, "🔔 BACKGROUND: Showing fallback notification for incoming call")
        
        // Create intent for incoming call activity
        val intent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                   Intent.FLAG_ACTIVITY_CLEAR_TOP or
                   Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("callId", callId)
            putExtra("sourceId", sourceId)
            putExtra("callerName", callerName)
            putExtra("handle", sessionManager?.getUserHandle() ?: "")
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this, 
            callId.hashCode(), 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Create the notification channel for incoming calls if not exists
        createIncomingCallNotificationChannel()
        
        // Create high-priority notification without full-screen intent
        val notification = NotificationCompat.Builder(this, "incoming_call_channel")
            .setContentTitle("📞 INCOMING CALL")
            .setContentText("Tap to answer call from $callerName")
            .setSmallIcon(R.drawable.ic_call)
            .setLargeIcon(null) // Could add caller image here
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(pendingIntent)
            .setAutoCancel(false)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setTimeoutAfter(30000) // Auto-dismiss after 30 seconds
            // Add action buttons
            .addAction(R.drawable.ic_call, "Answer", createAnswerPendingIntent(callId))
            .addAction(R.drawable.ic_call_end, "Decline", createDeclinePendingIntent(callId))
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(callId.hashCode(), notification)
        
        Log.i(TAG, "✅ BACKGROUND: Fallback notification displayed")
        
        // Try to start activity as well
        try {
            startActivity(intent)
            Log.i(TAG, "✅ BACKGROUND: Activity launch attempted in fallback")
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ BACKGROUND: Activity launch failed in fallback: ${e.message}")
        }
    }
    
    private fun createIncomingCallNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "incoming_call_channel",
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for incoming calls"
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableVibration(true)
                enableLights(true)
                setBypassDnd(true)
                vibrationPattern = longArrayOf(0, 1000, 500, 1000)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createAnswerPendingIntent(callId: String): PendingIntent {
        val intent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("callId", callId)
            putExtra("action", "answer")
            putExtra("handle", sessionManager?.getUserHandle() ?: "")
        }
        return PendingIntent.getActivity(
            this, 
            "answer_$callId".hashCode(), 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
    
    private fun createDeclinePendingIntent(callId: String): PendingIntent {
        val intent = Intent(this, CallSafeBackgroundService::class.java).apply {
            putExtra("action", "decline_call")
            putExtra("callId", callId)
        }
        return PendingIntent.getService(
            this, 
            "decline_$callId".hashCode(), 
            intent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
    
    private fun handleDeclineCall(callId: String) {
        Log.i(TAG, "📞 BACKGROUND: Declining call: $callId")
        
        // Cancel the notification
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(callId.hashCode())
        
        // Update background service notification back to ready state
        updateServiceNotification("Ready to receive calls")
        
        // Send decline signal to server via socket if available
        val socketManager = this.socketManager
        if (socketManager != null) {
            // You can implement the decline call logic here
            // For example: socketManager.declineCall(callId)
            Log.i(TAG, "📞 BACKGROUND: Call declined via notification")
        }
    }
    
    private fun updateServiceNotification(status: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CallSafe Active")
            .setContentText(status)
            .setSmallIcon(R.drawable.ic_call)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }
}