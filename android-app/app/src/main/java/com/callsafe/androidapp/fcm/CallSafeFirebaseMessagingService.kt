package com.callsafe.androidapp.fcm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.callsafe.androidapp.IncomingCallActivityNew
import com.callsafe.androidapp.R
import com.callsafe.androidapp.service.CallSafeService
import com.callsafe.androidapp.service.CallReceptionCoordinator
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
        
        // CRITICAL: Send token to server if user is logged in
        if (sessionManager.isSessionValid()) {
            val userHandle = sessionManager.getUserHandle()
            Log.i(TAG, "📤 Sending FCM token to server for handle: $userHandle")
            
            // CRITICAL: Also update the SocketManager with new token
            try {
                val socketManager = com.callsafe.androidapp.network.SocketManager.getInstance()
                socketManager.setFCMToken(token)
                Log.i(TAG, "✅ FCM token updated in SocketManager")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to update SocketManager with FCM token", e)
            }
            
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
            "call_cancelled" -> {
                Log.i(TAG, "❌ Handling call cancelled notification")
                handleCallCancelledNotification(data)
            }
            "call_answered_elsewhere" -> {
                Log.i(TAG, "📱 Call answered on another device")
                handleCallAnsweredElsewhereNotification(data)
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
        
        // Ensure CallSafe service is running when incoming call arrives
        val sessionManager = SessionManager.getInstance(this)
        if (sessionManager.isSessionValid()) {
            Log.i(TAG, "🔗 Ensuring CallSafe service is running for incoming call")
            CallSafeService.startService(this)
            
            // Check if call is still available before showing UI
            validateCallStillAvailable(data) { isValid ->
                if (isValid) {
                    // Show full-screen incoming call activity
                    showIncomingCallActivity(callId, sourceId, callerName)
                    
                    // Also show notification as backup
                    showIncomingCallNotification(callId, sourceId, callerName)
                } else {
                    // Call was already accepted on web - show brief notification
                    showCallAnsweredElsewhereNotification("web")
                }
            }
        }
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
    
    private fun handleCallCancelledNotification(data: Map<String, String>) {
        val callId = data["callId"] ?: ""
        Log.i(TAG, "❌ Call cancelled notification for callId: $callId")
        
        // Cancel any existing call notifications
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID)
        
        // Handle call cancellation from multi-device coordinator
        // The service should already be handling this via socket events
    }
    
    private fun handleCallAnsweredElsewhereNotification(data: Map<String, String>) {
        val callId = data["callId"] ?: ""
        val deviceType = data["deviceType"] ?: "web"
        
        Log.i(TAG, "📱 Call $callId answered on $deviceType device")
        
        // Cancel any existing call notifications
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(NOTIFICATION_ID)
        
        // Show brief notification that call was answered elsewhere
        showCallAnsweredElsewhereNotification(deviceType)
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
    
    private fun showCallAnsweredElsewhereNotification(deviceType: String) {
        val deviceName = when (deviceType) {
            "web" -> "web browser"
            "desktop" -> "desktop app"
            "android" -> "Android device"
            else -> "another device"
        }
        
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call) 
            .setContentTitle("Call Answered")
            .setContentText("Call answered on $deviceName")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setTimeoutAfter(5000) // Auto-dismiss after 5 seconds
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID + 2, notification)
        
        Log.i(TAG, "✅ Call answered elsewhere notification shown")
    }
    
    private fun validateCallStillAvailable(callData: Map<String, String>, callback: (Boolean) -> Unit) {
        val callId = callData["callId"]
        if (callId == null) {
            callback(false)
            return
        }
        
        Log.d(TAG, "🔍 Validating call availability via service: $callId")
        
        // For now, we'll assume the call is available since this is an FCM notification
        // In a production system, you might want to make a quick API call to verify
        // or check with the service if it's running
        
        // Try to get the service state to check if call is still valid
        try {
            // Simple validation - if we get FCM, assume call is available unless proven otherwise
            // The service and multi-device coordinator will handle the actual validation
            callback(true)
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Could not validate call availability, assuming available", e)
            callback(true) // Err on the side of showing the call
        }
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
        if (handle == null) {
            Log.w(TAG, "⚠️ Cannot send FCM token - no handle available")
            return
        }
        
        Log.i(TAG, "📤 Implementing FCM token API call to server")
        Log.i(TAG, "🎯 Token: ${token.take(20)}...")
        Log.i(TAG, "👤 Handle: $handle")
        
        // Use the SignalingApiService for FCM token registration
        try {
            val signalingApiService = com.callsafe.androidapp.network.RetrofitInstance.getSignalingApiService()
            
            // Create request using proper FCMTokenRequest model
            val request = com.callsafe.androidapp.models.FCMTokenRequest(
                handle = handle,
                fcmToken = token,
                platform = "android",
                sourceId = SessionManager.getInstance(this).getSourceId()
            )
            
            // Use coroutine for async API call
            kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                try {
                    val response = signalingApiService.updateFCMToken(request)
                    if (response.isSuccessful) {
                        Log.i(TAG, "✅ FCM token sent to signaling server successfully via API")
                        Log.i(TAG, "✅ Response: ${response.body()}")
                    } else {
                        Log.e(TAG, "❌ Failed to send FCM token via signaling API: ${response.code()} - ${response.message()}")
                        Log.e(TAG, "❌ Response body: ${response.errorBody()?.string()}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "❌ Exception during FCM token API call", e)
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception setting up FCM token API call", e)
        }
    }
}