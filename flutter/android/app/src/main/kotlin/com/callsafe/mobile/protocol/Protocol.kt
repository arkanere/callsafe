package com.callsafe.mobile.protocol

/**
 * CallSafe WebRTC Signaling Protocol Constants
 * Version: 2.0.0
 *
 * AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
 * To regenerate: node protocol/generate-kotlin.js
 *
 * This file provides type-safe protocol constants for Android.
 * All WebSocket message types must use these constants.
 */

object Protocol {
    const val VERSION = "2.0.0"

    /**
     * Message Types
     * All WebSocket message type strings
     */
    object MessageTypes {
        const val PING = "ping"
        const val PONG = "pong"
        const val ERROR = "error"
        const val SERVER_SHUTDOWN = "server:shutdown"
        const val DEVICE_CONNECT = "device:connect"
        const val DEVICE_CONNECTED = "device:connected"
        const val DEVICE_DISCONNECT = "device:disconnect"
        const val DEVICE_DISCONNECTED = "device:disconnected"
        const val DEVICE_STATUS = "device:status"
        const val DEVICE_STATUS_UPDATED = "device:status-updated"
        const val CALL_INITIATE = "call:initiate"
        const val CALL_INITIATED = "call:initiated"
        const val CALL_INCOMING = "call:incoming"
        const val CALL_CANCEL = "call:cancel"
        const val CALL_CANCELLED = "call:cancelled"
        const val CALL_ACCEPT = "call:accept"
        const val CALL_ACCEPTED = "call:accepted"
        const val CALL_REJECT = "call:reject"
        const val CALL_UNAVAILABLE = "call:unavailable"
        const val CALL_BUSY = "call:busy"
        const val CALL_END = "call:end"
        const val CALL_ENDED = "call:ended"
        const val CALL_FAILED = "call:failed"
        const val CALL_TIMEOUT = "call:timeout"
        const val CALL_RECONNECT = "call:reconnect"
        const val CALL_RECONNECTED = "call:reconnected"
        const val WEBRTC_OFFER = "webrtc:offer"
        const val WEBRTC_ANSWER = "webrtc:answer"
        const val WEBRTC_ICE_CANDIDATE = "webrtc:ice-candidate"
        const val MEDIA_TOGGLE = "media:toggle"
        const val CALL_ESCALATE = "call:escalate"
        const val ESCALATION_REQUESTED = "escalation:requested"
        const val ESCALATION_ACCEPT = "escalation:accept"
        const val ESCALATION_REJECT = "escalation:reject"
        const val ESCALATION_ACCEPTED = "escalation:accepted"
        const val ESCALATION_REJECTED = "escalation:rejected"
        const val CALL_DOWNGRADE = "call:downgrade"
        const val CALL_DOWNGRADED = "call:downgraded"
    }

    /**
     * CallType
     */
    enum class CallType(val value: String) {
        VOICE("voice"),
        VIDEO("video");

        companion object {
            fun fromValue(value: String): CallType? = values().find { it.value == value }
        }
    }

    /**
     * DeviceType
     */
    enum class DeviceType(val value: String) {
        WEB("web"),
        MOBILE("mobile");

        companion object {
            fun fromValue(value: String): DeviceType? = values().find { it.value == value }
        }
    }

    /**
     * DeviceStatus
     */
    enum class DeviceStatus(val value: String) {
        AVAILABLE("available"),
        UNAVAILABLE("unavailable");

        companion object {
            fun fromValue(value: String): DeviceStatus? = values().find { it.value == value }
        }
    }

    /**
     * Role
     */
    enum class Role(val value: String) {
        CUSTOMER("customer"),
        BUSINESS("business");

        companion object {
            fun fromValue(value: String): Role? = values().find { it.value == value }
        }
    }

    /**
     * MediaTrackType
     */
    enum class MediaTrackType(val value: String) {
        AUDIO("audio"),
        VIDEO("video");

        companion object {
            fun fromValue(value: String): MediaTrackType? = values().find { it.value == value }
        }
    }

    /**
     * MediaToggleAction
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

    /**
     * CallState
     */
    enum class CallState(val value: String) {
        INITIATED("initiated"),
        RINGING("ringing"),
        CONNECTING("connecting"),
        CONNECTED("connected"),
        ESCALATION_PENDING("escalation_pending"),
        ENDED("ended"),
        FAILED("failed"),
        CANCELLED("cancelled"),
        BUSY("busy"),
        UNAVAILABLE("unavailable"),
        TIMEOUT("timeout");

        companion object {
            fun fromValue(value: String): CallState? = values().find { it.value == value }
        }
    }

    /**
     * CallEndReason
     */
    enum class CallEndReason(val value: String) {
        NORMAL("normal"),
        CUSTOMER_HANGUP("customer_hangup"),
        BUSINESS_HANGUP("business_hangup");

        companion object {
            fun fromValue(value: String): CallEndReason? = values().find { it.value == value }
        }
    }

    /**
     * CallFailReason
     */
    enum class CallFailReason(val value: String) {
        MEDIA_PERMISSION_DENIED("media_permission_denied"),
        CONNECTION_FAILED("connection_failed"),
        PEER_DISCONNECTED("peer_disconnected"),
        INTERNAL_ERROR("internal_error");

        companion object {
            fun fromValue(value: String): CallFailReason? = values().find { it.value == value }
        }
    }

    /**
     * CallCancelReason
     */
    enum class CallCancelReason(val value: String) {
        CANCELLED_BY_CALLER("cancelled_by_caller"),
        ANSWERED_ELSEWHERE("answered_elsewhere");

        companion object {
            fun fromValue(value: String): CallCancelReason? = values().find { it.value == value }
        }
    }

    /**
     * CallUnavailableReason
     */
    enum class CallUnavailableReason(val value: String) {
        NO_DEVICES_AVAILABLE("no_devices_available"),
        ALL_DEVICES_REJECTED("all_devices_rejected");

        companion object {
            fun fromValue(value: String): CallUnavailableReason? = values().find { it.value == value }
        }
    }

    /**
     * CallBusyReason
     */
    enum class CallBusyReason(val value: String) {
        ALL_DEVICES_BUSY("all_devices_busy");

        companion object {
            fun fromValue(value: String): CallBusyReason? = values().find { it.value == value }
        }
    }

    /**
     * TimeoutPhase
     */
    enum class TimeoutPhase(val value: String) {
        RINGING("ringing"),
        CONNECTING("connecting");

        companion object {
            fun fromValue(value: String): TimeoutPhase? = values().find { it.value == value }
        }
    }

    /**
     * EscalationRejectReason
     */
    enum class EscalationRejectReason(val value: String) {
        DECLINED("declined"),
        TIMEOUT("timeout"),
        UNSUPPORTED("unsupported");

        companion object {
            fun fromValue(value: String): EscalationRejectReason? = values().find { it.value == value }
        }
    }

    /**
     * ErrorCode
     */
    enum class ErrorCode(val value: String) {
        INVALID_JSON("invalid_json"),
        INVALID_MESSAGE("invalid_message"),
        VALIDATION_ERROR("validation_error"),
        UNKNOWN_MESSAGE_TYPE("unknown_message_type"),
        NOT_AUTHENTICATED("not_authenticated"),
        AUTH_FAILED("auth_failed"),
        TOKEN_EXPIRED("token_expired"),
        DEVICE_MISMATCH("device_mismatch"),
        PROTOCOL_INCOMPATIBLE("protocol_incompatible"),
        RATE_LIMITED("rate_limited"),
        NOT_AUTHORIZED("not_authorized"),
        CALL_NOT_FOUND("call_not_found"),
        INVALID_STATE("invalid_state"),
        NOT_CALL_PARTICIPANT("not_call_participant"),
        DUPLICATE_CALL_ID("duplicate_call_id"),
        PEER_NOT_CONNECTED("peer_not_connected"),
        DEVICE_NOT_FOUND("device_not_found"),
        SERVER_ERROR("server_error");

        companion object {
            fun fromValue(value: String): ErrorCode? = values().find { it.value == value }
        }
    }
}
