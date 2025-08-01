package tech.callsafe.business.utils

object Constants {
    // API Endpoints
    const val API_LOGIN = "api/auth/login"
    
    // Socket Events
    const val DEVICE_CONNECT = "device:connect"
    const val CALL_ACCEPT = "call:accept"
    const val CALL_REJECT = "call:reject"
    const val CALL_END = "call:end"
    const val DEVICE_STATUS = "device:status"
    const val WEBRTC_ANSWER = "webrtc:answer"
    const val WEBRTC_ICE_CANDIDATE = "webrtc:ice-candidate"
    
    // Notification Actions
    const val ACTION_ACCEPT_CALL = "ACCEPT_CALL"
    const val ACTION_DECLINE_CALL = "DECLINE_CALL"
    
    // Call Status
    const val CALL_STATUS_COMPLETED = "completed"
    const val CALL_STATUS_MISSED = "missed"
    const val CALL_STATUS_REJECTED = "rejected"
    
    // Device Type
    const val DEVICE_TYPE_MOBILE = "mobile"
    
    // Timeouts
    const val SOCKET_TIMEOUT = 30000L // 30 seconds
    const val CALL_TIMEOUT = 30000L // 30 seconds (managed by server)
}