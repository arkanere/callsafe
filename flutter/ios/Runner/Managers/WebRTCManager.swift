import Foundation
import WebRTC
import AVFoundation

protocol WebRTCManagerDelegate: AnyObject {
    func webRTCManager(_ manager: WebRTCManager, didGenerateIceCandidate candidate: RTCIceCandidate, forCallAttemptId callAttemptId: String)
    func webRTCManager(_ manager: WebRTCManager, didCreateAnswer sdp: RTCSessionDescription, forCallAttemptId callAttemptId: String)
    func webRTCManager(_ manager: WebRTCManager, didChangeConnectionState state: RTCIceConnectionState)
    func webRTCManager(_ manager: WebRTCManager, didReceiveRemoteStream stream: RTCMediaStream)
    func webRTCManager(_ manager: WebRTCManager, didFailWithError error: String)
}

class WebRTCManager: NSObject {
    weak var delegate: WebRTCManagerDelegate?

    private var peerConnectionFactory: RTCPeerConnectionFactory!
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private var audioSession: AVAudioSession = AVAudioSession.sharedInstance()
    private var callAttemptId: String?

    // ICE server configuration
    private let stunServer1 = "stun:stun.l.google.com:19302"
    private let stunServer2 = "stun:stun1.l.google.com:19302"
    private let turnServerUrl = "turn:a.relay.metered.ca:80"
    private let turnUsername = "***REDACTED***"
    private let turnCredential = "***REDACTED***"

    override init() {
        super.init()
        setupPeerConnectionFactory()
    }

    private func setupPeerConnectionFactory() {
        RTCInitializeSSL()

        let videoEncoderFactory = RTCDefaultVideoEncoderFactory()
        let videoDecoderFactory = RTCDefaultVideoDecoderFactory()

        peerConnectionFactory = RTCPeerConnectionFactory(
            encoderFactory: videoEncoderFactory,
            decoderFactory: videoDecoderFactory
        )
    }

    func initializePeerConnection(callAttemptId: String) {
        self.callAttemptId = callAttemptId

        // Configure audio session
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [])
            try audioSession.setActive(true)
        } catch {
            print("[WebRTC] Failed to configure audio session: \(error)")
            delegate?.webRTCManager(self, didFailWithError: "audio_session_failed")
            return
        }

        // Create ICE servers
        let iceServers = createIceServers()

        // Configure peer connection
        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually
        config.iceCandidatePoolSize = 10

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )

        peerConnection = peerConnectionFactory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: self
        )

        // Create local audio track
        createLocalAudioTrack()
    }

    private func createIceServers() -> [RTCIceServer] {
        var iceServers: [RTCIceServer] = []

        // Add STUN servers
        if let stun1 = RTCIceServer(urlStrings: [stunServer1]) {
            iceServers.append(stun1)
        }
        if let stun2 = RTCIceServer(urlStrings: [stunServer2]) {
            iceServers.append(stun2)
        }

        // Add TURN server
        if let turn = RTCIceServer(
            urlStrings: [turnServerUrl],
            username: turnUsername,
            credential: turnCredential
        ) {
            iceServers.append(turn)
        }

        return iceServers
    }

    private func createLocalAudioTrack() {
        let audioConstraints = RTCMediaConstraints(
            mandatoryConstraints: [
                "googEchoCancellation": "true",
                "googNoiseSuppression": "true",
                "googAutoGainControl": "true"
            ],
            optionalConstraints: nil
        )

        let audioSource = peerConnectionFactory.audioSource(with: audioConstraints)
        localAudioTrack = peerConnectionFactory.audioTrack(with: audioSource, trackId: "audio_track")

        if let track = localAudioTrack {
            peerConnection?.add(track, streamIds: ["local_stream"])
        }
    }

    func createAnswer(offer: RTCSessionDescription, callAttemptId: String) {
        self.callAttemptId = callAttemptId

        print("[WebRTC] Setting remote description (offer)")
        peerConnection?.setRemoteDescription(offer) { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                print("[WebRTC] Failed to set remote description: \(error)")
                self.delegate?.webRTCManager(self, didFailWithError: "Failed to set remote description")
                return
            }

            print("[WebRTC] Creating answer")
            let constraints = RTCMediaConstraints(
                mandatoryConstraints: [
                    "OfferToReceiveAudio": "true",
                    "OfferToReceiveVideo": "false"
                ],
                optionalConstraints: nil
            )

            self.peerConnection?.answer(for: constraints) { [weak self] answer, error in
                guard let self = self, let answer = answer else {
                    print("[WebRTC] Failed to create answer: \(error?.localizedDescription ?? "unknown")")
                    self?.delegate?.webRTCManager(self!, didFailWithError: "Failed to create answer")
                    return
                }

                print("[WebRTC] Setting local description (answer)")
                self.peerConnection?.setLocalDescription(answer) { error in
                    if let error = error {
                        print("[WebRTC] Failed to set local description: \(error)")
                        self.delegate?.webRTCManager(self, didFailWithError: "Failed to set local description")
                        return
                    }

                    print("[WebRTC] Answer created successfully")
                    self.delegate?.webRTCManager(self, didCreateAnswer: answer, forCallAttemptId: callAttemptId)
                }
            }
        }
    }

    func addIceCandidate(_ candidate: RTCIceCandidate) {
        print("[WebRTC] Adding ICE candidate")
        peerConnection?.add(candidate) { error in
            if let error = error {
                print("[WebRTC] Failed to add ICE candidate: \(error)")
            } else {
                print("[WebRTC] Successfully added ICE candidate")
            }
        }
    }

    func setMicrophoneEnabled(_ enabled: Bool) {
        localAudioTrack?.isEnabled = enabled
    }

    func setSpeakerEnabled(_ enabled: Bool) {
        do {
            if enabled {
                try audioSession.overrideOutputAudioPort(.speaker)
            } else {
                try audioSession.overrideOutputAudioPort(.none)
            }
        } catch {
            print("[WebRTC] Failed to set speaker: \(error)")
        }
    }

    func cleanup() {
        localAudioTrack = nil
        peerConnection?.close()
        peerConnection = nil

        do {
            try audioSession.setActive(false)
        } catch {
            print("[WebRTC] Failed to deactivate audio session: \(error)")
        }
    }

    deinit {
        cleanup()
        RTCCleanupSSL()
    }
}

// MARK: - RTCPeerConnectionDelegate
extension WebRTCManager: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        print("[WebRTC] Signaling state changed to: \(stateChanged.rawValue)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        print("[WebRTC] Remote stream received")
        delegate?.webRTCManager(self, didReceiveRemoteStream: stream)
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        print("[WebRTC] Remote stream removed")
    }

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        print("[WebRTC] Peer connection should negotiate")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[WebRTC] ICE connection state changed to: \(newState.rawValue)")
        delegate?.webRTCManager(self, didChangeConnectionState: newState)

        switch newState {
        case .connected, .completed:
            print("[WebRTC] Connection established")
        case .failed:
            print("[WebRTC] Connection failed")
            delegate?.webRTCManager(self, didFailWithError: "ICE connection failed")
        default:
            break
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("[WebRTC] ICE gathering state changed to: \(newState.rawValue)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        print("[WebRTC] Generated ICE candidate")
        if let callAttemptId = callAttemptId {
            delegate?.webRTCManager(self, didGenerateIceCandidate: candidate, forCallAttemptId: callAttemptId)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {
        print("[WebRTC] Removed ICE candidates")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        print("[WebRTC] Data channel opened")
    }
}
