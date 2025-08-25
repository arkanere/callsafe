package tech.callsafe.business.managers

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import tech.callsafe.business.R
import tech.callsafe.business.activities.ActiveCallActivity
import tech.callsafe.business.activities.IncomingCallActivity
import tech.callsafe.business.receivers.CallActionReceiver

class CallNotificationManager private constructor(private val context: Context) {
    
    private val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    
    // Track current notification state to prevent unnecessary updates
    private var currentNotificationState: NotificationState? = null
    private var currentCallAttemptId: String? = null
    
    enum class NotificationState {
        INCOMING,       // Show accept/decline actions
        CONNECTING,     // Show connecting status
        CONNECTED,      // Show return to call action
        ENDED           // Remove notification
    }
    
    companion object {
        private const val TAG = "CallNotificationManager"
        private const val CALL_CHANNEL_ID = "calls"
        
        @Volatile
        private var INSTANCE: CallNotificationManager? = null
        
        fun getInstance(context: Context): CallNotificationManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: CallNotificationManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    init {
        android.util.Log.d(TAG, "[INIT] CallNotificationManager initialized")
        createNotificationChannel()
    }
    
    /**
     * Updates notification based on call state
     * This is the main entry point for all notification updates
     */
    fun updateNotificationForCallState(
        callAttemptId: String,
        callState: CallManager.CallState,
        sourceId: String? = null,
        timestamp: Long = System.currentTimeMillis()
    ) {
        android.util.Log.d(TAG, "[UPDATE] updateNotificationForCallState() - callId: $callAttemptId, state: $callState")
        
        val notificationState = mapCallStateToNotificationState(callState)
        android.util.Log.d(TAG, "[UPDATE] Mapped to notification state: $notificationState")
        
        // Skip update if same state and same call
        if (currentNotificationState == notificationState && currentCallAttemptId == callAttemptId) {
            android.util.Log.d(TAG, "[UPDATE] Skipping duplicate notification update")
            return
        }
        
        currentCallAttemptId = callAttemptId
        currentNotificationState = notificationState
        
        when (notificationState) {
            NotificationState.INCOMING -> {
                android.util.Log.d(TAG, "[UPDATE] Showing incoming call notification")
                showIncomingCallNotification(callAttemptId, sourceId ?: "Customer", timestamp)
            }
            NotificationState.CONNECTING -> {
                android.util.Log.d(TAG, "[UPDATE] Showing connecting notification")
                showConnectingNotification(callAttemptId, sourceId ?: "Customer")
            }
            NotificationState.CONNECTED -> {
                android.util.Log.d(TAG, "[UPDATE] Showing active call notification")
                showActiveCallNotification(callAttemptId, sourceId ?: "Customer")
            }
            NotificationState.ENDED -> {
                android.util.Log.d(TAG, "[UPDATE] Removing notification")
                cancelNotification(callAttemptId)
            }
        }
    }
    
    /**
     * Force cancel notification (for cleanup scenarios)
     */
    fun cancelNotification(callAttemptId: String) {
        android.util.Log.d(TAG, "[CANCEL] cancelNotification() - callId: $callAttemptId")
        val notificationId = callAttemptId.hashCode()
        notificationManager.cancel(notificationId)
        
        // Clear state if this was the current notification
        if (currentCallAttemptId == callAttemptId) {
            currentNotificationState = null
            currentCallAttemptId = null
        }
    }
    
    private fun mapCallStateToNotificationState(callState: CallManager.CallState): NotificationState {
        return when (callState) {
            CallManager.CallState.IDLE -> NotificationState.INCOMING
            CallManager.CallState.INCOMING -> NotificationState.INCOMING
            CallManager.CallState.CONNECTING -> NotificationState.CONNECTING
            CallManager.CallState.CONNECTED -> NotificationState.CONNECTED
            CallManager.CallState.ENDED -> NotificationState.ENDED
            CallManager.CallState.CANCELLED -> NotificationState.ENDED
        }
    }
    
    private fun showIncomingCallNotification(callAttemptId: String, sourceId: String, timestamp: Long) {
        android.util.Log.d(TAG, "[INCOMING] Creating incoming call notification")
        
        // Full-screen intent for standard incoming call UI
        val fullScreenIntent = Intent(context, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            putExtra("callAttemptId", callAttemptId)
            putExtra("sourceId", sourceId)
            putExtra("timestamp", timestamp)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Accept call action - directly launch ActiveCallActivity with auto-accept
        val acceptIntent = Intent(context, ActiveCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            putExtra("callAttemptId", callAttemptId)
            putExtra("sourceId", sourceId)
            putExtra("autoAccept", true)
        }
        val acceptPendingIntent = PendingIntent.getActivity(
            context, 1, acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Decline call action
        val declineIntent = Intent(context, CallActionReceiver::class.java).apply {
            action = "DECLINE_CALL"
            putExtra("callAttemptId", callAttemptId)
        }
        val declinePendingIntent = PendingIntent.getBroadcast(
            context, 2, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Build incoming call notification
        val person = androidx.core.app.Person.Builder()
            .setName("Customer from $sourceId")
            .setImportant(true)
            .build()
        
        val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setStyle(
                NotificationCompat.CallStyle.forIncomingCall(
                    person,
                    declinePendingIntent,
                    acceptPendingIntent
                )
            )
            .build()
        
        notificationManager.notify(callAttemptId.hashCode(), notification)
        android.util.Log.d(TAG, "[INCOMING] Incoming call notification displayed")
    }
    
    private fun showConnectingNotification(callAttemptId: String, sourceId: String) {
        android.util.Log.d(TAG, "[CONNECTING] Creating connecting notification")
        
        // Return to call intent
        val returnIntent = Intent(context, ActiveCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            putExtra("callAttemptId", callAttemptId)
            putExtra("sourceId", sourceId)
        }
        val returnPendingIntent = PendingIntent.getActivity(
            context, 3, returnIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call)
            .setContentTitle("Connecting...")
            .setContentText("Connecting to customer from $sourceId")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setContentIntent(returnPendingIntent)
            .build()
        
        notificationManager.notify(callAttemptId.hashCode(), notification)
        android.util.Log.d(TAG, "[CONNECTING] Connecting notification displayed")
    }
    
    private fun showActiveCallNotification(callAttemptId: String, sourceId: String) {
        android.util.Log.d(TAG, "[ACTIVE] Creating active call notification")
        
        // Return to call intent
        val returnIntent = Intent(context, ActiveCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            putExtra("callAttemptId", callAttemptId)
            putExtra("sourceId", sourceId)
        }
        val returnPendingIntent = PendingIntent.getActivity(
            context, 4, returnIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // End call action
        val endCallIntent = Intent(context, CallActionReceiver::class.java).apply {
            action = "END_CALL"
            putExtra("callAttemptId", callAttemptId)
        }
        val endCallPendingIntent = PendingIntent.getBroadcast(
            context, 5, endCallIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call)
            .setContentTitle("Active Call")
            .setContentText("Connected to customer from $sourceId")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setContentIntent(returnPendingIntent)
            .addAction(R.drawable.ic_call_end, "End Call", endCallPendingIntent)
            .build()
        
        notificationManager.notify(callAttemptId.hashCode(), notification)
        android.util.Log.d(TAG, "[ACTIVE] Active call notification displayed")
    }
    
    private fun createNotificationChannel() {
        android.util.Log.d(TAG, "[CHANNEL] createNotificationChannel() - Creating 'calls' channel")
        val channel = NotificationChannel(
            CALL_CHANNEL_ID,
            "Call Notifications",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for incoming and active calls"
            setShowBadge(true)
            enableVibration(true)
            setSound(null, null) // Let ringtone manager handle sounds
        }
        
        notificationManager.createNotificationChannel(channel)
    }
}