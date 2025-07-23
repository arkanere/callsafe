package com.callsafe.androidapp.fcm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.callsafe.androidapp.IncomingCallActivity
import com.callsafe.androidapp.R
import com.callsafe.androidapp.utils.SessionManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class CallSafeFirebaseMessagingService : FirebaseMessagingService() {
    
    companion object {
        private const val TAG = "FCMService"
        private const val CHANNEL_ID = "incoming_calls"
        private const val CHANNEL_NAME = "Incoming Calls"
        private const val NOTIFICATION_ID = 1001
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.i(TAG, "🔥 Firebase Messaging Service created")
    }
    
    override fun onNewToken(token: String) {
        Log.i(TAG, "🎯 New FCM token received: ${token.take(20)}...")
        
        // Store token locally
        val sessionManager = SessionManager.getInstance(this)
        sessionManager.saveFCMToken(token)
        
        // Send token to server if user is logged in
        if (sessionManager.isSessionValid()) {
            val userHandle = sessionManager.getUserHandle()
            Log.i(TAG, "📤 Sending FCM token to server for handle: $userHandle")
            // TODO: Send token to server via API call
            sendTokenToServer(token, userHandle)
        } else {
            Log.w(TAG, "⚠️ User not logged in, will send token later")
        }
    }
    
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.i(TAG, "📨 FCM message received from: ${remoteMessage.from}")
        Log.i(TAG, "📋 Message data: ${remoteMessage.data}")
        Log.i(TAG, "📋 Message notification: ${remoteMessage.notification}")
        
        // Check if message contains data payload
        if (remoteMessage.data.isNotEmpty()) {
            Log.i(TAG, "✅ Processing data payload")
            handleDataMessage(remoteMessage.data)
        }
        
        // Check if message contains notification payload
        remoteMessage.notification?.let {
            Log.i(TAG, "✅ Processing notification payload")
            Log.i(TAG, "📰 Title: ${it.title}")
            Log.i(TAG, "📰 Body: ${it.body}")
        }
    }
    
    private fun handleDataMessage(data: Map<String, String>) {
        val messageType = data["type"]
        Log.i(TAG, "🔍 Message type: $messageType")
        
        when (messageType) {
            "incoming_call" -> {
                Log.i(TAG, "📞 Handling incoming call notification")
                handleIncomingCallNotification(data)
            }
            "call_ended" -> {
                Log.i(TAG, "🔚 Handling call ended notification")
                handleCallEndedNotification(data)
            }
            "missed_call" -> {
                Log.i(TAG, "📵 Handling missed call notification")
                handleMissedCallNotification(data)
            }
            else -> {
                Log.w(TAG, "⚠️ Unknown message type: $messageType")
                // Handle as generic notification
                handleGenericNotification(data)
            }
        }
    }
    
    private fun handleIncomingCallNotification(data: Map<String, String>) {
        val callId = data["callId"] ?: ""
        val sourceId = data["sourceId"] ?: ""
        val callerName = data["callerName"] ?: "Unknown Caller"
        
        Log.i(TAG, "📞 Incoming call - ID: $callId, Source: $sourceId, Caller: $callerName")
        
        if (callId.isEmpty()) {
            Log.e(TAG, "❌ Invalid call data - missing callId")
            return
        }
        
        // Show full-screen incoming call activity
        showIncomingCallActivity(callId, sourceId, callerName)
        
        // Also show notification as backup
        showIncomingCallNotification(callId, sourceId, callerName)
    }
    
    private fun handleCallEndedNotification(data: Map<String, String>) {
        val callId = data["callId"] ?: ""
        Log.i(TAG, "🔚 Call ended notification for callId: $callId")
        
        // Cancel any existing call notifications
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID)
        
        // Could show a brief "Call ended" notification
        showSimpleNotification("Call Ended", "Your call has ended")
    }
    
    private fun handleMissedCallNotification(data: Map<String, String>) {
        val callId = data["callId"] ?: ""
        val sourceId = data["sourceId"] ?: ""
        val callerName = data["callerName"] ?: "Unknown Caller"
        
        Log.i(TAG, "📵 Missed call from: $callerName")
        
        // Show missed call notification
        showMissedCallNotification(callerName, sourceId)
    }
    
    private fun handleGenericNotification(data: Map<String, String>) {
        val title = data["title"] ?: "CallSafe"
        val body = data["body"] ?: "You have a new message"
        
        Log.i(TAG, "📬 Generic notification: $title - $body")
        showSimpleNotification(title, body)
    }
    
    private fun showIncomingCallActivity(callId: String, sourceId: String, callerName: String) {
        Log.i(TAG, "🚀 Launching incoming call activity")
        
        val intent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                   Intent.FLAG_ACTIVITY_CLEAR_TOP or 
                   Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("callId", callId)
            putExtra("sourceId", sourceId)
            putExtra("callerName", callerName)
            putExtra("fromFCM", true)
        }
        
        try {
            startActivity(intent)
            Log.i(TAG, "✅ Incoming call activity launched")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to launch incoming call activity", e)
            // Fallback to notification only
            showIncomingCallNotification(callId, sourceId, callerName)
        }
    }
    
    private fun showIncomingCallNotification(callId: String, sourceId: String, callerName: String) {
        Log.i(TAG, "🔔 Showing incoming call notification")
        
        // Intent to open incoming call activity
        val intent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("callId", callId)
            putExtra("sourceId", sourceId)
            putExtra("callerName", callerName)
            putExtra("fromFCM", true)
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call) // You'll need this icon
            .setContentTitle("Incoming Call")
            .setContentText("Call from $callerName ($sourceId)")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pendingIntent, true) // Full-screen for incoming calls
            .setAutoCancel(true)
            .setOngoing(true) // Can't be dismissed while call is active
            .setSound(android.provider.Settings.System.DEFAULT_RINGTONE_URI)
            .setVibrate(longArrayOf(0, 1000, 500, 1000))
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
        
        Log.i(TAG, "✅ Incoming call notification shown")
    }
    
    private fun showMissedCallNotification(callerName: String, sourceId: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call_missed) // You'll need this icon
            .setContentTitle("Missed Call")
            .setContentText("Missed call from $callerName ($sourceId)")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID + 1, notification)
    }
    
    private fun showSimpleNotification(title: String, body: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification) // You'll need this icon
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for incoming calls"
                enableLights(true)
                enableVibration(true)
                setBypassDnd(true) // Bypass Do Not Disturb for calls
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
            
            Log.i(TAG, "✅ Notification channel created: $CHANNEL_ID")
        }
    }
    
    private fun sendTokenToServer(token: String, handle: String?) {
        // TODO: Implement API call to send FCM token to server
        // This should be called whenever:
        // 1. New token is received
        // 2. User logs in
        // 3. User changes handle
        
        Log.i(TAG, "📤 TODO: Send FCM token to server")
        Log.i(TAG, "🎯 Token: ${token.take(20)}...")
        Log.i(TAG, "👤 Handle: $handle")
        
        // Example implementation:
        /*
        val apiService = RetrofitClient.getApiService()
        lifecycleScope.launch {
            try {
                val response = apiService.updateFCMToken(handle, token)
                if (response.isSuccessful) {
                    Log.i(TAG, "✅ FCM token sent to server successfully")
                } else {
                    Log.e(TAG, "❌ Failed to send FCM token: ${response.errorBody()}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error sending FCM token", e)
            }
        }
        */
    }
}