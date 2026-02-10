import Foundation
import CallKit
import AVFoundation
import Flutter

/**
 * CallKit integration for iOS native call UI
 * Manages call provider, handles incoming/outgoing calls, and bridges with Flutter
 */
class CallKitManager: NSObject, CXProviderDelegate {

    static let shared = CallKitManager()

    private let provider: CXProvider
    private let callController = CXCallController()

    // Active calls keyed by callAttemptId
    private var activeCalls: [String: UUID] = [:]

    // Callbacks to Flutter
    var onAnswerCallback: ((String) -> Void)?
    var onRejectCallback: ((String) -> Void)?
    var onDisconnectCallback: ((String) -> Void)?
    var onMuteChangedCallback: ((String, Bool) -> Void)?

    private override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.localizedName = "CallSafe"

        // Configure audio session
        configuration.ringtoneSound = "Ringtone.caf"

        // Icon
        if let iconImage = UIImage(named: "AppIcon") {
            configuration.iconTemplateImageData = iconImage.pngData()
        }

        provider = CXProvider(configuration: configuration)

        super.init()

        provider.setDelegate(self, queue: nil)

        configureAudioSession()
    }

    // MARK: - Public Methods

    /**
     * Report incoming call to CallKit
     */
    func reportIncomingCall(
        callAttemptId: String,
        callerName: String,
        hasVideo: Bool,
        completion: @escaping (Error?) -> Void
    ) {
        let uuid = UUID()
        activeCalls[callAttemptId] = uuid

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: callerName)
        update.localizedCallerName = callerName
        update.hasVideo = hasVideo
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false

        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                print("[CallKit] Error reporting incoming call: \(error.localizedDescription)")
                self.activeCalls.removeValue(forKey: callAttemptId)
            } else {
                print("[CallKit] Incoming call reported successfully: \(callAttemptId)")
            }
            completion(error)
        }
    }

    /**
     * Start outgoing call through CallKit
     */
    func startOutgoingCall(
        callAttemptId: String,
        recipientName: String,
        hasVideo: Bool,
        completion: @escaping (Error?) -> Void
    ) {
        let uuid = UUID()
        activeCalls[callAttemptId] = uuid

        let handle = CXHandle(type: .generic, value: recipientName)
        let startCallAction = CXStartCallAction(call: uuid, handle: handle)
        startCallAction.isVideo = hasVideo

        let transaction = CXTransaction(action: startCallAction)

        callController.request(transaction) { error in
            if let error = error {
                print("[CallKit] Error starting call: \(error.localizedDescription)")
                self.activeCalls.removeValue(forKey: callAttemptId)
            } else {
                print("[CallKit] Outgoing call started: \(callAttemptId)")

                // Report call as connecting
                let update = CXCallUpdate()
                update.remoteHandle = handle
                update.localizedCallerName = recipientName
                update.hasVideo = hasVideo
                self.provider.reportCall(with: uuid, updated: update)
            }
            completion(error)
        }
    }

    /**
     * End call from Flutter
     */
    func endCall(callAttemptId: String, completion: @escaping (Error?) -> Void) {
        guard let uuid = activeCalls[callAttemptId] else {
            completion(nil)
            return
        }

        let endCallAction = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: endCallAction)

        callController.request(transaction) { error in
            if let error = error {
                print("[CallKit] Error ending call: \(error.localizedDescription)")
            } else {
                print("[CallKit] Call ended: \(callAttemptId)")
                self.activeCalls.removeValue(forKey: callAttemptId)
            }
            completion(error)
        }
    }

    /**
     * Update call to connected state
     */
    func setCallConnected(callAttemptId: String) {
        guard let uuid = activeCalls[callAttemptId] else {
            print("[CallKit] No UUID found for callAttemptId: \(callAttemptId)")
            return
        }

        print("[CallKit] Setting call as connected: \(callAttemptId)")
        provider.reportOutgoingCall(with: uuid, connectedAt: Date())
    }

    /**
     * Set mute state
     */
    func setMuted(callAttemptId: String, muted: Bool, completion: @escaping (Error?) -> Void) {
        guard let uuid = activeCalls[callAttemptId] else {
            completion(nil)
            return
        }

        let muteAction = CXSetMutedCallAction(call: uuid, muted: muted)
        let transaction = CXTransaction(action: muteAction)

        callController.request(transaction, completion: completion)
    }

    // MARK: - CXProviderDelegate

    func providerDidReset(_ provider: CXProvider) {
        print("[CallKit] Provider did reset")
        activeCalls.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        print("[CallKit] Provider perform start call action")

        configureAudioSession()

        // Notify system that call started connecting
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())

        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        print("[CallKit] Provider perform answer action")

        configureAudioSession()

        // Find callAttemptId for this UUID
        if let callAttemptId = activeCalls.first(where: { $0.value == action.callUUID })?.key {
            onAnswerCallback?(callAttemptId)
        }

        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        print("[CallKit] Provider perform end call action")

        // Find callAttemptId for this UUID
        if let callAttemptId = activeCalls.first(where: { $0.value == action.callUUID })?.key {
            onDisconnectCallback?(callAttemptId)
            activeCalls.removeValue(forKey: callAttemptId)
        }

        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        print("[CallKit] Provider perform mute action: \(action.isMuted)")

        // Find callAttemptId for this UUID
        if let callAttemptId = activeCalls.first(where: { $0.value == action.callUUID })?.key {
            onMuteChangedCallback?(callAttemptId, action.isMuted)
        }

        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        print("[CallKit] Audio session activated")
        // WebRTC will handle audio session configuration
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("[CallKit] Audio session deactivated")
    }

    // MARK: - Audio Session Configuration

    private func configureAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
            try audioSession.setActive(true)
            print("[CallKit] Audio session configured")
        } catch {
            print("[CallKit] Error configuring audio session: \(error.localizedDescription)")
        }
    }
}
