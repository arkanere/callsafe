package com.callsafe.mobile.channels

import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Audio platform channel handler
 * Phase 1: Pure channel plumbing - routes messages between Dart and Kotlin
 * Phase 2: Will integrate audio session management and ringtones
 */
class AudioChannelHandler(messenger: BinaryMessenger) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL_NAME)

    init {
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "configureAudioSession" -> {
                val category = call.argument<String>("category")
                val mode = call.argument<String>("mode")
                // Stub: return success
                result.success(null)
            }
            "startRinging" -> {
                // Stub: return success
                result.success(null)
            }
            "stopRinging" -> {
                // Stub: return success
                result.success(null)
            }
            "startRingback" -> {
                // Stub: return success
                result.success(null)
            }
            "stopRingback" -> {
                // Stub: return success
                result.success(null)
            }
            "requestMicrophonePermission" -> {
                // Stub: return permission granted
                result.success(true)
            }
            "requestCameraPermission" -> {
                // Stub: return permission granted
                result.success(true)
            }
            "setSpeakerMode" -> {
                val enabled = call.argument<Boolean>("enabled")
                // Stub: return success
                result.success(null)
            }
            "reportIncomingCall" -> {
                val callId = call.argument<String>("callId")
                val handle = call.argument<String>("handle")
                val hasVideo = call.argument<Boolean>("hasVideo")
                // Stub: Android doesn't use CallKit (iOS only)
                result.success(null)
            }
            "reportCallEnded" -> {
                val callId = call.argument<String>("callId")
                // Stub: Android doesn't use CallKit (iOS only)
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    fun dispose() {
        channel.setMethodCallHandler(null)
    }

    companion object {
        private const val CHANNEL_NAME = "com.callsafe.audio"
    }
}
