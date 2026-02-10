import Foundation
import Flutter
import SocketIO

class SocketChannelHandler: NSObject, FlutterStreamHandler {
    private let methodChannel: FlutterMethodChannel
    private let eventChannel: FlutterEventChannel
    private var eventSink: FlutterEventSink?
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var isConnected = false

    init(messenger: FlutterBinaryMessenger) {
        methodChannel = FlutterMethodChannel(
            name: "com.callsafe.socket",
            binaryMessenger: messenger
        )
        eventChannel = FlutterEventChannel(
            name: "com.callsafe.socket.events",
            binaryMessenger: messenger
        )
        super.init()

        methodChannel.setMethodCallHandler(handle)
        eventChannel.setStreamHandler(self)
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "connect":
            guard let args = call.arguments as? [String: Any],
                  let token = args["token"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing token", details: nil))
                return
            }
            let serverUrl = args["serverUrl"] as? String ?? "wss://tunnel.callsafe.tech"
            connect(token: token, serverUrl: serverUrl, result: result)

        case "disconnect":
            disconnect()
            result(nil)

        case "emit":
            guard let args = call.arguments as? [String: Any],
                  let event = args["event"] as? String,
                  let data = args["data"] as? [String: Any] else {
                result(FlutterError(code: "INVALID_ARGS", message: "Invalid arguments", details: nil))
                return
            }
            emit(event: event, data: data)
            result(nil)

        case "isConnected":
            result(isConnected)

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func connect(token: String, serverUrl: String, result: @escaping FlutterResult) {
        print("[Socket] Connecting to: \(serverUrl)")

        // Disconnect existing connection
        disconnect()

        guard let url = URL(string: serverUrl) else {
            result(FlutterError(code: "INVALID_URL", message: "Invalid server URL", details: nil))
            return
        }

        let config: SocketIOClientConfiguration = [
            .log(false),
            .compress,
            .forceWebsockets(true),
            .connectParams(["token": token]),
            .version(.three)
        ]

        manager = SocketManager(socketURL: url, config: config)
        socket = manager?.defaultSocket

        setupSocketHandlers()
        socket?.connect()
        result(nil)
    }

    private func setupSocketHandlers() {
        socket?.on(clientEvent: .connect) { [weak self] _, _ in
            print("[Socket] Connected")
            self?.isConnected = true
            self?.eventSink?([
                "type": "connected"
            ])
            self?.registerDevice()
        }

        socket?.on(clientEvent: .disconnect) { [weak self] data, _ in
            print("[Socket] Disconnected: \(data)")
            self?.isConnected = false
            let reason = data.first as? String ?? "unknown"
            self?.eventSink?([
                "type": "disconnected",
                "reason": reason
            ])
        }

        socket?.on(clientEvent: .error) { [weak self] data, _ in
            print("[Socket] Error: \(data)")
            let error = data.first as? String ?? "Connection error"
            self?.eventSink?(FlutterError(
                code: "CONNECTION_ERROR",
                message: error,
                details: nil
            ))
        }

        // Protocol event handlers
        setupProtocolEventHandlers()
    }

    private func setupProtocolEventHandlers() {
        // Incoming call
        socket?.on(Protocol.MessageTypes.CALL_INCOMING) { [weak self] data, _ in
            print("[Socket] Received call:incoming")
            if let dict = data.first as? [String: Any] {
                self?.eventSink?([
                    "type": "call:incoming",
                    "data": dict
                ])
            }
        }

        // Call cancelled
        socket?.on(Protocol.MessageTypes.CALL_CANCELLED) { [weak self] data, _ in
            print("[Socket] Received call:cancelled")
            if let dict = data.first as? [String: Any] {
                self?.eventSink?([
                    "type": "call:cancelled",
                    "data": dict
                ])
            }
        }

        // Call ended
        socket?.on(Protocol.MessageTypes.CALL_ENDED) { [weak self] data, _ in
            print("[Socket] Received call:ended")
            if let dict = data.first as? [String: Any] {
                self?.eventSink?([
                    "type": "call:ended",
                    "data": dict
                ])
            }
        }

        // Call failed
        socket?.on(Protocol.MessageTypes.CALL_FAILED) { [weak self] data, _ in
            print("[Socket] Received call:failed")
            if let dict = data.first as? [String: Any] {
                self?.eventSink?([
                    "type": "call:failed",
                    "data": dict
                ])
            }
        }

        // WebRTC offer
        socket?.on(Protocol.MessageTypes.WEBRTC_OFFER) { [weak self] data, _ in
            print("[Socket] Received webrtc:offer")
            if let dict = data.first as? [String: Any] {
                self?.eventSink?([
                    "type": "webrtc:offer",
                    "data": dict
                ])
            }
        }

        // WebRTC ICE candidate
        socket?.on(Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE) { [weak self] data, _ in
            print("[Socket] Received webrtc:ice-candidate")
            if let dict = data.first as? [String: Any] {
                self?.eventSink?([
                    "type": "webrtc:ice-candidate",
                    "data": dict
                ])
            }
        }

        // Device connected
        socket?.on(Protocol.MessageTypes.DEVICE_CONNECTED) { [weak self] data, _ in
            print("[Socket] Received device:connected")
            if let dict = data.first as? [String: Any] {
                self?.eventSink?([
                    "type": "device:connected",
                    "data": dict
                ])
            }
        }

        // Error
        socket?.on(Protocol.MessageTypes.ERROR) { [weak self] data, _ in
            print("[Socket] Received error event")
            if let dict = data.first as? [String: Any] {
                self?.eventSink?([
                    "type": "error",
                    "data": dict
                ])
            }
        }
    }

    private func registerDevice() {
        let deviceId = DeviceUtils.getUniqueDeviceId()

        let deviceConnectEvent: [String: Any] = [
            "type": Protocol.MessageTypes.DEVICE_CONNECT,
            "deviceType": Protocol.DeviceType.mobile.rawValue,
            "deviceId": deviceId,
            "protocolVersion": Protocol.VERSION,
            "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
        ]

        print("[Socket] Registering device with protocol version \(Protocol.VERSION)")
        socket?.emit(Protocol.MessageTypes.DEVICE_CONNECT, deviceConnectEvent)

        // Send initial status as available
        let statusData: [String: Any] = [
            "deviceId": deviceId,
            "status": Protocol.DeviceStatus.available.rawValue,
            "timestamp": Int64(Date().timeIntervalSince1970 * 1000)
        ]
        socket?.emit(Protocol.MessageTypes.DEVICE_STATUS, statusData)
    }

    private func emit(event: String, data: [String: Any]) {
        socket?.emit(event, data)
        print("[Socket] Emitted event: \(event)")
    }

    private func disconnect() {
        socket?.disconnect()
        socket = nil
        manager = nil
        isConnected = false
        print("[Socket] Disconnected and cleared")
    }

    func dispose() {
        disconnect()
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
