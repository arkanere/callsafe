/// CallSafe Protocol Library
///
/// This library provides the complete protocol specification for CallSafe
/// WebRTC signaling. It includes:
/// - Message type constants
/// - Protocol enums
/// - Immutable message data classes (Freezed)
/// - Validation logic
/// - State transition rules
/// - Version negotiation

library protocol;

// Constants
export 'constants/protocol_constants.dart';

// Models
export 'models/protocol_enums.dart';
export 'models/protocol_messages.dart';
export 'models/state_transitions.dart';

// Validators
export 'validators/protocol_validators.dart';
export 'validators/version_negotiation.dart';
