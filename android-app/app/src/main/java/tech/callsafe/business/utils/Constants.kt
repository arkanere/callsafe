package tech.callsafe.business.utils

import tech.callsafe.business.protocol.Protocol

/**
 * Application Constants
 *
 * Socket events now use Protocol.MessageTypes for type safety.
 * See: android-app/app/src/main/java/tech/callsafe/business/protocol/Protocol.kt
 */
object Constants {
    // API Endpoints
    const val API_LOGIN = "api/login"

    // Socket Events - Use Protocol.MessageTypes for type-safe message constants
    // Legacy constants maintained for backwards compatibility, delegating to Protocol
    @Deprecated("Use Protocol.MessageTypes.DEVICE_CONNECT", ReplaceWith("Protocol.MessageTypes.DEVICE_CONNECT"))
    const val DEVICE_CONNECT = Protocol.MessageTypes.DEVICE_CONNECT

    @Deprecated("Use Protocol.MessageTypes.CALL_ACCEPT", ReplaceWith("Protocol.MessageTypes.CALL_ACCEPT"))
    const val CALL_ACCEPT = Protocol.MessageTypes.CALL_ACCEPT

    @Deprecated("Use Protocol.MessageTypes.CALL_REJECT", ReplaceWith("Protocol.MessageTypes.CALL_REJECT"))
    const val CALL_REJECT = Protocol.MessageTypes.CALL_REJECT

    @Deprecated("Use Protocol.MessageTypes.CALL_END", ReplaceWith("Protocol.MessageTypes.CALL_END"))
    const val CALL_END = Protocol.MessageTypes.CALL_END

    @Deprecated("Use Protocol.MessageTypes.DEVICE_STATUS", ReplaceWith("Protocol.MessageTypes.DEVICE_STATUS"))
    const val DEVICE_STATUS = Protocol.MessageTypes.DEVICE_STATUS

    @Deprecated("Use Protocol.MessageTypes.WEBRTC_ANSWER", ReplaceWith("Protocol.MessageTypes.WEBRTC_ANSWER"))
    const val WEBRTC_ANSWER = Protocol.MessageTypes.WEBRTC_ANSWER

    @Deprecated("Use Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE", ReplaceWith("Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE"))
    const val WEBRTC_ICE_CANDIDATE = Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE

    // Notification Actions
    const val ACTION_ACCEPT_CALL = "ACCEPT_CALL"
    const val ACTION_DECLINE_CALL = "DECLINE_CALL"

    // Call Status
    const val CALL_STATUS_COMPLETED = "completed"
    const val CALL_STATUS_MISSED = "missed"
    const val CALL_STATUS_REJECTED = "rejected"

    // Device Type - Use Protocol.DeviceType enum for type safety
    @Deprecated("Use Protocol.DeviceType.MOBILE.value", ReplaceWith("Protocol.DeviceType.MOBILE.value"))
    const val DEVICE_TYPE_MOBILE = Protocol.DeviceType.MOBILE.value

    // Timeouts
    const val SOCKET_TIMEOUT = 30000L // 30 seconds
    const val CALL_TIMEOUT = 30000L // 30 seconds (managed by server)
}