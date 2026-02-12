defmodule CallsafeSignaling.Telemetry do
  @moduledoc """
  Telemetry instrumentation for the signaling server.
  Emits events for call lifecycle, message routing, and connection tracking.
  """

  require Logger
  alias CallsafeSignaling.Stats

  @doc """
  Setup telemetry event handlers.
  Attaches handlers for all instrumented events.
  """
  def setup do
    events = [
      # Call lifecycle events
      [:callsafe_signaling, :call, :started],
      [:callsafe_signaling, :call, :connected],
      [:callsafe_signaling, :call, :ended],
      [:callsafe_signaling, :call, :failed],

      # Message routing events
      [:callsafe_signaling, :message, :received],
      [:callsafe_signaling, :message, :sent],
      [:callsafe_signaling, :message, :validation_failed],

      # Connection events
      [:callsafe_signaling, :connection, :established],
      [:callsafe_signaling, :connection, :terminated],

      # FCM events
      [:callsafe_signaling, :fcm, :notification, :sent],
      [:callsafe_signaling, :fcm, :notification, :failed],
      [:callsafe_signaling, :fcm, :notification, :error],

      # GenServer events
      [:callsafe_signaling, :genserver, :crashed],
      [:callsafe_signaling, :genserver, :restarted]
    ]

    :telemetry.attach_many(
      "callsafe-signaling-logger",
      events,
      &handle_event/4,
      nil
    )

    Logger.info("Telemetry handlers attached for #{length(events)} events")
  end

  @doc """
  Emit call started event.
  """
  def emit_call_started(call_id, business_id, call_type) do
    Stats.increment_calls_initiated()

    :telemetry.execute(
      [:callsafe_signaling, :call, :started],
      %{count: 1},
      %{call_id: call_id, business_id: business_id, call_type: call_type}
    )
  end

  @doc """
  Emit call connected event.
  """
  def emit_call_connected(call_id, setup_duration_ms) do
    Stats.increment_calls_connected()

    :telemetry.execute(
      [:callsafe_signaling, :call, :connected],
      %{duration: setup_duration_ms, count: 1},
      %{call_id: call_id}
    )
  end

  @doc """
  Emit call ended event.
  """
  def emit_call_ended(call_id, call_duration_ms, end_reason) do
    Stats.increment_calls_ended()

    :telemetry.execute(
      [:callsafe_signaling, :call, :ended],
      %{duration: call_duration_ms, count: 1},
      %{call_id: call_id, reason: end_reason}
    )
  end

  @doc """
  Emit call failed event.
  """
  def emit_call_failed(call_id, failure_reason) do
    Stats.increment_calls_failed()

    :telemetry.execute(
      [:callsafe_signaling, :call, :failed],
      %{count: 1},
      %{call_id: call_id, reason: failure_reason}
    )
  end

  @doc """
  Emit message received event.
  """
  def emit_message_received(message_type, device_id) do
    :telemetry.execute(
      [:callsafe_signaling, :message, :received],
      %{count: 1},
      %{message_type: message_type, device_id: device_id}
    )
  end

  @doc """
  Emit message sent event.
  """
  def emit_message_sent(message_type, device_id) do
    :telemetry.execute(
      [:callsafe_signaling, :message, :sent],
      %{count: 1},
      %{message_type: message_type, device_id: device_id}
    )
  end

  @doc """
  Emit message validation failed event.
  """
  def emit_validation_failed(message_type, error) do
    :telemetry.execute(
      [:callsafe_signaling, :message, :validation_failed],
      %{count: 1},
      %{message_type: message_type, error: error}
    )
  end

  @doc """
  Emit connection established event.
  """
  def emit_connection_established(device_id, protocol_version) do
    :telemetry.execute(
      [:callsafe_signaling, :connection, :established],
      %{count: 1},
      %{device_id: device_id, protocol_version: protocol_version}
    )
  end

  @doc """
  Emit connection terminated event.
  """
  def emit_connection_terminated(device_id, reason) do
    :telemetry.execute(
      [:callsafe_signaling, :connection, :terminated],
      %{count: 1},
      %{device_id: device_id, reason: reason}
    )
  end

  @doc """
  Emit GenServer crashed event.
  """
  def emit_genserver_crashed(module, reason) do
    :telemetry.execute(
      [:callsafe_signaling, :genserver, :crashed],
      %{count: 1},
      %{module: module, reason: inspect(reason)}
    )
  end

  @doc """
  Emit GenServer restarted event.
  """
  def emit_genserver_restarted(module) do
    :telemetry.execute(
      [:callsafe_signaling, :genserver, :restarted],
      %{count: 1},
      %{module: module}
    )
  end

  # Event handler callback
  defp handle_event(event_name, measurements, metadata, _config) do
    if CallsafeSignaling.Config.telemetry_enabled?() do
      log_event(event_name, measurements, metadata)
    end
  end

  defp log_event([:callsafe_signaling, :call, :started], _measurements, metadata) do
    Logger.info("Call started",
      call_id: metadata.call_id,
      business_id: metadata.business_id,
      call_type: metadata.call_type
    )
  end

  defp log_event([:callsafe_signaling, :call, :connected], measurements, metadata) do
    Logger.info("Call connected",
      call_id: metadata.call_id,
      setup_duration_ms: measurements.duration
    )
  end

  defp log_event([:callsafe_signaling, :call, :ended], measurements, metadata) do
    Logger.info("Call ended",
      call_id: metadata.call_id,
      duration_ms: measurements.duration,
      reason: metadata.reason
    )
  end

  defp log_event([:callsafe_signaling, :call, :failed], _measurements, metadata) do
    Logger.warning("Call failed",
      call_id: metadata.call_id,
      reason: metadata.reason
    )
  end

  defp log_event([:callsafe_signaling, :message, :validation_failed], _measurements, metadata) do
    Logger.warning("Message validation failed",
      message_type: metadata.message_type,
      error: metadata.error
    )
  end

  defp log_event([:callsafe_signaling, :genserver, :crashed], _measurements, metadata) do
    Logger.error("GenServer crashed",
      module: metadata.module,
      reason: metadata.reason
    )
  end

  defp log_event([:callsafe_signaling, :genserver, :restarted], _measurements, metadata) do
    Logger.warning("GenServer restarted",
      module: metadata.module
    )
  end

  defp log_event(_event_name, _measurements, _metadata) do
    # Silently ignore events without specific handlers
    :ok
  end
end
