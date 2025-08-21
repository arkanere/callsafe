package tech.callsafe.business.services

import android.content.Context
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import tech.callsafe.business.R
import tech.callsafe.business.activities.ActiveCallActivity
import tech.callsafe.business.activities.IncomingCallActivity
import tech.callsafe.business.managers.CallManager
import tech.callsafe.business.managers.CallNotificationManager
import tech.callsafe.business.receivers.CallActionReceiver
import tech.callsafe.business.utils.RingtoneManager

class CallSafeFirebaseMessagingService : FirebaseMessagingService() {
    
    override fun onCreate() {
        super.onCreate()
        android.util.Log.d("CallSafeFirebase", "[FCM] onCreate() - Initializing FCM service")
        // Notification channel is now managed by CallNotificationManager
    }
    
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        android.util.Log.d("CallSafeFirebase", "[FCM] onMessageReceived() - Processing FCM message")
        
        val messageType = remoteMessage.data["type"]
        
        when (messageType) {
            "call:incoming" -> {
                android.util.Log.d("CallSafeFirebase", "[FCM] onMessageReceived() - Handling call:incoming message")
                val callAttemptId = remoteMessage.data["callAttemptId"] ?: return
                val sourceId = remoteMessage.data["sourceId"] ?: return
                val timestamp = remoteMessage.data["timestamp"]?.toLongOrNull() ?: return
                
                android.util.Log.d("CallSafeFirebase", "[FCM] onMessageReceived() - Creating incoming call notification via CallNotificationManager")
                val notificationManager = CallNotificationManager.getInstance(this)
                notificationManager.updateNotificationForCallState(
                    callAttemptId = callAttemptId,
                    callState = CallManager.CallState.INCOMING,
                    sourceId = sourceId,
                    timestamp = timestamp
                )
                
                // Start ringtone
                RingtoneManager.getInstance(this).startRingtone()
            }
            
            "call:cancelled" -> {
                android.util.Log.d("CallSafeFirebase", "[FCM] onMessageReceived() - Handling call:cancelled message")
                val callAttemptId = remoteMessage.data["callAttemptId"] ?: return
                android.util.Log.d("CallSafeFirebase", "[FCM] onMessageReceived() - Cancelling incoming call notification via CallNotificationManager")
                
                val notificationManager = CallNotificationManager.getInstance(this)
                notificationManager.cancelNotification(callAttemptId)
                
                // Stop ringtone when call is cancelled
                RingtoneManager.getInstance(this).stopRingtone()
            }
        }
    }
    
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        android.util.Log.d("CallSafeFirebase", "[FCM] onNewToken() - FCM token refreshed")
        
        // Update FCM token on server
        updateFCMToken(token)
    }
    
    
    private fun updateFCMToken(token: String) {
        android.util.Log.d("CallSafeFirebase", "[TOKEN] updateFCMToken() - Processing new FCM token")
        // Store token locally
        val sharedPreferences = getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
        sharedPreferences.edit().putString("fcm_token", token).apply()
        
        // Send token to server immediately via temporary socket connection
        sendTokenToServer(token)
    }
    
    private fun sendTokenToServer(token: String) {
        android.util.Log.d("CallSafeFirebase", "[TOKEN] sendTokenToServer() - Sending token to signaling server")
        
        // Only send if user is logged in
        val sharedPreferences = getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
        val isLoggedIn = sharedPreferences.getBoolean("is_logged_in", false)
        
        if (!isLoggedIn) {
            android.util.Log.d("CallSafeFirebase", "[TOKEN] sendTokenToServer() - User not authenticated, skipping")
            return
        }
        
        try {
            // Get SocketManager instance and register token
            val socketManager = tech.callsafe.business.managers.SocketManager.getInstance(this)
            socketManager.registerFCMTokenOnly(token)
        } catch (e: Exception) {
            android.util.Log.e("CallSafeFirebase", "[TOKEN] sendTokenToServer() - Failed to send token", e)
        }
    }
}