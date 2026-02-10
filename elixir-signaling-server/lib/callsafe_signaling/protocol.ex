defmodule CallsafeSignaling.Protocol do
  @moduledoc """
  Protocol facade - single entry point for all protocol operations.
  Exposes message types, enums, validation, and state machine.
  """

  # Re-export commonly used types
  defdelegate version(), to: CallsafeSignaling.Protocol.MessageTypes

  # Message types
  defdelegate all_message_types(), to: CallsafeSignaling.Protocol.MessageTypes, as: :all
  defdelegate valid_message_type?(type), to: CallsafeSignaling.Protocol.MessageTypes, as: :valid?

  # Validation
  defdelegate validate(message_type, payload), to: CallsafeSignaling.Protocol.Validator

  # State machine
  defdelegate transition(from_state, to_state), to: CallsafeSignaling.Protocol.StateMachine
  defdelegate valid_transition?(from, to), to: CallsafeSignaling.Protocol.StateMachine
  defdelegate next_states(state), to: CallsafeSignaling.Protocol.StateMachine
  defdelegate terminal?(state), to: CallsafeSignaling.Protocol.StateMachine
  defdelegate initial_state(), to: CallsafeSignaling.Protocol.StateMachine

  # Convenience aliases for direct access to submodules
  alias CallsafeSignaling.Protocol.{MessageTypes, Enums, Validator, StateMachine}

  def message_types, do: MessageTypes
  def enums, do: Enums
  def validator, do: Validator
  def state_machine, do: StateMachine
end
