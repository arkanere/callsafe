package com.callsafe.mobile.channels

import android.content.Context
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.EventChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaStream
import org.webrtc.SessionDescription
import com.callsafe.mobile.managers.WebRTCManager

/**
 * WebRTC platform channel handler
 * Phase 2: Integrates actual WebRTC implementation
 */
class WebRTCChannelHandler(
    messenger: BinaryMessenger,
    private val context: Context
) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL_NAME)
    private val eventChannel = EventChannel(messenger, EVENT_CHANNEL_NAME)
    private var eventSink: EventChannel.EventSink? = null

    private var webrtcManager: WebRTCManager? = null

    init {
        channel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                eventSink = events
            }

            override fun onCancel(arguments: Any?) {
                eventSink = null
            }
        })
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "initializePeerConnection" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                initializePeerConnection(callAttemptId, result)
            }
            "createAnswer" -> {
                val callAttemptId = call.argument<String>("callAttemptId") ?: return result.error("INVALID_ARGS", "Missing callAttemptId", null)
                val sdpMap = call.argument<Map<String, Any>>("offer") ?: return result.error("INVALID_ARGS", "Missing offer", null)
                val sdpType = sdpMap["type"] as? String ?: return result.error("INVALID_ARGS", "Missing SDP type", null)
                val sdp = sdpMap["sdp"] as? String ?: return result.error("INVALID_ARGS", "Missing SDP", null)

                val offer = SessionDescription(
                    SessionDescription.Type.fromCanonicalForm(sdpType),
                    sdp
                )
                webrtcManager?.createAnswer(offer, callAttemptId)
                result.success(null)
            }
            "addIceCandidate" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val candidateMap = call.argument<Map<String, Any>>("candidate") ?: return result.error("INVALID_ARGS", "Missing candidate", null)
                val candidateSdp = candidateMap["candidate"] as? String ?: return result.error("INVALID_ARGS", "Missing candidate SDP", null)
                val sdpMLineIndex = (candidateMap["sdpMLineIndex"] as? Number)?.toInt() ?: return result.error("INVALID_ARGS", "Missing sdpMLineIndex", null)
                val sdpMid = candidateMap["sdpMid"] as? String ?: return result.error("INVALID_ARGS", "Missing sdpMid", null)

                val iceCandidate = IceCandidate(sdpMid, sdpMLineIndex, candidateSdp)
                webrtcManager?.addIceCandidate(iceCandidate)
                result.success(null)
            }
            "closePeerConnection" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                webrtcManager?.cleanup()
                webrtcManager = null
                result.success(null)
            }
            "setAudioEnabled" -> {
                val callAttemptId = call.argument<String>("callAttemptId")
                val enabled = call.argument<Boolean>("enabled") ?: false
                webrtcManager?.setMicrophoneEnabled(enabled)
                result.success(null)
            }
            "setSpeakerEnabled" -> {
                val enabled = call.argument<Boolean>("enabled") ?: false
                webrtcManager?.setSpeakerEnabled(enabled)
                result.success(null)
            }
            "getMediaCapabilities" -> {
                result.success(mapOf(
                    "canSendAudio" to true,
                    "canSendVideo" to false, // Audio only for now
                    "canReceiveAudio" to true,
                    "canReceiveVideo" to false
                ))
            }
            else -> result.notImplemented()
        }
    }

    private fun initializePeerConnection(callAttemptId: String?, result: MethodChannel.Result) {
        webrtcManager = WebRTCManager(context)

        val webrtcListener = object : WebRTCManager.WebRTCListener {
            override fun onConnectionEstablished() {
                eventSink?.success(mapOf(
                    "type" to "connectionEstablished",
                    "callAttemptId" to callAttemptId
                ))
            }

            override fun onConnectionFailed(error: String) {
                eventSink?.success(mapOf(
                    "type" to "connectionFailed",
                    "callAttemptId" to callAttemptId,
                    "error" to error
                ))
            }

            override fun onRemoteStreamReceived(stream: MediaStream) {
                eventSink?.success(mapOf(
                    "type" to "remoteStreamReceived",
                    "callAttemptId" to callAttemptId
                ))
            }
        }

        val signalingListener = object : WebRTCManager.SignalingListener {
            override fun onAnswer(callAttemptId: String, sdpType: String, sdp: String) {
                eventSink?.success(mapOf(
                    "type" to "answer",
                    "callAttemptId" to callAttemptId,
                    "sdpType" to sdpType,
                    "sdp" to sdp
                ))
            }

            override fun onIceCandidate(callAttemptId: String, candidate: String, sdpMLineIndex: Int, sdpMid: String) {
                eventSink?.success(mapOf(
                    "type" to "iceCandidate",
                    "callAttemptId" to callAttemptId,
                    "candidate" to candidate,
                    "sdpMLineIndex" to sdpMLineIndex,
                    "sdpMid" to sdpMid
                ))
            }
        }

        webrtcManager?.initialize(webrtcListener, signalingListener)
        result.success(null)
    }

    fun dispose() {
        webrtcManager?.cleanup()
        webrtcManager = null
        channel.setMethodCallHandler(null)
    }

    companion object {
        private const val CHANNEL_NAME = "com.callsafe.webrtc"
        private const val EVENT_CHANNEL_NAME = "com.callsafe.webrtc.events"
    }
}
