import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:callsafe_mobile/callsafe_mobile.dart';

/// Captures emitted messages to verify wire format without a real WebSocket.
/// JSON round-trips the message exactly as SignalingClient.emit() does:
///   jsonEncode({'type': messageType, ...payload})
/// This ensures freezed objects (MediaCapabilities, RTCIceCandidate, etc.)
/// are serialized to plain Maps — what the Elixir server actually receives.
class CapturingSignalingClient extends MockSignalingClient {
  final List<Map<String, dynamic>> captured = [];

  @override
  void emit(String messageType, Map<String, dynamic> payload) {
    // Round-trip through JSON to get the same plain Map the server sees
    final json = jsonEncode({'type': messageType, ...payload});
    captured.add(jsonDecode(json) as Map<String, dynamic>);
  }

  Map<String, dynamic>? lastOfType(String type) {
    try {
      return captured.lastWhere((m) => m['type'] == type);
    } catch (_) {
      return null;
    }
  }
}

void main() {
  group('Outbound message format (Elixir server contract)', () {
    // The Elixir server expects flat JSON: {"type": "...", field1: ..., field2: ...}
    // NOT {"type": "...", "payload": {...}}. These tests enforce that contract.

    late CapturingSignalingClient signaling;
    late MockWebRTCPlatform webrtc;
    late CallManager manager;

    setUp(() async {
      signaling = CapturingSignalingClient();
      webrtc = MockWebRTCPlatform();
      manager = CallManager(signaling, webrtc);
      await manager
          .initialize(deviceType: DeviceType.mobile, deviceId: 'device-abc')
          .run();
    });

    tearDown(() {
      manager.dispose();
    });

    test('call:initiate is flat — type and fields at top level, no payload key',
        () async {
      await manager
          .initiateCall(handle: 'support-handle', callType: CallType.voice)
          .run();

      final msg = signaling.lastOfType(MessageTypes.callInitiate);
      expect(msg, isNotNull);

      // type at root — Elixir pattern-matches on this
      expect(msg!['type'], MessageTypes.callInitiate);

      // fields at root — NOT nested under "payload"
      expect(msg.containsKey('payload'), isFalse);
      expect(msg['callAttemptId'], isA<String>());
      expect(msg['handle'], 'support-handle');
      expect(msg['callType'], 'voice');
      expect(msg['mediaCapabilities'], isA<Map>());
      final caps = msg['mediaCapabilities'] as Map;
      expect(caps['canSend'], ['audio']); // voice call
      expect(caps['canReceive'], ['audio']);
    });

    test('call:accept is flat with callAttemptId and deviceType at root',
        () async {
      // Simulate incoming call to get a ringing session
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-xyz',
        'sourceId': 'web-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      await manager.acceptCall().run();

      final msg = signaling.lastOfType(MessageTypes.callAccept);
      expect(msg, isNotNull);
      expect(msg!['type'], MessageTypes.callAccept);
      expect(msg.containsKey('payload'), isFalse);
      expect(msg['callAttemptId'], 'call-xyz');
      expect(msg['deviceId'], 'device-abc');
      expect(msg['deviceType'], 'mobile');
    });

    test('call:reject is flat with callAttemptId at root', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-rej',
        'sourceId': 'web-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      await manager.rejectCall(reason: 'busy').run();

      final msg = signaling.lastOfType(MessageTypes.callReject);
      expect(msg, isNotNull);
      expect(msg!['type'], MessageTypes.callReject);
      expect(msg.containsKey('payload'), isFalse);
      expect(msg['callAttemptId'], 'call-rej');
      expect(msg['deviceType'], 'mobile');
    });

    test('call:end is flat with callAttemptId and initiator at root', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-end',
        'sourceId': 'web-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);
      await manager.acceptCall().run();

      await manager.endCall().run();

      final msg = signaling.lastOfType(MessageTypes.callEnd);
      expect(msg, isNotNull);
      expect(msg!['type'], MessageTypes.callEnd);
      expect(msg.containsKey('payload'), isFalse);
      expect(msg['callAttemptId'], 'call-end');
      expect(msg['initiator'], isA<String>());
    });

    test('webrtc:ice-candidate is flat with callAttemptId and candidate at root',
        () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-ice',
        'sourceId': 'web-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      manager.sendIceCandidate(const RTCIceCandidate(
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
        sdpMLineIndex: 0,
        sdpMid: 'audio',
      ));

      final msg = signaling.lastOfType(MessageTypes.webrtcIceCandidate);
      expect(msg, isNotNull);
      expect(msg!['type'], MessageTypes.webrtcIceCandidate);
      expect(msg.containsKey('payload'), isFalse);
      expect(msg['callAttemptId'], 'call-ice');
      expect(msg['candidate'], isA<Map>());
      final cand = msg['candidate'] as Map;
      expect(cand['candidate'], contains('candidate:'));
      expect(cand['sdpMLineIndex'], 0);
      expect(cand['sdpMid'], 'audio');
    });

    test('device:connect payload is flat with protocolVersion at root', () {
      // device:connect is sent by SignalingClient._sendDeviceConnect() on
      // WebSocket open. Verify the payload serialization that gets emitted.
      final payload = DeviceConnectPayload(
        deviceType: DeviceType.mobile,
        deviceId: 'device-abc',
        protocolVersion: protocolVersion,
        timestamp: 1000,
      );
      final client = CapturingSignalingClient();
      client.emit(MessageTypes.deviceConnect, payload.toJson());

      final msg = client.lastOfType(MessageTypes.deviceConnect);
      expect(msg, isNotNull);
      expect(msg!['type'], MessageTypes.deviceConnect);
      expect(msg.containsKey('payload'), isFalse);
      expect(msg['deviceType'], 'mobile');
      expect(msg['deviceId'], 'device-abc');
      expect(msg['protocolVersion'], protocolVersion);
    });
  });

  group('Incoming message dispatch (CallManager handler contract)', () {
    // Verifies that each server→client message type is correctly routed
    // through SignalingClient.messageStream to CallManager._setupMessageHandlers.

    late CapturingSignalingClient signaling;
    late MockWebRTCPlatform webrtc;
    late CallManager manager;

    setUp(() async {
      signaling = CapturingSignalingClient();
      webrtc = MockWebRTCPlatform();
      manager = CallManager(signaling, webrtc);
      await manager
          .initialize(deviceType: DeviceType.mobile, deviceId: 'device-abc')
          .run();
    });

    tearDown(() {
      manager.dispose();
    });

    test('call:incoming transitions state to ringing with session', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-in-1',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      expect(manager.state.currentCall, isNotNull);
      expect(manager.state.currentCall!.callAttemptId, 'call-in-1');
      expect(manager.state.currentCall!.state, CallState.ringing);
      expect(manager.state.currentCall!.callType, CallType.voice);
    });

    test('call:incoming for video sets callType to video', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-vid',
        'sourceId': 'embed-client',
        'callType': 'video',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      expect(manager.state.currentCall!.callType, CallType.video);
    });

    test('call:accepted transitions ringing call to connecting', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-acc',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.callAccepted, {
        'callAttemptId': 'call-acc',
        'acceptingDevice': 'mobile',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      expect(manager.state.currentCall!.state, CallState.connecting);
    });

    test('call:accepted for different callAttemptId is ignored', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-mine',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.callAccepted, {
        'callAttemptId': 'call-other',
        'acceptingDevice': 'mobile',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      // State unchanged — still ringing
      expect(manager.state.currentCall!.state, CallState.ringing);
    });

    test('call:cancelled clears currentCall and moves it to history', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-can',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.callCancelled, {
        'callAttemptId': 'call-can',
        'reason': 'caller-hung-up',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      expect(manager.state.currentCall, isNull);
      expect(manager.state.callHistory.length, 1);
      expect(manager.state.callHistory.first.state, CallState.cancelled);
    });

    test('call:ended clears currentCall and records duration in history',
        () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-end',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.callEnded, {
        'callAttemptId': 'call-end',
        'duration': 45000,
        'reason': 'normal',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      expect(manager.state.currentCall, isNull);
      expect(manager.state.callHistory.first.state, CallState.ended);
    });

    test('call:busy clears currentCall with busy state', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-busy',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.callBusy, {
        'callAttemptId': 'call-busy',
        'reason': 'agent-busy',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      expect(manager.state.currentCall, isNull);
      expect(manager.state.callHistory.first.state, CallState.busy);
    });

    test('call:unavailable clears currentCall with unavailable state', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-unav',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.callUnavailable, {
        'callAttemptId': 'call-unav',
        'reason': 'no-agents',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      expect(manager.state.currentCall, isNull);
      expect(manager.state.callHistory.first.state, CallState.unavailable);
    });

    test('call:timeout clears currentCall with timeout state', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-to',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.callTimeout, {
        'callAttemptId': 'call-to',
        'timeoutDuration': 30000,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      expect(manager.state.currentCall, isNull);
      expect(manager.state.callHistory.first.state, CallState.timeout);
    });

    test('webrtc:offer triggers answer creation and sends webrtc:answer',
        () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-offer',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.webrtcOffer, {
        'callAttemptId': 'call-offer',
        'offer': {'type': 'offer', 'sdp': 'remote-sdp-offer'},
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      // Allow async createAnswer + emit to complete
      await Future.delayed(const Duration(milliseconds: 50));

      // Manager should have sent webrtc:answer back with flat format
      final answerMsg = signaling.lastOfType(MessageTypes.webrtcAnswer);
      expect(answerMsg, isNotNull);
      expect(answerMsg!['callAttemptId'], 'call-offer');
      expect(answerMsg.containsKey('payload'), isFalse);
      expect(answerMsg['answer'], isA<Map>());
      final answer = answerMsg['answer'] as Map;
      expect(answer['type'], 'answer');
      expect(answer['sdp'], isA<String>());
    });

    test('webrtc:answer stores remote answer in session state', () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-ans',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.webrtcAnswer, {
        'callAttemptId': 'call-ans',
        'answer': {'type': 'answer', 'sdp': 'remote-sdp-answer'},
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(const Duration(milliseconds: 50));

      expect(manager.state.currentCall!.remoteAnswer!.type, 'answer');
      expect(manager.state.currentCall!.remoteAnswer!.sdp, 'remote-sdp-answer');
    });

    test('webrtc:ice-candidate accumulates in session remoteCandidates',
        () async {
      signaling.simulateMessage(MessageTypes.callIncoming, {
        'callAttemptId': 'call-cand',
        'sourceId': 'embed-client',
        'callType': 'voice',
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(Duration.zero);

      signaling.simulateMessage(MessageTypes.webrtcIceCandidate, {
        'callAttemptId': 'call-cand',
        'candidate': {
          'candidate': 'candidate:1 1 UDP 2130706431 10.0.0.1 12345 typ host',
          'sdpMLineIndex': 0,
          'sdpMid': 'audio',
        },
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(const Duration(milliseconds: 50));

      signaling.simulateMessage(MessageTypes.webrtcIceCandidate, {
        'callAttemptId': 'call-cand',
        'candidate': {
          'candidate': 'candidate:2 1 TCP 1694498815 10.0.0.1 443 typ host',
          'sdpMLineIndex': 0,
          'sdpMid': 'audio',
        },
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
      await Future.delayed(const Duration(milliseconds: 50));

      expect(manager.state.currentCall!.remoteCandidates.length, 2);
    });
  });

  group('Signaling state propagates to CallManager availability', () {
    test('connected state sets isAvailable true', () async {
      final signaling = MockSignalingClient();
      final manager = CallManager(signaling, MockWebRTCPlatform());

      await signaling
          .connect(deviceType: DeviceType.mobile, deviceId: 'dev')
          .run();
      await Future.delayed(Duration.zero);

      expect(manager.state.isAvailable, isTrue);
      manager.dispose();
    });

    test('disconnected state sets isAvailable false', () async {
      final signaling = MockSignalingClient();
      final manager = CallManager(signaling, MockWebRTCPlatform());

      await signaling
          .connect(deviceType: DeviceType.mobile, deviceId: 'dev')
          .run();
      await signaling.disconnect().run();
      await Future.delayed(Duration.zero);

      expect(manager.state.isAvailable, isFalse);
      manager.dispose();
    });
  });
}
