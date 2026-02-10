import Foundation
import Flutter
import WebRTC

class WebRTCChannelHandler: NSObject, FlutterStreamHandler {
    private let methodChannel: FlutterMethodChannel
    private let eventChannel: FlutterEventChannel
    private var eventSink: FlutterEventSink?
    private var webrtcManager: WebRTCManager?

    init(messenger: FlutterBinaryMessenger) {
        methodChannel = FlutterMethodChannel(
            name: "com.callsafe.webrtc",
            binaryMessenger: messenger
        )
        eventChannel = FlutterEventChannel(
            name: "com.callsafe.webrtc.events",
            binaryMessenger: messenger
        )
        super.init()

        methodChannel.setMethodCallHandler(handle)
        eventChannel.setStreamHandler(self)
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "initializePeerConnection":
            guard let args = call.arguments as? [String: Any],
                  let callAttemptId = args["callAttemptId"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing callAttemptId", details: nil))
                return
            }
            initializePeerConnection(callAttemptId: callAttemptId, result: result)

        case "createAnswer":
            guard let args = call.arguments as? [String: Any],
                  let callAttemptId = args["callAttemptId"] as? String,
                  let offerDict = args["offer"] as? [String: Any],
                  let sdpType = offerDict["type"] as? String,
                  let sdp = offerDict["sdp"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Invalid arguments", details: nil))
                return
            }

            let offer = RTCSessionDescription(type: .offer, sdp: sdp)
            webrtcManager?.createAnswer(offer: offer, callAttemptId: callAttemptId)
            result(nil)

        case "addIceCandidate":
            guard let args = call.arguments as? [String: Any],
                  let candidateDict = args["candidate"] as? [String: Any],
                  let candidateSdp = candidateDict["candidate"] as? String,
                  let sdpMLineIndex = candidateDict["sdpMLineIndex"] as? Int,
                  let sdpMid = candidateDict["sdpMid"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Invalid candidate", details: nil))
                return
            }

            let candidate = RTCIceCandidate(
                sdp: candidateSdp,
                sdpMLineIndex: Int32(sdpMLineIndex),
                sdpMid: sdpMid
            )
            webrtcManager?.addIceCandidate(candidate)
            result(nil)

        case "closePeerConnection":
            webrtcManager?.cleanup()
            webrtcManager = nil
            result(nil)

        case "setAudioEnabled":
            guard let args = call.arguments as? [String: Any],
                  let enabled = args["enabled"] as? Bool else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing enabled", details: nil))
                return
            }
            webrtcManager?.setMicrophoneEnabled(enabled)
            result(nil)

        case "setSpeakerEnabled":
            guard let args = call.arguments as? [String: Any],
                  let enabled = args["enabled"] as? Bool else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing enabled", details: nil))
                return
            }
            webrtcManager?.setSpeakerEnabled(enabled)
            result(nil)

        case "getMediaCapabilities":
            result([
                "canSendAudio": true,
                "canSendVideo": false,
                "canReceiveAudio": true,
                "canReceiveVideo": false
            ])

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func initializePeerConnection(callAttemptId: String, result: @escaping FlutterResult) {
        webrtcManager = WebRTCManager()
        webrtcManager?.delegate = self
        webrtcManager?.initializePeerConnection(callAttemptId: callAttemptId)
        result(nil)
    }

    func dispose() {
        webrtcManager?.cleanup()
        webrtcManager = nil
        methodChannel.setMethodCallHandler(nil)
    }

    // MARK: - FlutterStreamHandler
    func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        eventSink = events
        return nil
    }

    func onCancel(withArguments arguments: Any?) -> FlutterError? {
        eventSink = nil
        return nil
    }
}

// MARK: - WebRTCManagerDelegate
extension WebRTCChannelHandler: WebRTCManagerDelegate {
    func webRTCManager(_ manager: WebRTCManager, didGenerateIceCandidate candidate: RTCIceCandidate, forCallAttemptId callAttemptId: String) {
        eventSink?([
            "type": "iceCandidate",
            "callAttemptId": callAttemptId,
            "candidate": candidate.sdp,
            "sdpMLineIndex": candidate.sdpMLineIndex,
            "sdpMid": candidate.sdpMid ?? ""
        ])
    }

    func webRTCManager(_ manager: WebRTCManager, didCreateAnswer sdp: RTCSessionDescription, forCallAttemptId callAttemptId: String) {
        eventSink?([
            "type": "answer",
            "callAttemptId": callAttemptId,
            "sdpType": sdp.type.string(),
            "sdp": sdp.sdp
        ])
    }

    func webRTCManager(_ manager: WebRTCManager, didChangeConnectionState state: RTCIceConnectionState) {
        switch state {
        case .connected, .completed:
            eventSink?([
                "type": "connectionEstablished"
            ])
        default:
            break
        }
    }

    func webRTCManager(_ manager: WebRTCManager, didReceiveRemoteStream stream: RTCMediaStream) {
        eventSink?([
            "type": "remoteStreamReceived"
        ])
    }

    func webRTCManager(_ manager: WebRTCManager, didFailWithError error: String) {
        eventSink?([
            "type": "connectionFailed",
            "error": error
        ])
    }
}

// MARK: - RTCSdpType Extension
extension RTCSdpType {
    func string() -> String {
        switch self {
        case .offer:
            return "offer"
        case .prAnswer:
            return "pranswer"
        case .answer:
            return "answer"
        case .rollback:
            return "rollback"
        @unknown default:
            return "unknown"
        }
    }
}
