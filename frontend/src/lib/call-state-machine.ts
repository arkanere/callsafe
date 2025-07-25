// Unified Call State Machine for CallSafe
// Replaces fragmented state management with centralized, predictable state transitions

import type { 
  CallPhase, 
  CallQuality, 
  UnifiedCallState, 
  CallIdentifier,
  UIControlState,
  DeviceContext,
  CallStateChangedEvent,
  CallTerminatedEvent,
  CallErrorEvent,
  RationalizedEventHandlers
} from './types/rationalized-events.js';
import { UI_CONTROL_MATRIX, getUIControlsForPhase } from './types/rationalized-events.js';

// =============================================================================
// STATE TRANSITION DEFINITIONS
// =============================================================================

interface StateTransition {
  from: CallPhase[];
  to: CallPhase;
  trigger: string;
  validation?: (state: UnifiedCallState) => boolean;
  sideEffects?: (state: UnifiedCallState) => Partial<UnifiedCallState>;
}

const STATE_TRANSITIONS: StateTransition[] = [
  // Call initiation flow
  { from: ['initializing'], to: 'routing', trigger: 'ROUTE_CALL' },
  { from: ['routing'], to: 'ringing', trigger: 'AGENTS_FOUND' },
  { from: ['routing'], to: 'terminated', trigger: 'NO_AGENTS' },
  
  // Agent acceptance flow
  { from: ['ringing'], to: 'connecting', trigger: 'AGENT_ACCEPTED' },
  { from: ['ringing'], to: 'terminated', trigger: 'TIMEOUT' },
  { from: ['ringing'], to: 'terminated', trigger: 'CANCELLED' },
  
  // WebRTC connection flow
  { from: ['connecting'], to: 'active', trigger: 'WEBRTC_CONNECTED' },
  { from: ['connecting'], to: 'terminated', trigger: 'WEBRTC_FAILED' },
  { from: ['connecting'], to: 'terminated', trigger: 'CANCELLED' },
  
  // Active call flow
  { from: ['active'], to: 'terminated', trigger: 'CALL_ENDED' },
  { from: ['active'], to: 'connecting', trigger: 'CONNECTION_LOST', 
    validation: (state) => state.webrtcQuality !== 'failed' },
  
  // Error recovery
  { from: ['connecting'], to: 'connecting', trigger: 'RETRY_CONNECTION' },
  
  // Terminal states
  { from: ['initializing', 'routing', 'ringing', 'connecting', 'active'], to: 'terminated', trigger: 'FORCE_END' }
];

// =============================================================================
// CALL STATE MACHINE CLASS
// =============================================================================

export class CallStateMachine {
  private state: UnifiedCallState;
  private eventHandlers: Map<string, Function[]> = new Map();
  private transitionHistory: Array<{ from: CallPhase; to: CallPhase; trigger: string; timestamp: Date }> = [];

  constructor(initialState: UnifiedCallState) {
    this.state = { ...initialState };
    this.validateState();
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  getCurrentState(): UnifiedCallState {
    return { ...this.state };
  }

  getPhase(): CallPhase {
    return this.state.phase;
  }

  getUIControls(): UIControlState {
    return { ...this.state.uiControls };
  }

  canTransition(trigger: string): boolean {
    return this.findTransition(trigger) !== null;
  }

  // Main state transition method
  transition(trigger: string, payload?: Partial<UnifiedCallState>): boolean {
    const transition = this.findTransition(trigger);
    if (!transition) {
      console.warn(`[CallStateMachine] Invalid transition: ${trigger} from ${this.state.phase}`);
      return false;
    }

    // Validate transition if validator exists
    if (transition.validation && !transition.validation(this.state)) {
      console.warn(`[CallStateMachine] Transition validation failed: ${trigger}`);
      return false;
    }

    const previousState = { ...this.state };
    const newPhase = transition.to;

    // Apply side effects
    let updates: Partial<UnifiedCallState> = {};
    if (transition.sideEffects) {
      updates = transition.sideEffects(this.state);
    }

    // Merge payload updates
    if (payload) {
      updates = { ...updates, ...payload };
    }

    // Update state
    this.state = {
      ...this.state,
      ...updates,
      phase: newPhase,
      uiControls: this.calculateUIControls(newPhase, updates.uiControls)
    };

    // Record transition
    this.transitionHistory.push({
      from: previousState.phase,
      to: newPhase,
      trigger,
      timestamp: new Date()
    });

    // Emit state change event
    this.emitStateChanged(previousState, this.state, [trigger]);

    console.log(`[CallStateMachine] ${previousState.phase} → ${newPhase} (${trigger})`);
    
    return true;
  }

  // Specialized methods for common operations
  updateWebRTCQuality(quality: CallQuality): void {
    if (this.state.webrtcQuality === quality) return;

    const previousState = { ...this.state };
    this.state.webrtcQuality = quality;

    this.emitStateChanged(previousState, this.state, ['webrtc_quality']);
  }

  updateUIControl(controlType: 'mute', newState: boolean): void {
    const previousState = { ...this.state };
    this.state.uiControls = {
      ...this.state.uiControls,
      muteState: controlType === 'mute' ? newState : this.state.uiControls.muteState
    };

    this.emitStateChanged(previousState, this.state, ['ui_controls']);
  }

  updateDeviceContext(updates: Partial<DeviceContext>): void {
    const previousState = { ...this.state };
    this.state.deviceContext = { ...this.state.deviceContext, ...updates };

    this.emitStateChanged(previousState, this.state, ['device_context']);
  }

  // Force termination (for cleanup scenarios)
  forceTerminate(reason: string, initiator: 'customer' | 'agent' | 'system'): void {
    const success = this.transition('FORCE_END');
    if (success) {
      this.emitTerminated(reason, initiator);
    }
  }

  // =============================================================================
  // EVENT HANDLING
  // =============================================================================

  on<K extends keyof RationalizedEventHandlers>(
    event: K, 
    handler: RationalizedEventHandlers[K]
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)?.push(handler);
  }

  off(event: string, handler?: Function): void {
    if (!handler) {
      this.eventHandlers.delete(event);
      return;
    }

    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private findTransition(trigger: string): StateTransition | null {
    return STATE_TRANSITIONS.find(t => 
      t.trigger === trigger && t.from.includes(this.state.phase)
    ) || null;
  }

  private calculateUIControls(phase: CallPhase, overrides?: Partial<UIControlState>): UIControlState {
    const baseControls = getUIControlsForPhase(phase);
    
    // Preserve mute state across phase transitions
    baseControls.muteState = this.state.uiControls?.muteState ?? false;
    
    if (overrides) {
      return { ...baseControls, ...overrides };
    }
    
    return baseControls;
  }

  private validateState(): void {
    if (!this.state.identifier?.callId) {
      throw new Error('CallStateMachine: callId is required');
    }
    if (!this.state.identifier?.handle) {
      throw new Error('CallStateMachine: handle is required');
    }
  }

  private emitStateChanged(
    previous: UnifiedCallState, 
    current: UnifiedCallState, 
    changes: string[]
  ): void {
    const event: CallStateChangedEvent = {
      type: 'call.state_changed',
      callId: current.identifier.callId,
      handle: current.identifier.handle,
      previous,
      current,
      changes,
      timestamp: new Date(),
      sourceId: current.identifier.sourceId
    };

    this.emit('call.state_changed', event);
  }

  private emitTerminated(reason: string, initiator: 'customer' | 'agent' | 'system'): void {
    const event: CallTerminatedEvent = {
      type: 'call.terminated',
      callId: this.state.identifier.callId,
      handle: this.state.identifier.handle,
      reason: reason as any,
      initiator,
      phase: this.state.phase,
      duration: this.state.duration || 0,
      deviceContext: this.state.deviceContext,
      sourceId: this.state.identifier.sourceId
    };

    this.emit('call.terminated', event);
  }

  private emit(eventType: string, event: any): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[CallStateMachine] Error in event handler for ${eventType}:`, error);
        }
      });
    }
  }

  // =============================================================================
  // DEBUGGING UTILITIES
  // =============================================================================

  getTransitionHistory(): Array<{ from: CallPhase; to: CallPhase; trigger: string; timestamp: Date }> {
    return [...this.transitionHistory];
  }

  getAvailableTransitions(): string[] {
    return STATE_TRANSITIONS
      .filter(t => t.from.includes(this.state.phase))
      .map(t => t.trigger);
  }

  debugState(): void {
    console.group(`[CallStateMachine] State Debug - ${this.state.identifier.callId}`);
    console.log('Current Phase:', this.state.phase);
    console.log('WebRTC Quality:', this.state.webrtcQuality);
    console.log('UI Controls:', this.state.uiControls);
    console.log('Device Context:', this.state.deviceContext);
    console.log('Available Transitions:', this.getAvailableTransitions());
    console.log('Transition History:', this.transitionHistory.slice(-5)); // Last 5 transitions
    console.groupEnd();
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export function createCallStateMachine(
  identifier: CallIdentifier,
  deviceContext: DeviceContext,
  isCustomer: boolean = false
): CallStateMachine {
  const initialState: UnifiedCallState = {
    identifier,
    phase: 'initializing',
    webrtcQuality: 'good',
    uiControls: getUIControlsForPhase('initializing'),
    deviceContext,
    startTime: new Date(),
    participants: {
      customer: { connected: false },
      agent: { connected: false }
    }
  };

  return new CallStateMachine(initialState);
}

// =============================================================================
// COMMON STATE MACHINE OPERATIONS
// =============================================================================

export class CallStateMachineHelper {
  static isCallActive(machine: CallStateMachine): boolean {
    const phase = machine.getPhase();
    return ['connecting', 'active'].includes(phase);
  }

  static canMute(machine: CallStateMachine): boolean {
    return machine.getUIControls().muteAvailable;
  }

  static canEndCall(machine: CallStateMachine): boolean {
    return machine.getUIControls().endCallAvailable;
  }

  static getCallDuration(machine: CallStateMachine): number {
    const state = machine.getCurrentState();
    if (state.phase === 'terminated' && state.duration) {
      return state.duration;
    }
    return Math.floor((Date.now() - state.startTime.getTime()) / 1000);
  }

  static isConnectedPhase(phase: CallPhase): boolean {
    return ['connecting', 'active'].includes(phase);
  }

  static getPhaseDisplayName(phase: CallPhase): string {
    const displayNames: Record<CallPhase, string> = {
      'initializing': 'Starting call...',
      'routing': 'Finding agent...',
      'ringing': 'Calling agent...',
      'connecting': 'Connecting...',
      'active': 'Call in progress',
      'terminated': 'Call ended'
    };
    return displayNames[phase];
  }
}