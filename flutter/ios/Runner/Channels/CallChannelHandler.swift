import Foundation
import Flutter
import CallKit

/**
 * Platform channel handler for call management on iOS
 * Controls CallKit integration and bridges with Flutter
 */
class CallChannelHandler: NSObject {
    private let methodChannel: FlutterMethodChannel
    private let callKitManager = CallKitManager.shared

    init(messenger: FlutterBinaryMessenger) {
        methodChannel = FlutterMethodChannel(
            name: "com.callsafe.call",
            binaryMessenger: messenger
        )

        super.init()

        methodChannel.setMethodCallHandler(handle)
        setupCallbacks()
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "showIncomingCall":
            guard let args = call.arguments as? [String: Any],
                  let callAttemptId = args["callAttemptId"] as? String,
                  let callerName = args["callerName"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing required arguments", details: nil))
                return
            }
            let isVideo = args["isVideo"] as? Bool ?? false
            showIncomingCall(callAttemptId: callAttemptId, callerName: callerName, isVideo: isVideo, result: result)

        case "startOutgoingCall":
            guard let args = call.arguments as? [String: Any],
                  let callAttemptId = args["callAttemptId"] as? String,
                  let recipientName = args["recipientName"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing required arguments", details: nil))
                return
            }
            let isVideo = args["isVideo"] as? Bool ?? false
            startOutgoingCall(callAttemptId: callAttemptId, recipientName: recipientName, isVideo: isVideo, result: result)

        case "endCall":
            guard let args = call.arguments as? [String: Any],
                  let callAttemptId = args["callAttemptId"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing callAttemptId", details: nil))
                return
            }
            endCall(callAttemptId: callAttemptId, result: result)

        case "setCallActive":
            guard let args = call.arguments as? [String: Any],
                  let callAttemptId = args["callAttemptId"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing callAttemptId", details: nil))
                return
            }
            setCallActive(callAttemptId: callAttemptId, result: result)

        case "setMuted":
            guard let args = call.arguments as? [String: Any],
                  let callAttemptId = args["callAttemptId"] as? String,
                  let muted = args["muted"] as? Bool else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing required arguments", details: nil))
                return
            }
            setMuted(callAttemptId: callAttemptId, muted: muted, result: result)

        case "startForegroundService":
            // iOS doesn't need explicit foreground service, CallKit handles it
            result(nil)

        case "stopForegroundService":
            // iOS doesn't need explicit foreground service
            result(nil)

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func setupCallbacks() {
        callKitManager.onAnswerCallback = { [weak self] callAttemptId in
            print("[CallChannel] Call answered: \(callAttemptId)")
            self?.methodChannel.invokeMethod("onCallAnswered", arguments: ["callAttemptId": callAttemptId])
        }

        callKitManager.onRejectCallback = { [weak self] callAttemptId in
            print("[CallChannel] Call rejected: \(callAttemptId)")
            self?.methodChannel.invokeMethod("onCallRejected", arguments: ["callAttemptId": callAttemptId])
        }

        callKitManager.onDisconnectCallback = { [weak self] callAttemptId in
            print("[CallChannel] Call disconnected: \(callAttemptId)")
            self?.methodChannel.invokeMethod("onCallDisconnected", arguments: ["callAttemptId": callAttemptId])
        }

        callKitManager.onMuteChangedCallback = { [weak self] callAttemptId, muted in
            print("[CallChannel] Mute changed: \(callAttemptId), muted=\(muted)")
            self?.methodChannel.invokeMethod("onMuteChanged", arguments: [
                "callAttemptId": callAttemptId,
                "muted": muted
            ])
        }
    }

    private func showIncomingCall(
        callAttemptId: String,
        callerName: String,
        isVideo: Bool,
        result: @escaping FlutterResult
    ) {
        callKitManager.reportIncomingCall(
            callAttemptId: callAttemptId,
            callerName: callerName,
            hasVideo: isVideo
        ) { error in
            if let error = error {
                result(FlutterError(
                    code: "SHOW_CALL_FAILED",
                    message: error.localizedDescription,
                    details: nil
                ))
            } else {
                result(nil)
            }
        }
    }

    private func startOutgoingCall(
        callAttemptId: String,
        recipientName: String,
        isVideo: Bool,
        result: @escaping FlutterResult
    ) {
        callKitManager.startOutgoingCall(
            callAttemptId: callAttemptId,
            recipientName: recipientName,
            hasVideo: isVideo
        ) { error in
            if let error = error {
                result(FlutterError(
                    code: "START_CALL_FAILED",
                    message: error.localizedDescription,
                    details: nil
                ))
            } else {
                result(nil)
            }
        }
    }

    private func endCall(callAttemptId: String, result: @escaping FlutterResult) {
        callKitManager.endCall(callAttemptId: callAttemptId) { error in
            if let error = error {
                result(FlutterError(
                    code: "END_CALL_FAILED",
                    message: error.localizedDescription,
                    details: nil
                ))
            } else {
                result(nil)
            }
        }
    }

    private func setCallActive(callAttemptId: String, result: @escaping FlutterResult) {
        callKitManager.setCallConnected(callAttemptId: callAttemptId)
        result(nil)
    }

    private func setMuted(callAttemptId: String, muted: Bool, result: @escaping FlutterResult) {
        callKitManager.setMuted(callAttemptId: callAttemptId, muted: muted) { error in
            if let error = error {
                result(FlutterError(
                    code: "MUTE_FAILED",
                    message: error.localizedDescription,
                    details: nil
                ))
            } else {
                result(nil)
            }
        }
    }

    func dispose() {
        methodChannel.setMethodCallHandler(nil)
        callKitManager.onAnswerCallback = nil
        callKitManager.onRejectCallback = nil
        callKitManager.onDisconnectCallback = nil
        callKitManager.onMuteChangedCallback = nil
    }
}
