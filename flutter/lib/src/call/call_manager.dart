import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fpdart/fpdart.dart';
import 'package:uuid/uuid.dart';
import '../protocol/protocol.dart';
import '../signaling/signaling_client.dart';
import '../platform/webrtc_platform.dart';
import 'call_state.dart';

/// Call manager error
class CallError {
  final String message;
  final String? code;

  const CallError(this.message, {this.code});

  @override
  String toString() => 'CallError: $message${code != null ? ' (code: $code)' : ''}';
}

/// Pure state machine for call lifecycle management
/// All state transitions are immutable transformations
class CallManager extends StateNotifier<CallManagerState> {
  final SignalingClient _signaling;
  final WebRTCPlatform _webrtc;
  final Future<List<Map<String, dynamic>>?> Function()? _fetchTurnServers;
  final Uuid _uuid = const Uuid();

  StreamSubscription<Map<String, dynamic>>? _messageSubscription;
  StreamSubscription<SignalingState>? _signalingStateSubscription;

  CallManager(this._signaling, this._webrtc, {Future<List<Map<String, dynamic>>?> Function()? fetchTurnServers})
      : _fetchTurnServers = fetchTurnServers,
        super(const CallManagerState()) {
    _setupMessageHandlers();
  }

  /// Initialize device connection
  Task<Unit> initialize({
    required DeviceType deviceType,
    required String deviceId,
    String? pushToken,
  }) {
    return Task(() async {
      // Update state
      state = state.copyWith(
        deviceType: deviceType,
        deviceId: deviceId,
        isAvailable: true,
      );

      // Connect to signaling server
      await _signaling
          .connect(
            deviceType: deviceType,
            deviceId: deviceId,
            pushToken: pushToken,
          )
          .run();

      return unit;
    });
  }

  /// Initiate outgoing call
  Task<String> initiateCall({
    required String handle,
    required CallType callType,
    MediaCapabilities? mediaCapabilities,
  }) {
    return Task(() async {
      if (!state.canInitiateCall) {
        throw const CallError('Cannot initiate call');
      }

      final callAttemptId = _uuid.v4();
      final capabilities = mediaCapabilities ??
          MediaCapabilities(
            canSend: callType == CallType.video
                ? ['audio', 'video']
                : ['audio'],
            canReceive: callType == CallType.video
                ? ['audio', 'video']
                : ['audio'],
          );

      // Create call session
      final session = CallSession(
        callAttemptId: callAttemptId,
        handle: handle,
        callType: callType,
        state: CallState.initiated,
        sourceId: state.deviceId,
        localCapabilities: capabilities,
        startTime: DateTime.now(),
      );

      // Update state immutably
      state = state.copyWith(currentCall: session);

      // Send call:initiate message
      final payload = CallInitiatePayload(
        callAttemptId: callAttemptId,
        handle: handle,
        sourceId: state.deviceId,
        callType: callType,
        mediaCapabilities: capabilities,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );

      _signaling.emit(MessageTypes.callInitiate, payload.toJson());

      // Fetch TURN credentials then initialize WebRTC
      final iceServers = await _fetchTurnServers?.call();
      await _webrtc
          .initializePeerConnection(callAttemptId, callType: callType, iceServers: iceServers)
          .run();

      return callAttemptId;
    });
  }

  /// Accept incoming call
  Task<Unit> acceptCall() {
    return Task(() async {
      if (!state.canAcceptCall) {
        throw const CallError('Cannot accept call');
      }

      final session = state.currentCall!;

      // Update state to connecting
      state = state.copyWith(
        currentCall: session.copyWith(state: CallState.connecting),
      );

      // Send call:accept message
      final payload = CallAcceptPayload(
        callAttemptId: session.callAttemptId,
        deviceType: state.deviceType!,
        deviceId: state.deviceId!,
        mediaCapabilities: session.localCapabilities,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );

      _signaling.emit(MessageTypes.callAccept, payload.toJson());

      // Fetch TURN credentials then initialize WebRTC
      final iceServers = await _fetchTurnServers?.call();
      await _webrtc
          .initializePeerConnection(
            session.callAttemptId,
            callType: session.callType,
            iceServers: iceServers,
          )
          .run();

      return unit;
    });
  }

  /// Reject incoming call
  Task<Unit> rejectCall({String? reason}) {
    return Task(() async {
      final session = state.currentCall;
      if (session == null || session.state != CallState.ringing) {
        throw const CallError('No incoming call to reject');
      }

      // Send call:reject message
      final payload = CallRejectPayload(
        callAttemptId: session.callAttemptId,
        deviceType: state.deviceType!,
        reason: reason,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );

      _signaling.emit(MessageTypes.callReject, payload.toJson());

      // Update state - move to history
      state = _endCall(session, CallState.cancelled);

      return unit;
    });
  }

  /// End active call
  Task<Unit> endCall({CallEndReason? reason}) {
    return Task(() async {
      final session = state.currentCall;
      if (session == null || !session.isActive) {
        throw const CallError('No active call to end');
      }

      // Send call:end message
      final payload = CallEndPayload(
        callAttemptId: session.callAttemptId,
        initiator: state.deviceType == DeviceType.mobile
            ? CallInitiator.customer
            : CallInitiator.business,
        reason: reason,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );

      _signaling.emit(MessageTypes.callEnd, payload.toJson());

      // Close WebRTC connection
      await _webrtc.closePeerConnection(session.callAttemptId).run();

      // Update state
      state = _endCall(
        session.copyWith(endReason: reason),
        CallState.ended,
      );

      return unit;
    });
  }

  /// Toggle camera on/off during a video call
  Task<Unit> toggleCamera() {
    return Task(() async {
      final session = state.currentCall;
      if (session == null || !session.isActive) return unit;

      final newEnabled = !session.isVideoEnabled;

      await _webrtc.setVideoEnabled(session.callAttemptId, newEnabled).run();

      state = state.copyWith(
        currentCall: session.copyWith(isVideoEnabled: newEnabled),
      );

      final action = newEnabled
          ? MediaToggleAction.enableCamera
          : MediaToggleAction.disableCamera;

      _signaling.emit(MessageTypes.mediaToggle, MediaTogglePayload(
        callAttemptId: session.callAttemptId,
        action: action,
        success: true,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      ).toJson());

      return unit;
    });
  }

  /// Flip camera between front and back
  Task<Unit> flipCamera() {
    return Task(() async {
      final session = state.currentCall;
      if (session == null || !session.isActive) return unit;

      await _webrtc.flipCamera(session.callAttemptId).run();

      _signaling.emit(MessageTypes.mediaToggle, MediaTogglePayload(
        callAttemptId: session.callAttemptId,
        action: MediaToggleAction.flipCamera,
        success: true,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      ).toJson());

      return unit;
    });
  }

  /// Handle WebRTC offer
  Task<Unit> handleOffer(RTCSessionDescriptionInit offer) {
    return Task(() async {
      final session = state.currentCall;
      if (session == null) {
        throw const CallError('No active call');
      }

      // Update state with remote offer
      state = state.copyWith(
        currentCall: session.copyWith(remoteOffer: offer),
      );

      // Set remote description via platform
      await _webrtc.setRemoteDescription(session.callAttemptId, offer).run();

      // Create answer
      final answer = await _webrtc.createAnswer(session.callAttemptId).run();

      // Update state with local answer
      state = state.copyWith(
        currentCall: session.copyWith(localAnswer: answer),
      );

      // Send answer via signaling
      final payload = WebRTCAnswerPayload(
        callAttemptId: session.callAttemptId,
        answer: answer,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );

      _signaling.emit(MessageTypes.webrtcAnswer, payload.toJson());

      return unit;
    });
  }

  /// Handle WebRTC answer
  Task<Unit> handleAnswer(RTCSessionDescriptionInit answer) {
    return Task(() async {
      final session = state.currentCall;
      if (session == null) {
        throw const CallError('No active call');
      }

      // Update state with remote answer
      state = state.copyWith(
        currentCall: session.copyWith(remoteAnswer: answer),
      );

      // Set remote description via platform
      await _webrtc.setRemoteDescription(session.callAttemptId, answer).run();

      return unit;
    });
  }

  /// Handle ICE candidate
  Task<Unit> handleIceCandidate(RTCIceCandidate candidate) {
    return Task(() async {
      final session = state.currentCall;
      if (session == null) {
        throw const CallError('No active call');
      }

      // Update state with remote candidate
      state = state.copyWith(
        currentCall: session.copyWith(
          remoteCandidates: [...session.remoteCandidates, candidate],
        ),
      );

      // Add candidate via platform
      await _webrtc.addIceCandidate(session.callAttemptId, candidate).run();

      return unit;
    });
  }

  /// Send local ICE candidate
  void sendIceCandidate(RTCIceCandidate candidate) {
    final session = state.currentCall;
    if (session == null) return;

    // Update state with local candidate
    state = state.copyWith(
      currentCall: session.copyWith(
        localCandidates: [...session.localCandidates, candidate],
      ),
    );

    // Send via signaling
    final payload = WebRTCIceCandidatePayload(
      callAttemptId: session.callAttemptId,
      candidate: candidate,
      timestamp: DateTime.now().millisecondsSinceEpoch,
    );

    _signaling.emit(MessageTypes.webrtcIceCandidate, payload.toJson());
  }

  /// Setup message handlers
  void _setupMessageHandlers() {
    _messageSubscription = _signaling.messageStream.listen((message) {
      final type = message['type'] as String;
      final payload = message['payload'] as Map<String, dynamic>;

      switch (type) {
        case MessageTypes.callIncoming:
          _handleCallIncoming(CallIncomingPayload.fromJson(payload));
          break;
        case MessageTypes.callAccepted:
          _handleCallAccepted(CallAcceptedPayload.fromJson(payload));
          break;
        case MessageTypes.callCancelled:
          _handleCallCancelled(CallCancelledPayload.fromJson(payload));
          break;
        case MessageTypes.callEnded:
          _handleCallEnded(CallEndedPayload.fromJson(payload));
          break;
        case MessageTypes.callBusy:
          _handleCallBusy(CallBusyPayload.fromJson(payload));
          break;
        case MessageTypes.callUnavailable:
          _handleCallUnavailable(CallUnavailablePayload.fromJson(payload));
          break;
        case MessageTypes.callTimeout:
          _handleCallTimeout(CallTimeoutPayload.fromJson(payload));
          break;
        case MessageTypes.webrtcOffer:
          _handleWebRTCOffer(WebRTCOfferPayload.fromJson(payload));
          break;
        case MessageTypes.webrtcAnswer:
          _handleWebRTCAnswer(WebRTCAnswerPayload.fromJson(payload));
          break;
        case MessageTypes.webrtcIceCandidate:
          _handleWebRTCIceCandidate(
              WebRTCIceCandidatePayload.fromJson(payload));
          break;
        case MessageTypes.mediaToggle:
          _handleMediaToggle(MediaTogglePayload.fromJson(payload));
          break;
      }
    });

    _signalingStateSubscription = _signaling.stateStream.listen((sigState) {
      if (sigState == SignalingState.disconnected) {
        state = state.copyWith(isAvailable: false);
      } else if (sigState == SignalingState.connected) {
        state = state.copyWith(isAvailable: true);
      }
    });
  }

  /// Handle incoming call message
  void _handleCallIncoming(CallIncomingPayload payload) {
    if (state.hasActiveCall) return;

    final session = CallSession(
      callAttemptId: payload.callAttemptId,
      handle: payload.sourceId,
      callType: payload.callType,
      state: CallState.ringing,
      sourceId: payload.sourceId,
      startTime: DateTime.fromMillisecondsSinceEpoch(payload.timestamp),
    );

    state = state.copyWith(currentCall: session);
  }

  /// Handle call accepted message
  void _handleCallAccepted(CallAcceptedPayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    state = state.copyWith(
      currentCall: session!.copyWith(state: CallState.connecting),
    );

    // Caller creates and sends WebRTC offer now that callee has accepted
    _createAndSendOffer(session.callAttemptId);
  }

  Future<void> _createAndSendOffer(String callAttemptId) async {
    final offer = await _webrtc.createOffer(callAttemptId).run();
    _signaling.emit(
      MessageTypes.webrtcOffer,
      WebRTCOfferPayload(
        callAttemptId: callAttemptId,
        offer: offer,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      ).toJson(),
    );
  }

  /// Handle call cancelled message
  void _handleCallCancelled(CallCancelledPayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    state = _endCall(session!, CallState.cancelled);
  }

  /// Handle call ended message
  void _handleCallEnded(CallEndedPayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    state = _endCall(
      session!.copyWith(endReason: payload.reason),
      CallState.ended,
    );
  }

  /// Handle call busy message
  void _handleCallBusy(CallBusyPayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    state = _endCall(session!, CallState.busy);
  }

  /// Handle call unavailable message
  void _handleCallUnavailable(CallUnavailablePayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    state = _endCall(session!, CallState.unavailable);
  }

  /// Handle call timeout message
  void _handleCallTimeout(CallTimeoutPayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    state = _endCall(session!, CallState.timeout);
  }

  /// Handle WebRTC offer message
  void _handleWebRTCOffer(WebRTCOfferPayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    handleOffer(payload.offer).run();
  }

  /// Handle WebRTC answer message
  void _handleWebRTCAnswer(WebRTCAnswerPayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    handleAnswer(payload.answer).run();
  }

  /// Handle WebRTC ICE candidate message
  void _handleWebRTCIceCandidate(WebRTCIceCandidatePayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    handleIceCandidate(payload.candidate).run();
  }

  /// Handle media:toggle from peer (camera on/off notification)
  void _handleMediaToggle(MediaTogglePayload payload) {
    final session = state.currentCall;
    if (session?.callAttemptId != payload.callAttemptId) return;

    // Reflect peer's camera state in our local state when it affects video
    if (payload.action == MediaToggleAction.disableCamera) {
      state = state.copyWith(
        currentCall: session!.copyWith(isVideoEnabled: false),
      );
    } else if (payload.action == MediaToggleAction.enableCamera) {
      state = state.copyWith(
        currentCall: session!.copyWith(isVideoEnabled: true),
      );
    }
  }

  /// End call and move to history (pure transformation)
  CallManagerState _endCall(CallSession session, CallState endState) {
    final endedSession = session.copyWith(
      state: endState,
      endTime: DateTime.now(),
    );

    return state.copyWith(
      currentCall: null,
      callHistory: [...state.callHistory, endedSession],
    );
  }

  @override
  void dispose() {
    _messageSubscription?.cancel();
    _signalingStateSubscription?.cancel();
    _signaling.dispose();
    super.dispose();
  }
}
