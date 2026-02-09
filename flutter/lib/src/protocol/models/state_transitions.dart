import 'protocol_enums.dart';

/// Valid state transitions
/// Maps current state -> allowed next states
const Map<CallState, List<CallState>> stateTransitions = {
  CallState.initiated: [
    CallState.ringing,
    CallState.busy,
    CallState.unavailable,
    CallState.cancelled,
    CallState.failed,
  ],
  CallState.ringing: [
    CallState.connecting,
    CallState.timeout,
    CallState.cancelled,
    CallState.failed,
  ],
  CallState.connecting: [
    CallState.connected,
    CallState.cameraPermissionDenied,
    CallState.failed,
    CallState.cancelled,
  ],
  CallState.connected: [
    CallState.ended,
    CallState.failed,
    CallState.escalationPending,
    CallState.videoPausedByUser,
    CallState.videoPausedBandwidth,
  ],
  CallState.escalationPending: [
    CallState.connected,
    CallState.ended,
    CallState.failed,
  ],
  CallState.videoPausedByUser: [
    CallState.connected,
    CallState.ended,
    CallState.failed,
  ],
  CallState.videoPausedBandwidth: [
    CallState.connected,
    CallState.ended,
    CallState.failed,
  ],
  CallState.cameraPermissionDenied: [
    CallState.connected,
    CallState.ended,
    CallState.failed,
  ],
  // Terminal states
  CallState.ended: [],
  CallState.failed: [],
  CallState.cancelled: [],
  CallState.busy: [],
  CallState.unavailable: [],
  CallState.timeout: [],
};

/// Check if a state transition is valid
bool isValidStateTransition(CallState currentState, CallState nextState) {
  final allowedStates = stateTransitions[currentState];
  if (allowedStates == null) return false;
  return allowedStates.contains(nextState);
}

/// Check if a state is terminal (no further transitions allowed)
bool isTerminalState(CallState state) {
  final allowedStates = stateTransitions[state];
  return allowedStates == null || allowedStates.isEmpty;
}
