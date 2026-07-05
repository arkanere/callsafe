import Foundation

/**
 * CallSafe WebRTC Signaling Protocol Constants
 * Version: 2.0.0
 *
 * AUTO-GENERATED from protocol.json - DO NOT EDIT MANUALLY
 * To regenerate: node protocol/generate-swift.js
 *
 * This file provides type-safe protocol constants for iOS.
 * All WebSocket message types must use these constants.
 */

struct Protocol {
    static let VERSION = "2.0.0"

    /**
     * Message Types
     * All WebSocket message type strings
     */
    struct MessageTypes {
        static let PING = "ping"
        static let PONG = "pong"
        static let ERROR = "error"
        static let SERVER_SHUTDOWN = "server:shutdown"
        static let DEVICE_CONNECT = "device:connect"
        static let DEVICE_CONNECTED = "device:connected"
        static let DEVICE_DISCONNECT = "device:disconnect"
        static let DEVICE_DISCONNECTED = "device:disconnected"
        static let DEVICE_STATUS = "device:status"
        static let DEVICE_STATUS_UPDATED = "device:status-updated"
        static let CALL_INITIATE = "call:initiate"
        static let CALL_INITIATED = "call:initiated"
        static let CALL_INCOMING = "call:incoming"
        static let CALL_CANCEL = "call:cancel"
        static let CALL_CANCELLED = "call:cancelled"
        static let CALL_ACCEPT = "call:accept"
        static let CALL_ACCEPTED = "call:accepted"
        static let CALL_REJECT = "call:reject"
        static let CALL_UNAVAILABLE = "call:unavailable"
        static let CALL_BUSY = "call:busy"
        static let CALL_END = "call:end"
        static let CALL_ENDED = "call:ended"
        static let CALL_FAILED = "call:failed"
        static let CALL_TIMEOUT = "call:timeout"
        static let CALL_RECONNECT = "call:reconnect"
        static let CALL_RECONNECTED = "call:reconnected"
        static let WEBRTC_OFFER = "webrtc:offer"
        static let WEBRTC_ANSWER = "webrtc:answer"
        static let WEBRTC_ICE_CANDIDATE = "webrtc:ice-candidate"
        static let MEDIA_TOGGLE = "media:toggle"
        static let CALL_ESCALATE = "call:escalate"
        static let ESCALATION_REQUESTED = "escalation:requested"
        static let ESCALATION_ACCEPT = "escalation:accept"
        static let ESCALATION_REJECT = "escalation:reject"
        static let ESCALATION_ACCEPTED = "escalation:accepted"
        static let ESCALATION_REJECTED = "escalation:rejected"
        static let CALL_DOWNGRADE = "call:downgrade"
        static let CALL_DOWNGRADED = "call:downgraded"
    }

    /**
     * CallType
     */
    enum CallType: String, CaseIterable {
        case voice = "voice"
        case video = "video"
    }

    /**
     * DeviceType
     */
    enum DeviceType: String, CaseIterable {
        case web = "web"
        case mobile = "mobile"
    }

    /**
     * DeviceStatus
     */
    enum DeviceStatus: String, CaseIterable {
        case available = "available"
        case unavailable = "unavailable"
    }

    /**
     * Role
     */
    enum Role: String, CaseIterable {
        case customer = "customer"
        case business = "business"
    }

    /**
     * MediaTrackType
     */
    enum MediaTrackType: String, CaseIterable {
        case audio = "audio"
        case video = "video"
    }

    /**
     * MediaToggleAction
     */
    enum MediaToggleAction: String, CaseIterable {
        case enableCamera = "enable_camera"
        case disableCamera = "disable_camera"
        case enableMicrophone = "enable_microphone"
        case disableMicrophone = "disable_microphone"
        case flipCamera = "flip_camera"
    }

    /**
     * CallState
     */
    enum CallState: String, CaseIterable {
        case initiated = "initiated"
        case ringing = "ringing"
        case connecting = "connecting"
        case connected = "connected"
        case escalationPending = "escalation_pending"
        case ended = "ended"
        case failed = "failed"
        case cancelled = "cancelled"
        case busy = "busy"
        case unavailable = "unavailable"
        case timeout = "timeout"
    }

    /**
     * CallEndReason
     */
    enum CallEndReason: String, CaseIterable {
        case normal = "normal"
        case customerHangup = "customer_hangup"
        case businessHangup = "business_hangup"
    }

    /**
     * CallFailReason
     */
    enum CallFailReason: String, CaseIterable {
        case mediaPermissionDenied = "media_permission_denied"
        case connectionFailed = "connection_failed"
        case peerDisconnected = "peer_disconnected"
        case internalError = "internal_error"
    }

    /**
     * CallCancelReason
     */
    enum CallCancelReason: String, CaseIterable {
        case cancelledByCaller = "cancelled_by_caller"
        case answeredElsewhere = "answered_elsewhere"
    }

    /**
     * CallUnavailableReason
     */
    enum CallUnavailableReason: String, CaseIterable {
        case noDevicesAvailable = "no_devices_available"
        case allDevicesRejected = "all_devices_rejected"
    }

    /**
     * CallBusyReason
     */
    enum CallBusyReason: String, CaseIterable {
        case allDevicesBusy = "all_devices_busy"
    }

    /**
     * TimeoutPhase
     */
    enum TimeoutPhase: String, CaseIterable {
        case ringing = "ringing"
        case connecting = "connecting"
    }

    /**
     * EscalationRejectReason
     */
    enum EscalationRejectReason: String, CaseIterable {
        case declined = "declined"
        case timeout = "timeout"
        case unsupported = "unsupported"
    }

    /**
     * ErrorCode
     */
    enum ErrorCode: String, CaseIterable {
        case invalidJson = "invalid_json"
        case invalidMessage = "invalid_message"
        case validationError = "validation_error"
        case unknownMessageType = "unknown_message_type"
        case notAuthenticated = "not_authenticated"
        case authFailed = "auth_failed"
        case tokenExpired = "token_expired"
        case deviceMismatch = "device_mismatch"
        case protocolIncompatible = "protocol_incompatible"
        case rateLimited = "rate_limited"
        case notAuthorized = "not_authorized"
        case callNotFound = "call_not_found"
        case invalidState = "invalid_state"
        case notCallParticipant = "not_call_participant"
        case duplicateCallId = "duplicate_call_id"
        case peerNotConnected = "peer_not_connected"
        case deviceNotFound = "device_not_found"
        case serverError = "server_error"
    }
}
