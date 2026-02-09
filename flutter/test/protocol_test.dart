import 'package:flutter_test/flutter_test.dart';
import 'package:callsafe_mobile/callsafe_mobile.dart';

void main() {
  group('Protocol Constants', () {
    test('Message types are defined correctly', () {
      expect(MessageTypes.callInitiate, 'call:initiate');
      expect(MessageTypes.callAccept, 'call:accept');
      expect(MessageTypes.deviceConnect, 'device:connect');
      expect(MessageTypes.webrtcOffer, 'webrtc:offer');
    });

    test('Protocol version is defined', () {
      expect(protocolVersion, '1.0.0');
    });
  });

  group('Protocol Enums', () {
    test('CallType enum values', () {
      expect(CallType.voice.value, 'voice');
      expect(CallType.video.value, 'video');
    });

    test('DeviceType enum values', () {
      expect(DeviceType.web.value, 'web');
      expect(DeviceType.mobile.value, 'mobile');
    });

    test('CallState enum values', () {
      expect(CallState.initiated.value, 'initiated');
      expect(CallState.connecting.value, 'connecting');
      expect(CallState.connected.value, 'connected');
    });

    test('CallType fromString conversion', () {
      expect(CallType.fromString('voice'), CallType.voice);
      expect(CallType.fromString('video'), CallType.video);
      expect(() => CallType.fromString('invalid'), throwsArgumentError);
    });
  });

  group('State Transitions', () {
    test('Valid state transitions', () {
      expect(
        isValidStateTransition(CallState.initiated, CallState.ringing),
        true,
      );
      expect(
        isValidStateTransition(CallState.ringing, CallState.connecting),
        true,
      );
      expect(
        isValidStateTransition(CallState.connecting, CallState.connected),
        true,
      );
    });

    test('Invalid state transitions', () {
      expect(
        isValidStateTransition(CallState.initiated, CallState.connected),
        false,
      );
      expect(
        isValidStateTransition(CallState.ended, CallState.connected),
        false,
      );
    });

    test('Terminal states', () {
      expect(isTerminalState(CallState.ended), true);
      expect(isTerminalState(CallState.failed), true);
      expect(isTerminalState(CallState.connected), false);
    });
  });

  group('Protocol Validators', () {
    test('UUID validation', () {
      expect(
        ProtocolValidators.isValidUuid(
          '550e8400-e29b-41d4-a716-446655440000',
        ),
        true,
      );
      expect(ProtocolValidators.isValidUuid('invalid-uuid'), false);
      expect(ProtocolValidators.isValidUuid(''), false);
    });

    test('Handle validation', () {
      expect(ProtocolValidators.isValidHandle('test-handle'), true);
      expect(ProtocolValidators.isValidHandle(''), false);
      expect(ProtocolValidators.isValidHandle('a' * 256), false);
    });

    test('Device ID validation', () {
      expect(ProtocolValidators.isValidDeviceId('device-123'), true);
      expect(ProtocolValidators.isValidDeviceId(''), false);
    });

    test('Protocol version validation', () {
      expect(ProtocolValidators.isValidProtocolVersion('1.0.0'), true);
      expect(ProtocolValidators.isValidProtocolVersion('10.20.30'), true);
      expect(ProtocolValidators.isValidProtocolVersion('1.0'), false);
      expect(ProtocolValidators.isValidProtocolVersion('invalid'), false);
    });
  });

  group('Message Validation', () {
    test('Valid call:initiate message', () {
      final payload = {
        'callAttemptId': '550e8400-e29b-41d4-a716-446655440000',
        'handle': 'test-handle',
        'callType': 'voice',
        'mediaCapabilities': {
          'canSendAudio': true,
          'canSendVideo': false,
          'canReceiveAudio': true,
          'canReceiveVideo': false,
        },
      };

      final result = validateMessage('call:initiate', payload);
      expect(result.valid, true);
      expect(result.errors, isEmpty);
    });

    test('Invalid call:initiate message - missing field', () {
      final payload = {
        'callAttemptId': '550e8400-e29b-41d4-a716-446655440000',
        'handle': 'test-handle',
        // Missing callType and mediaCapabilities
      };

      final result = validateMessage('call:initiate', payload);
      expect(result.valid, false);
      expect(result.errors, isNotEmpty);
    });

    test('Invalid call:initiate message - invalid UUID', () {
      final payload = {
        'callAttemptId': 'invalid-uuid',
        'handle': 'test-handle',
        'callType': 'voice',
        'mediaCapabilities': {},
      };

      final result = validateMessage('call:initiate', payload);
      expect(result.valid, false);
      expect(
        result.errors,
        contains('Invalid value for field: callAttemptId'),
      );
    });

    test('Unknown message type', () {
      final result = validateMessage('unknown:message', {});
      expect(result.valid, false);
      expect(result.errors.first, contains('Unknown message type'));
    });
  });

  group('Version Negotiation', () {
    test('Parse valid version', () {
      final version = parseVersion('1.2.3');
      expect(version?.major, 1);
      expect(version?.minor, 2);
      expect(version?.patch, 3);
    });

    test('Parse invalid version', () {
      expect(parseVersion('1.2'), null);
      expect(parseVersion('invalid'), null);
      expect(parseVersion(null), null);
    });

    test('Version compatibility - same major', () {
      expect(isVersionCompatible('1.0.0', '1.5.0'), true);
      expect(isVersionCompatible('1.2.3', '1.2.4'), true);
    });

    test('Version compatibility - different major', () {
      expect(isVersionCompatible('1.0.0', '2.0.0'), false);
      expect(isVersionCompatible('2.0.0', '1.0.0'), false);
    });

    test('Negotiated version - lower minor', () {
      expect(getNegotiatedVersion('1.2.0', '1.5.0'), '1.2.0');
      expect(getNegotiatedVersion('1.5.0', '1.2.0'), '1.2.0');
    });

    test('Negotiated version - same minor, lower patch', () {
      expect(getNegotiatedVersion('1.2.3', '1.2.5'), '1.2.3');
      expect(getNegotiatedVersion('1.2.5', '1.2.3'), '1.2.3');
    });

    test('Negotiated version - incompatible major', () {
      expect(getNegotiatedVersion('1.0.0', '2.0.0'), null);
    });
  });
}
