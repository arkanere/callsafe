import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:callsafe_mobile/src/platform/platform.dart';

/// Phase 1 verification: Test that method channels route messages correctly
/// These tests verify the plumbing layer, not the actual implementation
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('WebRTC Method Channel', () {
    late WebRTCMethodChannel platform;
    final List<MethodCall> log = [];

    setUp(() {
      platform = WebRTCMethodChannel();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        const MethodChannel('com.callsafe.webrtc'),
        (MethodCall methodCall) async {
          log.add(methodCall);

          switch (methodCall.method) {
            case 'createOffer':
              return {'type': 'offer', 'sdp': 'test-sdp'};
            case 'getMediaCapabilities':
              return {
                'canSendAudio': true,
                'canSendVideo': true,
                'canReceiveAudio': true,
                'canReceiveVideo': true,
              };
            default:
              return null;
          }
        },
      );
    });

    tearDown(() {
      log.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        const MethodChannel('com.callsafe.webrtc'),
        null,
      );
    });

    test('initializePeerConnection routes message correctly', () async {
      await platform.initializePeerConnection('test-call-id').run();

      expect(log, hasLength(1));
      expect(log[0].method, 'initializePeerConnection');
      expect(log[0].arguments['callAttemptId'], 'test-call-id');
    });

    test('createOffer routes message and deserializes response', () async {
      final result = await platform.createOffer('test-call-id').run();

      expect(log, hasLength(1));
      expect(log[0].method, 'createOffer');
      expect(result.type, 'offer');
      expect(result.sdp, 'test-sdp');
    });

    test('getMediaCapabilities deserializes response correctly', () async {
      final result = await platform.getMediaCapabilities().run();

      expect(result.canSend, contains('audio'));
      expect(result.canSend, contains('video'));
      expect(result.canReceive, contains('audio'));
      expect(result.canReceive, contains('video'));
    });
  });

  group('Push Method Channel', () {
    late PushMethodChannel platform;
    final List<MethodCall> log = [];

    setUp(() {
      platform = PushMethodChannel();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        const MethodChannel('com.callsafe.push'),
        (MethodCall methodCall) async {
          log.add(methodCall);

          switch (methodCall.method) {
            case 'requestPermissions':
              return true;
            case 'getToken':
              return 'test-token';
            default:
              return null;
          }
        },
      );
    });

    tearDown(() {
      log.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        const MethodChannel('com.callsafe.push'),
        null,
      );
    });

    test('requestPermissions routes message correctly', () async {
      final result = await platform.requestPermissions().run();

      expect(log, hasLength(1));
      expect(log[0].method, 'requestPermissions');
      expect(result, true);
    });

    test('getToken routes message and returns token', () async {
      final result = await platform.getToken().run();

      expect(log, hasLength(1));
      expect(log[0].method, 'getToken');
      expect(result, 'test-token');
    });

    test('showIncomingCallNotification passes arguments correctly', () async {
      await platform.showIncomingCallNotification(
        callAttemptId: 'test-call',
        callerName: 'John Doe',
        isVideo: true,
      ).run();

      expect(log, hasLength(1));
      expect(log[0].method, 'showIncomingCallNotification');
      expect(log[0].arguments['callAttemptId'], 'test-call');
      expect(log[0].arguments['callerName'], 'John Doe');
      expect(log[0].arguments['isVideo'], true);
    });
  });

  group('Audio Method Channel', () {
    late AudioMethodChannel platform;
    final List<MethodCall> log = [];

    setUp(() {
      platform = AudioMethodChannel();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        const MethodChannel('com.callsafe.audio'),
        (MethodCall methodCall) async {
          log.add(methodCall);

          switch (methodCall.method) {
            case 'requestMicrophonePermission':
              return true;
            default:
              return null;
          }
        },
      );
    });

    tearDown(() {
      log.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        const MethodChannel('com.callsafe.audio'),
        null,
      );
    });

    test('configureAudioSession routes message with enum values', () async {
      await platform.configureAudioSession(
        category: AudioCategory.playAndRecord,
        mode: AudioMode.voiceChat,
      ).run();

      expect(log, hasLength(1));
      expect(log[0].method, 'configureAudioSession');
      expect(log[0].arguments['category'], 'playAndRecord');
      expect(log[0].arguments['mode'], 'voiceChat');
    });

    test('requestMicrophonePermission routes message correctly', () async {
      final result = await platform.requestMicrophonePermission().run();

      expect(log, hasLength(1));
      expect(log[0].method, 'requestMicrophonePermission');
      expect(result, true);
    });

    test('setSpeakerMode passes boolean argument', () async {
      await platform.setSpeakerMode(true).run();

      expect(log, hasLength(1));
      expect(log[0].method, 'setSpeakerMode');
      expect(log[0].arguments['enabled'], true);
    });
  });
}
