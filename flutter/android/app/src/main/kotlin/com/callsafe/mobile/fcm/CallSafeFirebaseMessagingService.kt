package com.callsafe.mobile.fcm

import android.content.Context
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Firebase Cloud Messaging service for CallSafe
 * Simplified for Flutter architecture - forwards messages to Flutter layer
 */
class CallSafeFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "CallSafeFirebase"

        // Listener interface for FCM events
        interface FCMListener {
            fun onMessageReceived(data: Map<String, String>)
            fun onTokenRefreshed(token: String)
        }

        // Static listener that PushChannelHandler will set
        @Volatile
        var fcmListener: FCMListener? = null
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        android.util.Log.d(TAG, "[FCM] onMessageReceived() - Processing FCM message")

        // Forward message data to Flutter via listener
        if (remoteMessage.data.isNotEmpty()) {
            android.util.Log.d(TAG, "[FCM] Message data: ${remoteMessage.data}")
            fcmListener?.onMessageReceived(remoteMessage.data)
        } else {
            android.util.Log.w(TAG, "[FCM] Received message with no data")
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        android.util.Log.d(TAG, "[FCM] onNewToken() - FCM token refreshed: $token")

        // Store token locally
        val sharedPreferences = getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
        sharedPreferences.edit().putString("fcm_token", token).apply()

        // Forward to Flutter via listener
        fcmListener?.onTokenRefreshed(token)
    }
}
