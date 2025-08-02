package tech.callsafe.business.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import tech.callsafe.business.R
import tech.callsafe.business.activities.IncomingCallActivity
import tech.callsafe.business.receivers.CallActionReceiver
import tech.callsafe.business.utils.RingtoneManager

class CallSafeFirebaseMessagingService : FirebaseMessagingService() {
    
    companion object {
        const val CALL_CHANNEL_ID = "call_notifications"
    }
    
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        android.util.Log.d("CallSafeFirebase", "[FLOW] onMessageReceived() - Entry point for FCM notification")
        
        val messageType = remoteMessage.data["type"]
        
        when (messageType) {
            "call:incoming" -> {
                android.util.Log.d("CallSafeFirebase", "[FLOW] onMessageReceived() - Processing call:incoming notification")
                val callAttemptId = remoteMessage.data["callAttemptId"] ?: return
                val sourceId = remoteMessage.data["sourceId"] ?: return
                val timestamp = remoteMessage.data["timestamp"]?.toLongOrNull() ?: return
                
                android.util.Log.d("CallSafeFirebase", "[FLOW] onMessageReceived() - Calling showIncomingCallNotification()")
                showIncomingCallNotification(callAttemptId, sourceId, timestamp)
                
                // Start ringtone
                RingtoneManager.getInstance(this).startRingtone()
            }
            
            "call:cancelled" -> {
                android.util.Log.d("CallSafeFirebase", "[FLOW] onMessageReceived() - Processing call:cancelled notification")
                val callAttemptId = remoteMessage.data["callAttemptId"] ?: return
                android.util.Log.d("CallSafeFirebase", "[FLOW] onMessageReceived() - Calling cancelIncomingCallNotification()")
                cancelIncomingCallNotification(callAttemptId)
                
                // Stop ringtone when call is cancelled
                RingtoneManager.getInstance(this).stopRingtone()
            }
        }
    }
    
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        android.util.Log.d("CallSafeFirebase", "[FLOW] onNewToken() - FCM token updated")
        
        // Update FCM token on server
        updateFCMToken(token)
    }
    
    private fun showIncomingCallNotification(
        callAttemptId: String,
        sourceId: String,
        timestamp: Long
    ) {
        android.util.Log.d("CallSafeFirebase", "[FLOW] showIncomingCallNotification() - Creating incoming call UI")
        // Create notification channel if needed
        createNotificationChannel()
        
        // Create full-screen incoming call intent
        android.util.Log.d("CallSafeFirebase", "[FLOW] showIncomingCallNotification() - Creating intent for IncomingCallActivity")
        val fullScreenIntent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("callAttemptId", callAttemptId)
            putExtra("sourceId", sourceId)
            putExtra("timestamp", timestamp)
        }
        
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Accept call action
        val acceptIntent = Intent(this, CallActionReceiver::class.java).apply {
            action = "ACCEPT_CALL"
            putExtra("callAttemptId", callAttemptId)
        }
        val acceptPendingIntent = PendingIntent.getBroadcast(
            this, 1, acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Decline call action
        val declineIntent = Intent(this, CallActionReceiver::class.java).apply {
            action = "DECLINE_CALL"
            putExtra("callAttemptId", callAttemptId)
        }
        val declinePendingIntent = PendingIntent.getBroadcast(
            this, 2, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Build notification
        val notification = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call)
            .setContentTitle("Incoming Call")
            .setContentText("Customer calling from $sourceId")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .addAction(R.drawable.ic_call_accept, "Accept", acceptPendingIntent)
            .addAction(R.drawable.ic_call_decline, "Decline", declinePendingIntent)
            .build()
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(callAttemptId.hashCode(), notification)
        android.util.Log.d("CallSafeFirebase", "[FLOW] showIncomingCallNotification() - Notification displayed, triggering IncomingCallActivity")
    }
    
    private fun cancelIncomingCallNotification(callAttemptId: String) {
        android.util.Log.d("CallSafeFirebase", "[FLOW] cancelIncomingCallNotification() - Cancelling notification for callAttemptId: $callAttemptId")
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.cancel(callAttemptId.hashCode())
    }
    
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CALL_CHANNEL_ID,
            "Incoming Calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for incoming calls"
            setShowBadge(true)
        }
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.createNotificationChannel(channel)
    }
    
    private fun updateFCMToken(token: String) {
        android.util.Log.d("CallSafeFirebase", "[FLOW] updateFCMToken() - Storing FCM token locally")
        // Store token locally for device registration
        val sharedPreferences = getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
        sharedPreferences.edit().putString("fcm_token", token).apply()
        
        // TODO: Send token to server when socket connects
    }
}