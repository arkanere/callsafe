defmodule CallsafeSignaling.Protocol.StateMachine do
  @moduledoc """
  Call state machine as pure data.
  Defines valid state transitions without side effects.
  """

  alias CallsafeSignaling.Protocol.Enums

  @type state :: Enums.call_state()
  @type transition_result :: {:ok, state} | {:error, :invalid_transition}

  # State transition map - immutable data structure
  @transitions %{
    initiated: [:ringing, :busy, :unavailable, :cancelled, :failed],
    ringing: [:connecting, :timeout, :cancelled, :failed],
    connecting: [:connected, :camera_permission_denied, :failed, :cancelled],
    connected: [:ended, :failed, :escalation_pending, :video_paused_by_user, :video_paused_bandwidth],
    escalation_pending: [:connected, :ended, :failed],
    video_paused_by_user: [:connected, :ended, :failed],
    video_paused_bandwidth: [:connected, :ended, :failed],
    camera_permission_denied: [:connected, :ended, :failed],
    ended: [],
    failed: [],
    cancelled: [],
    busy: [],
    unavailable: [],
    timeout: []
  }

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
    next_states(state) == []
  end

  @doc """
  Get initial state for a new call.
  """
  @spec initial_state() :: state
  def initial_state, do: :initiated
end
