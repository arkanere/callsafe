import 'protocol_enums.dart';

/// Valid state transitions (protocol v2 state machine)
/// Maps current state -> allowed next states
const Map<CallState, List<CallState>> stateTransitions = {
  CallState.initiated: [
    CallState.ringing,
    CallState.unavailable,
    CallState.busy,
    CallState.cancelled,
    CallState.failed,
  ],
  CallState.ringing: [
    CallState.connecting,
    CallState.cancelled,
    CallState.unavailable,
    CallState.timeout,
    CallState.failed,
  ],
  CallState.connecting: [
    CallState.connected,
    CallState.ended,
    CallState.timeout,
    CallState.failed,
  ],
  CallState.connected: [
    CallState.ended,
    CallState.escalationPending,
    CallState.failed,
  ],
  CallState.escalationPending: [
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
