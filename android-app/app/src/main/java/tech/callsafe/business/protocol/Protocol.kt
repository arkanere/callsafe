package tech.callsafe.business.protocol

/**
 * CallSafe WebRTC Protocol Constants
 * Version: 1.0.0
 *
 * AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
 * To regenerate: node protocol/generate-kotlin.js
 *
 * This file provides type-safe protocol constants for Android.
 * All WebSocket message types must use these constants.
 */

object Protocol {
    const val VERSION = "1.0.0"

    /**
     * Message Types
     * All WebSocket event names
     */
    object MessageTypes {
        const val CALL_INITIATE = "call:initiate"
        const val CALL_ACCEPT = "call:accept"
        const val CALL_REJECT = "call:reject"
        const val CALL_END = "call:end"
        const val CALL_FAILED = "call:failed"
        const val CALL_INCOMING = "call:incoming"
        const val CALL_ACCEPTED = "call:accepted"
        const val CALL_CANCELLED = "call:cancelled"
        const val CALL_ENDED = "call:ended"
        const val CALL_BUSY = "call:busy"
        const val CALL_UNAVAILABLE = "call:unavailable"
        const val CALL_TIMEOUT = "call:timeout"
        const val WEBRTC_OFFER = "webrtc:offer"
        const val WEBRTC_ANSWER = "webrtc:answer"
        const val WEBRTC_ICE_CANDIDATE = "webrtc:ice-candidate"
        const val DEVICE_CONNECT = "device:connect"
        const val DEVICE_DISCONNECT = "device:disconnect"
        const val DEVICE_STATUS = "device:status"
        const val DEVICE_CONNECTED = "device:connected"
        const val DEVICE_DISCONNECTED = "device:disconnected"
        const val DEVICE_STATUS_UPDATED = "device:status-updated"
        const val MEDIA_TOGGLE = "media:toggle"
        const val CALL_ESCALATE = "call:escalate"
        const val CALL_DOWNGRADE = "call:downgrade"
        const val ESCALATION_ACCEPTED = "escalation:accepted"
        const val ESCALATION_REJECTED = "escalation:rejected"
        const val CONNECT = "connect"
        const val DISCONNECT = "disconnect"
        const val ERROR = "error"
        const val SERVER_SHUTDOWN = "server:shutdown"
    }

    /**
     * Call Types
     */
    enum class CallType(val value: String) {
        VOICE("voice"),
        VIDEO("video");

        companion object {
            fun fromValue(value: String): CallType? = values().find { it.value == value }
        }
    }

    /**
     * Device Types
     */
    enum class DeviceType(val value: String) {
        WEB("web"),
        MOBILE("mobile");

        companion object {
            fun fromValue(value: String): DeviceType? = values().find { it.value == value }
        }
    }

    /**
     * Device Status
     */
    enum class DeviceStatus(val value: String) {
        AVAILABLE("available"),
        UNAVAILABLE("unavailable");

        companion object {
            fun fromValue(value: String): DeviceStatus? = values().find { it.value == value }
        }
    }

    /**
     * Call States
     */
    enum class CallState(val value: String) {
        INITIATED("initiated"),
        RINGING("ringing"),
        CONNECTING("connecting"),
        CONNECTED("connected"),
        ENDED("ended"),
        FAILED("failed"),
        CANCELLED("cancelled"),
        BUSY("busy"),
        UNAVAILABLE("unavailable"),
        TIMEOUT("timeout"),
        CAMERA_PERMISSION_DENIED("camera_permission_denied"),
        VIDEO_PAUSED_BY_USER("video_paused_by_user"),
        VIDEO_PAUSED_BANDWIDTH("video_paused_bandwidth"),
        ESCALATION_PENDING("escalation_pending");

        companion object {
            fun fromValue(value: String): CallState? = values().find { it.value == value }
        }
    }

    /**
     * Call End Reasons
     */
    enum class CallEndReason(val value: String) {
        NORMAL("normal"),
        CUSTOMER_HANGUP("customer_hangup"),
        BUSINESS_HANGUP("business_hangup"),
        CONNECTION_FAILED("connection_failed"),
        TIMEOUT("timeout"),
        REJECTED("rejected");

        companion object {
            fun fromValue(value: String): CallEndReason? = values().find { it.value == value }
        }
    }

    /**
     * Call Initiator
     */
    enum class CallInitiator(val value: String) {
        CUSTOMER("customer"),
        BUSINESS("business");

        companion object {
            fun fromValue(value: String): CallInitiator? = values().find { it.value == value }
        }
    }

    /**
     * Media Track Types
     */
    enum class MediaTrackType(val value: String) {
        AUDIO("audio"),
        VIDEO("video");

        companion object {
            fun fromValue(value: String): MediaTrackType? = values().find { it.value == value }
        }
    }

    /**
     * Media Toggle Actions
     */
    enum class MediaToggleAction(val value: String) {
        ENABLE_CAMERA("enable_camera"),
        DISABLE_CAMERA("disable_camera"),
        ENABLE_MICROPHONE("enable_microphone"),
        DISABLE_MICROPHONE("disable_microphone"),
        FLIP_CAMERA("flip_camera");

        companion object {
            fun fromValue(value: String): MediaToggleAction? = values().find { it.value == value }
        }
    }
}
