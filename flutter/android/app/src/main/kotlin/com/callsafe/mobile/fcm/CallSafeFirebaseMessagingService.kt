package com.callsafe.mobile.fcm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.callsafe.mobile.MainActivity
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/**
 * Firebase Cloud Messaging service for CallSafe
 * Simplified for Flutter architecture - forwards messages to Flutter layer.
 *
 * When no Flutter engine is attached (app killed, woken by a data push),
 * the pending call is cached in SharedPreferences and a full-screen
 * incoming-call notification launches MainActivity; on startup the Dart
 * side reads the pending call via getInitialMessage and connects the
 * socket — the server then re-delivers call:incoming.
 */
class CallSafeFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "CallSafeFirebase"
        private const val CHANNEL_ID = "incoming_calls"
        const val NOTIFICATION_ID = 0xCA11

        const val PREFS_NAME = "CallSafePrefs"
        const val PENDING_CALL_KEY = "pending_call"
        const val PENDING_CALL_RECEIVED_AT_KEY = "pending_call_received_at"

        // A ringing call is only answerable within the 30s ring window.
        const val PENDING_CALL_MAX_AGE_MS = 30_000L

        // Listener interface for FCM events
        interface FCMListener {
            fun onMessageReceived(data: Map<String, String>)
            fun onTokenRefreshed(token: String)
        }

        // Static listener that PushChannelHandler will set
        @Volatile
        var fcmListener: FCMListener? = null

        /// Post the full-screen incoming-call notification. Also called from
        /// PushChannelHandler when a ring arrives over the WebSocket while
        /// the app is backgrounded.
        fun showIncomingCallNotification(context: Context, callType: String) {
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Incoming calls",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .build()
                    )
                }
                notificationManager.createNotificationChannel(channel)
            }

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle("Incoming $callType call")
                .setContentText("Tap to answer")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setTimeoutAfter(PENDING_CALL_MAX_AGE_MS)
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true)
                .build()

            notificationManager.notify(NOTIFICATION_ID, notification)
        }

        fun cancelIncomingCallNotification(context: Context) {
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(NOTIFICATION_ID)
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        android.util.Log.d(TAG, "[FCM] onMessageReceived() - Processing FCM message")

        if (remoteMessage.data.isEmpty()) {
            android.util.Log.w(TAG, "[FCM] Received message with no data")
            return
        }
        android.util.Log.d(TAG, "[FCM] Message data: ${remoteMessage.data}")

        val listener = fcmListener
        if (listener != null) {
            // Flutter engine running — forward directly
            listener.onMessageReceived(remoteMessage.data)

            // Backgrounded (engine alive, no resumed activity): the Dart
            // layer can't wake the screen, so post the full-screen
            // notification here too.
            if (!MainActivity.isInForeground &&
                remoteMessage.data.containsKey("callAttemptId")
            ) {
                showIncomingCallNotification(this, remoteMessage.data["callType"] ?: "voice")
            }
        } else if (remoteMessage.data.containsKey("callAttemptId")) {
            // App killed: cache the call and wake the user
            cachePendingCall(remoteMessage.data)
            showIncomingCallNotification(this, remoteMessage.data["callType"] ?: "voice")
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        android.util.Log.d(TAG, "[FCM] onNewToken() - FCM token refreshed: $token")

        // Store token locally
        val sharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        sharedPreferences.edit().putString("fcm_token", token).apply()

        // Forward to Flutter via listener
        fcmListener?.onTokenRefreshed(token)
    }

    private fun cachePendingCall(data: Map<String, String>) {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PENDING_CALL_KEY, JSONObject(data as Map<*, *>).toString())
            .putLong(PENDING_CALL_RECEIVED_AT_KEY, System.currentTimeMillis())
            .apply()
    }

}
