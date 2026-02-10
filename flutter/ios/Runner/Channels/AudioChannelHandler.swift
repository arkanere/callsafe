import Foundation
import Flutter

class AudioChannelHandler: NSObject {
    private let methodChannel: FlutterMethodChannel

    init(messenger: FlutterBinaryMessenger) {
        methodChannel = FlutterMethodChannel(
            name: "com.callsafe.audio",
            binaryMessenger: messenger
        )
        super.init()

        methodChannel.setMethodCallHandler(handle)
    }

    func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        // Audio is handled in WebRTCManager on iOS
        // This channel exists for contract compatibility with Android
        result(FlutterMethodNotImplemented)
    }

    func dispose() {
        methodChannel.setMethodCallHandler(nil)
    }
}
