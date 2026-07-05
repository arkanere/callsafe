import '../models/protocol_enums.dart';

/// Field validators for protocol messages
class ProtocolValidators {
  /// UUID validation (version 4)
  static bool isValidUuid(dynamic value) {
    if (value is! String) return false;
    final uuidRegex = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      caseSensitive: false,
    );
    return uuidRegex.hasMatch(value);
  }

  /// Handle validation
  static bool isValidHandle(dynamic value) {
    if (value is! String) return false;
    return value.isNotEmpty && value.length <= 255;
  }

  /// Device ID validation
  static bool isValidDeviceId(dynamic value) {
    if (value is! String) return false;
    return value.isNotEmpty;
  }

  /// Protocol version validation (semver format)
  static bool isValidProtocolVersion(dynamic value) {
    if (value is! String) return false;
    final versionRegex = RegExp(r'^\d+\.\d+\.\d+$');
    return versionRegex.hasMatch(value);
  }

  /// Call type validation
  static bool isValidCallType(dynamic value) {
    if (value is! String) return false;
    try {
      CallType.fromString(value);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Device type validation
  static bool isValidDeviceType(dynamic value) {
    if (value is! String) return false;
    try {
      DeviceType.fromString(value);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Device status validation
  static bool isValidDeviceStatus(dynamic value) {
    if (value is! String) return false;
    try {
      DeviceStatus.fromString(value);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Role validation
  static bool isValidRole(dynamic value) {
    if (value is! String) return false;
    try {
      Role.fromString(value);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Media toggle action validation
  static bool isValidMediaToggleAction(dynamic value) {
    if (value is! String) return false;
    try {
      MediaToggleAction.fromString(value);
      return true;
    } catch (_) {
      return false;
    }
  }
}

/// Message schema definition
class MessageSchema {
  final List<String> required;
  final List<String> optional;
  final Map<String, bool Function(dynamic)> validators;

  const MessageSchema({
    required this.required,
    required this.optional,
    required this.validators,
  });
}

/// Message validation result
class ValidationResult {
  final bool valid;
  final List<String> errors;

  const ValidationResult({
    required this.valid,
    required this.errors,
  });

  factory ValidationResult.success() =>
      const ValidationResult(valid: true, errors: []);

  factory ValidationResult.failure(List<String> errors) =>
      ValidationResult(valid: false, errors: errors);
}

/// Message schemas for validation
class MessageSchemas {
  static const callInitiate = MessageSchema(
    required: ['callAttemptId', 'handle', 'callType', 'mediaCapabilities'],
    optional: ['timestamp'],
    validators: {
      'callAttemptId': ProtocolValidators.isValidUuid,
      'handle': ProtocolValidators.isValidHandle,
    },
  );

  static const callAccept = MessageSchema(
    required: ['callAttemptId'],
    optional: ['mediaCapabilities', 'timestamp'],
    validators: {
      'callAttemptId': ProtocolValidators.isValidUuid,
    },
  );

  static const callReject = MessageSchema(
    required: ['callAttemptId'],
    optional: ['reason', 'timestamp'],
    validators: {
      'callAttemptId': ProtocolValidators.isValidUuid,
    },
  );

  static const callEnd = MessageSchema(
    required: ['callAttemptId'],
    optional: ['timestamp'],
    validators: {
      'callAttemptId': ProtocolValidators.isValidUuid,
    },
  );

  static const callCancel = MessageSchema(
    required: ['callAttemptId'],
    optional: ['timestamp'],
    validators: {
      'callAttemptId': ProtocolValidators.isValidUuid,
    },
  );

  static const deviceConnect = MessageSchema(
    required: ['deviceType', 'deviceId', 'token', 'protocolVersion'],
    optional: ['pushToken', 'timestamp'],
    validators: {
      'deviceId': ProtocolValidators.isValidDeviceId,
      'protocolVersion': ProtocolValidators.isValidProtocolVersion,
    },
  );

  static const deviceStatus = MessageSchema(
    required: ['status'],
    optional: ['timestamp'],
    validators: {
      'status': ProtocolValidators.isValidDeviceStatus,
    },
  );

  static const mediaToggle = MessageSchema(
    required: ['callAttemptId', 'action'],
    optional: ['timestamp'],
    validators: {
      'callAttemptId': ProtocolValidators.isValidUuid,
      'action': ProtocolValidators.isValidMediaToggleAction,
    },
  );

  static const callEscalate = MessageSchema(
    required: ['callAttemptId', 'mediaCapabilities'],
    optional: ['timestamp'],
    validators: {
      'callAttemptId': ProtocolValidators.isValidUuid,
    },
  );

  static const callDowngrade = MessageSchema(
    required: ['callAttemptId'],
    optional: ['reason', 'timestamp'],
    validators: {
      'callAttemptId': ProtocolValidators.isValidUuid,
    },
  );

  /// Get schema by message type
  static MessageSchema? getSchema(String messageType) {
    switch (messageType) {
      case 'call:initiate':
        return callInitiate;
      case 'call:accept':
        return callAccept;
      case 'call:reject':
        return callReject;
      case 'call:end':
        return callEnd;
      case 'call:cancel':
        return callCancel;
      case 'device:connect':
        return deviceConnect;
      case 'device:status':
        return deviceStatus;
      case 'media:toggle':
        return mediaToggle;
      case 'call:escalate':
        return callEscalate;
      case 'call:downgrade':
        return callDowngrade;
      default:
        return null;
    }
  }
}

/// Validate a message payload against its schema
ValidationResult validateMessage(
  String messageType,
  Map<String, dynamic> payload,
) {
  final schema = MessageSchemas.getSchema(messageType);

  if (schema == null) {
    return ValidationResult.failure(['Unknown message type: $messageType']);
  }

  final errors = <String>[];

  // Check required fields
  for (final field in schema.required) {
    if (!payload.containsKey(field)) {
      errors.add('Missing required field: $field');
    }
  }

  // Validate field values
  for (final entry in schema.validators.entries) {
    final field = entry.key;
    final validator = entry.value;

    if (payload.containsKey(field)) {
      final value = payload[field];
      if (!validator(value)) {
        errors.add('Invalid value for field: $field');
      }
    }
  }

  return errors.isEmpty
      ? ValidationResult.success()
      : ValidationResult.failure(errors);
}
