defmodule CallsafeSignaling.DecisionCapture do
  @moduledoc """
  Decision capture instrumentation for shadow mode validation.
  Emits structured decision records for every state-changing action.

  Decision types:
  - :state_transition - Call state changes
  - :message_routed - Message routing decisions
  - :device_selected - Device selection for incoming calls
  - :timeout_set - Timeout scheduling
  - :error_returned - Error responses
  """

  require Logger

  @type decision_id :: String.t()
  @type decision_type ::
          :state_transition
          | :message_routed
          | :device_selected
          | :timeout_set
          | :timeout_triggered
          | :error_returned

  @type decision :: %{
          decision_id: decision_id,
          timestamp: integer(),
          message_type: String.t() | nil,
          call_id: String.t() | nil,
          decision_type: decision_type,
          decision_value: any(),
          context: map()
        }

  @doc """
  Emit a decision record via telemetry and structured logging.
  """
  @spec emit(
          decision_type,
          String.t() | nil,
          String.t() | nil,
          any(),
          map()
        ) :: :ok
  def emit(decision_type, message_type, call_id, decision_value, context \\ %{}) do
    decision = %{
      decision_id: generate_decision_id(),
      timestamp: System.system_time(:millisecond),
      message_type: message_type,
      call_id: call_id,
      decision_type: decision_type,
      decision_value: decision_value,
      context: context
    }

    # Emit via telemetry
    :telemetry.execute(
      [:callsafe_signaling, :decision, :captured],
      %{count: 1},
      decision
    )

    # Also log as structured JSON for easy parsing
    log_decision(decision)

    :ok
  end

  @doc """
  Emit a state transition decision.
  """
  @spec emit_state_transition(
          String.t(),
          String.t() | nil,
          atom(),
          atom(),
          map()
        ) :: :ok
  def emit_state_transition(call_id, message_type, from_state, to_state, context \\ %{}) do
    emit(
      :state_transition,
      message_type,
      call_id,
      %{from: from_state, to: to_state},
      context
    )
  end

  @doc """
  Emit a message routing decision.
  """
  @spec emit_message_routed(
          String.t(),
          String.t(),
          String.t(),
          String.t(),
          map()
        ) :: :ok
  def emit_message_routed(call_id, message_type, from_device, to_device, context \\ %{}) do
    emit(
      :message_routed,
      message_type,
      call_id,
      %{from: from_device, to: to_device},
      context
    )
  end

  @doc """
  Emit a device selection decision.
  """
  @spec emit_device_selected(
          String.t(),
          String.t(),
          String.t() | nil,
          map()
        ) :: :ok
  def emit_device_selected(call_id, message_type, selected_device_id, context \\ %{}) do
    emit(
      :device_selected,
      message_type,
      call_id,
      %{device_id: selected_device_id},
      context
    )
  end

  @doc """
  Emit a timeout set decision.
  """
  @spec emit_timeout_set(
          String.t(),
          String.t() | nil,
          atom(),
          integer(),
          map()
        ) :: :ok
  def emit_timeout_set(call_id, message_type, timeout_type, duration_ms, context \\ %{}) do
    emit(
      :timeout_set,
      message_type,
      call_id,
      %{timeout_type: timeout_type, duration_ms: duration_ms},
      context
    )
  end

  @doc """
  Emit a timeout triggered decision.
  """
  @spec emit_timeout_triggered(
          String.t(),
          atom(),
          atom(),
          map()
        ) :: :ok
  def emit_timeout_triggered(call_id, timeout_type, current_state, context \\ %{}) do
    emit(
      :timeout_triggered,
      nil,
      call_id,
      %{timeout_type: timeout_type, current_state: current_state},
      context
    )
  end

  @doc """
  Emit an error returned decision.
  """
  @spec emit_error_returned(
          String.t() | nil,
          String.t() | nil,
          atom(),
          String.t(),
          map()
        ) :: :ok
  def emit_error_returned(call_id, message_type, error_code, error_message, context \\ %{}) do
    emit(
      :error_returned,
      message_type,
      call_id,
      %{error_code: error_code, error_message: error_message},
      context
    )
  end

  # Private helpers

  defp generate_decision_id do
    "dec_#{:crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)}"
  end

  defp log_decision(decision) do
    Logger.info(
      "[DECISION] #{decision.decision_type}",
      decision_id: decision.decision_id,
      timestamp: decision.timestamp,
      message_type: decision.message_type,
      call_id: decision.call_id,
      decision_type: decision.decision_type,
      decision_value: inspect(decision.decision_value),
      context: inspect(decision.context)
    )
  end
end
