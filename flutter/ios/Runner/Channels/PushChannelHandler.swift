import Foundation
import Flutter
import UserNotifications

class PushChannelHandler: NSObject, FlutterStreamHandler {
    private let methodChannel: FlutterMethodChannel
    private let eventChannel: FlutterEventChannel
    private var eventSink: FlutterEventSink?

    static var shared: PushChannelHandler?

    init(messenger: FlutterBinaryMessenger) {
        methodChannel = FlutterMethodChannel(
            name: "com.callsafe.push",
            binaryMessenger: messenger
        )
        eventChannel = FlutterEventChannel(
            name: "com.callsafe.push.events",
            binaryMessenger: messenger
        )
        super.init()

        methodChannel.setMethodCallHandler(handle)
        eventChannel.setStreamHandler(self)
        PushChannelHandler.shared = self
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "requestPermissions":
            requestNotificationPermissions(result: result)

        case "getToken":
            getAPNsToken(result: result)

        case "sendTokenToServer":
            guard let args = call.arguments as? [String: Any],
                  let token = args["token"] as? String else {
                result(FlutterError(code: "INVALID_ARGS", message: "Missing token", details: nil))
                return
            }
            saveAPNsToken(token)
            result(nil)

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func requestNotificationPermissions(result: @escaping FlutterResult) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            DispatchQueue.main.async {
                if let error = error {
                    result(FlutterError(
                        code: "PERMISSION_ERROR",
                        message: error.localizedDescription,
                        details: nil
                    ))
                } else {
                    result(granted)
                }
            }
        }
    }

    private func getAPNsToken(result: @escaping FlutterResult) {
        // Try to get cached token first
        if let cachedToken = UserDefaults.standard.string(forKey: "apns_token") {
            result(cachedToken)
            return
        }

        // If no cached token, we need to wait for registration
        result(FlutterError(
            code: "NO_TOKEN",
            message: "No APNs token available yet. Call requestPermissions first.",
            details: nil
        ))
    }

    private func saveAPNsToken(_ token: String) {
        UserDefaults.standard.set(token, forKey: "apns_token")
    }

    // Called from AppDelegate when APNs token is received
    func didRegisterForRemoteNotifications(withDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("[Push] APNs token received: \(token)")

        // Cache the token
        saveAPNsToken(token)

        // Forward to Flutter
        eventSink?([
            "type": "tokenRefresh",
            "token": token
        ])
    }

    // Called from AppDelegate when remote notification is received
    func didReceiveRemoteNotification(_ userInfo: [AnyHashable: Any]) {
        print("[Push] Remote notification received")

        // Convert userInfo to [String: String]
        var data: [String: String] = [:]
        for (key, value) in userInfo {
            if let keyString = key as? String {
                if let valueString = value as? String {
                    data[keyString] = valueString
                } else {
                    data[keyString] = "\(value)"
                }
            }
        }

        // Forward to Flutter
        eventSink?([
            "type": "message",
            "data": data
        ])
    }

    func dispose() {
        methodChannel.setMethodCallHandler(nil)
        PushChannelHandler.shared = nil
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
