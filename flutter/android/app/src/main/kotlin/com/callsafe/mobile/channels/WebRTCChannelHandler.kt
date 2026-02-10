package com.callsafe.mobile.channels

import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * WebRTC platform channel handler
 * Phase 1: Pure channel plumbing - routes messages between Dart and Kotlin
 * Phase 2: Will integrate actual WebRTC implementation
 */
class WebRTCChannelHandler(messenger: BinaryMessenger) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL_NAME)

    init {
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "initializePeerConnection" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                // Stub: return success
                result.success(null)
            }
            "createOffer" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                // Stub: return mock SDP
                result.success(mapOf(
                    "type" to "offer",
                    "sdp" to "stub-sdp-offer"
                ))
            }
            "createAnswer" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                // Stub: return mock SDP
                result.success(mapOf(
                    "type" to "answer",
                    "sdp" to "stub-sdp-answer"
                ))
            }
            "setLocalDescription" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val description = call.argument<Map<String, Any>>("description")
                // Stub: return success
                result.success(null)
            }
            "setRemoteDescription" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val description = call.argument<Map<String, Any>>("description")
                // Stub: return success
                result.success(null)
            }
            "addIceCandidate" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val candidate = call.argument<Map<String, Any>>("candidate")
                // Stub: return success
                result.success(null)
            }
            "closePeerConnection" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                // Stub: return success
                result.success(null)
            }
            "setAudioEnabled" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val enabled = call.argument<Boolean>("enabled")
                // Stub: return success
                result.success(null)
            }
            "setVideoEnabled" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val enabled = call.argument<Boolean>("enabled")
                // Stub: return success
                result.success(null)
            }
            "flipCamera" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                // Stub: return success
                result.success(null)
            }
            "getMediaCapabilities" -> {
                // Stub: return mock capabilities
                result.success(mapOf(
                    "canSendAudio" to true,
                    "canSendVideo" to true,
                    "canReceiveAudio" to true,
                    "canReceiveVideo" to true
                ))
            }
            else -> result.notImplemented()
        }
    }

    fun dispose() {
        channel.setMethodCallHandler(null)
    }

    companion object {
        private const val CHANNEL_NAME = "com.callsafe.webrtc"
    }
}
