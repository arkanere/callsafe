import Foundation

/**
 * CallSafe WebRTC Protocol Constants
 * Version: 1.0.0
 *
 * AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
 * To regenerate: node protocol/generate-swift.js
 *
 * This file provides type-safe protocol constants for iOS.
 * All WebSocket message types must use these constants.
 */

struct Protocol {
    static let VERSION = "1.0.0"

    /**
     * Message Types
     * All WebSocket event names
     */
    struct MessageTypes {
        static let CALL_INITIATE = "call:initiate"
        static let CALL_ACCEPT = "call:accept"
        static let CALL_REJECT = "call:reject"
        static let CALL_END = "call:end"
        static let CALL_FAILED = "call:failed"
        static let CALL_INCOMING = "call:incoming"
        static let CALL_ACCEPTED = "call:accepted"
        static let CALL_CANCELLED = "call:cancelled"
        static let CALL_ENDED = "call:ended"
        static let CALL_BUSY = "call:busy"
        static let CALL_UNAVAILABLE = "call:unavailable"
        static let CALL_TIMEOUT = "call:timeout"
        static let WEBRTC_OFFER = "webrtc:offer"
        static let WEBRTC_ANSWER = "webrtc:answer"
        static let WEBRTC_ICE_CANDIDATE = "webrtc:ice-candidate"
        static let DEVICE_CONNECT = "device:connect"
        static let DEVICE_DISCONNECT = "device:disconnect"
        static let DEVICE_STATUS = "device:status"
        static let DEVICE_CONNECTED = "device:connected"
        static let DEVICE_DISCONNECTED = "device:disconnected"
        static let DEVICE_STATUS_UPDATED = "device:status-updated"
        static let MEDIA_TOGGLE = "media:toggle"
        static let CALL_ESCALATE = "call:escalate"
        static let CALL_DOWNGRADE = "call:downgrade"
        static let ESCALATION_ACCEPTED = "escalation:accepted"
        static let ESCALATION_REJECTED = "escalation:rejected"
        static let CONNECT = "connect"
        static let DISCONNECT = "disconnect"
        static let ERROR = "error"
        static let SERVER_SHUTDOWN = "server:shutdown"
    }

    /**
     * Call Types
     */
    enum CallType: String {
        case voice = "voice"
        case video = "video"
    }

    /**
     * Device Types
     */
    enum DeviceType: String {
        case web = "web"
        case mobile = "mobile"
    }

    /**
     * Device Status
     */
    enum DeviceStatus: String {
        case available = "available"
        case unavailable = "unavailable"
    }

    /**
     * Call States
     */
    enum CallState: String {
        case initiated = "initiated"
        case ringing = "ringing"
        case connecting = "connecting"
        case connected = "connected"
        case ended = "ended"
        case failed = "failed"
        case cancelled = "cancelled"
        case busy = "busy"
        case unavailable = "unavailable"
        case timeout = "timeout"
        case cameraPermissionDenied = "camera_permission_denied"
        case videoPausedByUser = "video_paused_by_user"
        case videoPausedBandwidth = "video_paused_bandwidth"
        case escalationPending = "escalation_pending"
    }

    /**
     * Call End Reasons
     */
    enum CallEndReason: String {
        case normal = "normal"
        case customerHangup = "customer_hangup"
        case businessHangup = "business_hangup"
        case connectionFailed = "connection_failed"
        case timeout = "timeout"
        case rejected = "rejected"
    }

    /**
     * Call Initiator
     */
    enum CallInitiator: String {
        case customer = "customer"
        case business = "business"
    }

    /**
     * Media Track Types
     */
    enum MediaTrackType: String {
        case audio = "audio"
        case video = "video"
    }

    /**
     * Media Toggle Actions
     */
    enum MediaToggleAction: String {
        case enableCamera = "enable_camera"
        case disableCamera = "disable_camera"
        case enableMicrophone = "enable_microphone"
        case disableMicrophone = "disable_microphone"
        case flipCamera = "flip_camera"
    }
}
