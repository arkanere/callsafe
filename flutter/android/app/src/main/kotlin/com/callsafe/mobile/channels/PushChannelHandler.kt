package com.callsafe.mobile.channels

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import com.callsafe.mobile.fcm.CallSafeFirebaseMessagingService
import org.json.JSONObject

/**
 * Push notification platform channel handler
 * Phase 2: Integrates FCM and notification handling
 */
class PushChannelHandler(
    messenger: BinaryMessenger,
    private val context: Context
) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL_NAME)
    private val eventChannel = EventChannel(messenger, EVENT_CHANNEL_NAME)
    private var eventSink: EventChannel.EventSink? = null

    companion object {
        private const val TAG = "PushChannelHandler"
        private const val CHANNEL_NAME = "com.callsafe.push"
        private const val EVENT_CHANNEL_NAME = "com.callsafe.push.events"
    }

    init {
        channel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                eventSink = events
                setupFCMListener()
            }

            override fun onCancel(arguments: Any?) {
                eventSink = null
                CallSafeFirebaseMessagingService.fcmListener = null
            }
        })
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "requestPermissions" -> {
                // Android doesn't require explicit permission for FCM notifications
                result.success(true)
            }
            "getToken" -> {
                getToken(result)
            }
            "getInitialMessage" -> {
                result.success(takePendingCall())
            }
            "sendTokenToServer" -> {
                val token = call.argument<String>("token")
                if (token != null) {
                    // Store token locally
                    val sharedPreferences = context.getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
                    sharedPreferences.edit().putString("fcm_token", token).apply()
                    result.success(null)
                } else {
                    result.error("INVALID_ARGS", "Missing token", null)
                }
            }
            "showIncomingCallNotification" -> {
                val isVideo = call.argument<Boolean>("isVideo") ?: false
                CallSafeFirebaseMessagingService.showIncomingCallNotification(
                    context, if (isVideo) "video" else "voice"
                )
                result.success(null)
            }
            "clearNotification" -> {
                CallSafeFirebaseMessagingService.cancelIncomingCallNotification(context)
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    private fun getToken(result: MethodChannel.Result) {
        // First try to get cached token
        val sharedPreferences = context.getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
        val cachedToken = sharedPreferences.getString("fcm_token", null)

        if (cachedToken != null) {
            Log.d(TAG, "Returning cached FCM token")
            result.success(cachedToken)
            return
        }

        // If no cached token, get from Firebase
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                Log.d(TAG, "FCM token retrieved: $token")

                // Cache the token
                sharedPreferences.edit().putString("fcm_token", token).apply()

                result.success(token)
            } else {
                Log.e(TAG, "Failed to get FCM token", task.exception)
                result.error("TOKEN_ERROR", "Failed to get FCM token", task.exception?.message)
            }
        }
    }

    /// Return-and-clear the call push cached while the app was killed
    /// (see CallSafeFirebaseMessagingService). Null if absent or stale.
    private fun takePendingCall(): Map<String, Any?>? {
        val prefs = context.getSharedPreferences(
            CallSafeFirebaseMessagingService.PREFS_NAME, Context.MODE_PRIVATE
        )
        // The app is in the foreground now; the wake notification is obsolete.
        CallSafeFirebaseMessagingService.cancelIncomingCallNotification(context)

        val json = prefs.getString(CallSafeFirebaseMessagingService.PENDING_CALL_KEY, null)
            ?: return null
        val receivedAt =
            prefs.getLong(CallSafeFirebaseMessagingService.PENDING_CALL_RECEIVED_AT_KEY, 0L)

        prefs.edit()
            .remove(CallSafeFirebaseMessagingService.PENDING_CALL_KEY)
            .remove(CallSafeFirebaseMessagingService.PENDING_CALL_RECEIVED_AT_KEY)
            .apply()

        val age = System.currentTimeMillis() - receivedAt
        if (age > CallSafeFirebaseMessagingService.PENDING_CALL_MAX_AGE_MS) {
            Log.d(TAG, "Pending call is stale (${age}ms), ignoring")
            return null
        }

        return try {
            val obj = JSONObject(json)
            obj.keys().asSequence().associateWith { obj.get(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse pending call", e)
            null
        }
    }

    private fun setupFCMListener() {
        CallSafeFirebaseMessagingService.fcmListener = object : CallSafeFirebaseMessagingService.Companion.FCMListener {
            override fun onMessageReceived(data: Map<String, String>) {
                Log.d(TAG, "FCM message received, forwarding to Flutter")
                eventSink?.success(mapOf(
                    "type" to "message",
                    "data" to data
                ))
            }

            override fun onTokenRefreshed(token: String) {
                Log.d(TAG, "FCM token refreshed, forwarding to Flutter")
                eventSink?.success(mapOf(
                    "type" to "tokenRefresh",
                    "token" to token
                ))
            }
        }
    }

    fun dispose() {
        CallSafeFirebaseMessagingService.fcmListener = null
        channel.setMethodCallHandler(null)
    }
}
