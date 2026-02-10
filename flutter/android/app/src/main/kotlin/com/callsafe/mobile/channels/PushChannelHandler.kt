package com.callsafe.mobile.channels

import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Push notification platform channel handler
 * Phase 1: Pure channel plumbing - routes messages between Dart and Kotlin
 * Phase 2: Will integrate FCM and notification handling
 */
class PushChannelHandler(messenger: BinaryMessenger) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL_NAME)

    init {
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "requestPermissions" -> {
                // Stub: return permission granted
                result.success(true)
            }
            "getToken" -> {
                // Stub: return mock FCM token
                result.success("stub-fcm-token-android")
            }
            "showIncomingCallNotification" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val callerName = call.argument<String>("callerName")
                val isVideo = call.argument<Boolean>("isVideo")
                // Stub: return success
                result.success(null)
            }
            "clearNotification" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                // Stub: return success
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    fun dispose() {
        channel.setMethodCallHandler(null)
    }

    companion object {
        private const val CHANNEL_NAME = "com.callsafe.push"
    }
}
