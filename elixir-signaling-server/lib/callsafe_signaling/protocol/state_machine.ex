defmodule CallsafeSignaling.Protocol.StateMachine do
  @moduledoc """
  Call state machine as pure data, derived at compile time from
  protocol/protocol.json (`stateMachine` section).
  """

  alias CallsafeSignaling.Protocol.{Enums, Spec}

  @type state :: Enums.call_state()
  @type transition_result :: {:ok, state} | {:error, :invalid_transition}

  @transitions Map.new(Spec.transitions(), fn {from, ts} ->
                 {String.to_atom(from), Enum.map(ts, &String.to_atom(&1["to"]))}
               end)

  @initial_state String.to_atom(Spec.initial_state())
  @terminal_states Enum.map(Spec.terminal_states(), &String.to_atom/1)

  @doc """
  Attempt state transition. Returns {:ok, new_state} or {:error, :invalid_transition}.
  Pure function - no side effects.
  """
  @spec transition(state, state) :: transition_result
  def transition(from_state, to_state) do
    case valid_transition?(from_state, to_state) do
      true -> {:ok, to_state}
      false -> {:error, :invalid_transition}
    end
  end

  @doc """
  Check if transition from one state to another is valid.
  """
  @spec valid_transition?(state, state) :: boolean
  def valid_transition?(from_state, to_state) do
    allowed_states = Map.get(@transitions, from_state, [])
    to_state in allowed_states
  end

  @doc """
  Get all valid next states for a given state.
  """
  @spec next_states(state) :: [state]
  def next_states(state) do
    Map.get(@transitions, state, [])
  end

  @doc """
  Check if a state is terminal (no further transitions possible).
  """
  @spec terminal?(state) :: boolean
  def terminal?(state) do
    state in @terminal_states
  end

  @doc """
  Get initial state for a new call.
  """
  @spec initial_state() :: state
  def initial_state, do: @initial_state
end
