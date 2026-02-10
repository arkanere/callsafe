package com.callsafe.mobile.channels

import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.telecom.TelecomManager
import android.util.Log
import com.callsafe.mobile.call.CallConnectionService
import com.callsafe.mobile.call.CallForegroundService
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Platform channel handler for call management
 * Controls ConnectionService, foreground service, and call state
 */
class CallChannelHandler(
    messenger: BinaryMessenger,
    private val context: Context
) : MethodChannel.MethodCallHandler {

    private val channel = MethodChannel(messenger, CHANNEL_NAME)
    private val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager

    companion object {
        private const val TAG = "CallChannelHandler"
        private const val CHANNEL_NAME = "com.callsafe.call"
    }

    init {
        channel.setMethodCallHandler(this)
        setupCallbacks()
        registerPhoneAccount()
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            result.error("UNSUPPORTED", "ConnectionService requires Android 8.0+", null)
            return
        }

        when (call.method) {
            "showIncomingCall" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val callerName = call.argument<String>("callerName")
                val isVideo = call.argument<Boolean>("isVideo") ?: false

                if (callAttemptId != null && callerName != null) {
                    showIncomingCall(callAttemptId, callerName, isVideo, result)
                } else {
                    result.error("INVALID_ARGS", "Missing required arguments", null)
                }
            }

            "startOutgoingCall" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val recipientName = call.argument<String>("recipientName")
                val isVideo = call.argument<Boolean>("isVideo") ?: false

                if (callAttemptId != null && recipientName != null) {
                    startOutgoingCall(callAttemptId, recipientName, isVideo, result)
                } else {
                    result.error("INVALID_ARGS", "Missing required arguments", null)
                }
            }

            "endCall" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                if (callAttemptId != null) {
                    endCall(callAttemptId, result)
                } else {
                    result.error("INVALID_ARGS", "Missing callAttemptId", null)
                }
            }

            "setCallActive" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                if (callAttemptId != null) {
                    setCallActive(callAttemptId, result)
                } else {
                    result.error("INVALID_ARGS", "Missing callAttemptId", null)
                }
            }

            "startForegroundService" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val callerName = call.argument<String>("callerName")
                if (callAttemptId != null && callerName != null) {
                    CallForegroundService.startService(context, callAttemptId, callerName)
                    result.success(null)
                } else {
                    result.error("INVALID_ARGS", "Missing required arguments", null)
                }
            }

            "stopForegroundService" -> {
                CallForegroundService.stopService(context)
                result.success(null)
            }

            else -> result.notImplemented()
        }
    }

    private fun registerPhoneAccount() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && telecomManager != null) {
            val componentName = ComponentName(context, CallConnectionService::class.java)
            CallConnectionService.registerPhoneAccount(telecomManager, componentName)
        }
    }

    private fun setupCallbacks() {
        CallConnectionService.onAnswerCallback = { callAttemptId ->
            Log.d(TAG, "Call answered: $callAttemptId")
            channel.invokeMethod("onCallAnswered", mapOf("callAttemptId" to callAttemptId))
        }

        CallConnectionService.onRejectCallback = { callAttemptId ->
            Log.d(TAG, "Call rejected: $callAttemptId")
            channel.invokeMethod("onCallRejected", mapOf("callAttemptId" to callAttemptId))
        }

        CallConnectionService.onDisconnectCallback = { callAttemptId ->
            Log.d(TAG, "Call disconnected: $callAttemptId")
            channel.invokeMethod("onCallDisconnected", mapOf("callAttemptId" to callAttemptId))
            CallForegroundService.stopService(context)
        }

        CallConnectionService.onMuteChangedCallback = { callAttemptId, muted ->
            Log.d(TAG, "Mute changed: $callAttemptId, muted=$muted")
            channel.invokeMethod(
                "onMuteChanged",
                mapOf("callAttemptId" to callAttemptId, "muted" to muted)
            )
        }

        CallConnectionService.onSpeakerChangedCallback = { callAttemptId, speaker ->
            Log.d(TAG, "Speaker changed: $callAttemptId, speaker=$speaker")
            channel.invokeMethod(
                "onSpeakerChanged",
                mapOf("callAttemptId" to callAttemptId, "speaker" to speaker)
            )
        }
    }

    private fun showIncomingCall(
        callAttemptId: String,
        callerName: String,
        isVideo: Boolean,
        result: MethodChannel.Result
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && telecomManager != null) {
            try {
                val componentName = ComponentName(context, CallConnectionService::class.java)
                CallConnectionService.showIncomingCall(
                    telecomManager,
                    componentName,
                    callAttemptId,
                    callerName,
                    isVideo
                )
                result.success(null)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to show incoming call", e)
                result.error("SHOW_CALL_FAILED", e.message, null)
            }
        } else {
            result.error("UNSUPPORTED", "TelecomManager not available", null)
        }
    }

    private fun startOutgoingCall(
        callAttemptId: String,
        recipientName: String,
        isVideo: Boolean,
        result: MethodChannel.Result
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && telecomManager != null) {
            try {
                val componentName = ComponentName(context, CallConnectionService::class.java)
                CallConnectionService.startOutgoingCall(
                    telecomManager,
                    componentName,
                    callAttemptId,
                    recipientName,
                    isVideo
                )
                result.success(null)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start outgoing call", e)
                result.error("START_CALL_FAILED", e.message, null)
            }
        } else {
            result.error("UNSUPPORTED", "TelecomManager not available", null)
        }
    }

    private fun endCall(callAttemptId: String, result: MethodChannel.Result) {
        CallConnectionService.endCall(callAttemptId)
        CallForegroundService.stopService(context)
        result.success(null)
    }

    private fun setCallActive(callAttemptId: String, result: MethodChannel.Result) {
        CallConnectionService.setCallActive(callAttemptId)
        result.success(null)
    }

    fun dispose() {
        channel.setMethodCallHandler(null)
        CallConnectionService.onAnswerCallback = null
        CallConnectionService.onRejectCallback = null
        CallConnectionService.onDisconnectCallback = null
        CallConnectionService.onMuteChangedCallback = null
        CallConnectionService.onSpeakerChangedCallback = null
    }
}
