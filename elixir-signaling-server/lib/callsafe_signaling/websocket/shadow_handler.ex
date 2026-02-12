defmodule CallsafeSignaling.WebSocket.ShadowHandler do
  @moduledoc """
  Shadow mode WebSocket handler for validation.
  Accepts mirrored traffic from Node.js, processes through existing pipeline,
  but suppresses all outbound messages to real clients.
  Shadow responses are captured as decisions only.

  Part of P3.3 Phase 2: Shadow Bridge
  """

  @behaviour :cowboy_websocket
  require Logger
  alias CallsafeSignaling.{MessageRouter, DecisionCapture}

  @type state :: %{
          shadow_mode: boolean(),
          node_js_bridge: boolean(),
          connection_pid: pid(),
          ip_address: String.t(),
          connected_at: DateTime.t(),
          messages_processed: non_neg_integer(),
          decisions_captured: non_neg_integer()
        }

  # WebSocket upgrade callback
  @impl :cowboy_websocket
  def init(req, _state) do
    Logger.info("Shadow bridge connection request received")

    # Extract IP address from request
    {{ip_addr, _port}, _req} = :cowboy_req.peer(req)
    ip_address = ip_addr |> :inet.ntoa() |> to_string()

    state = %{
      shadow_mode: true,
      node_js_bridge: true,
      connection_pid: self(),
      ip_address: ip_address,
      connected_at: DateTime.utc_now(),
      messages_processed: 0,
      decisions_captured: 0
    }

    Logger.info("Shadow bridge connected from IP: #{ip_address}")

    # Track shadow connection
    :telemetry.execute(
      [:callsafe_signaling, :shadow, :connected],
      %{count: 1},
      %{ip_address: ip_address}
    )

    {:cowboy_websocket, req, state}
  end

  # Handle incoming WebSocket frames (mirrored traffic from Node.js)
  @impl :cowboy_websocket
  def websocket_handle({:text, json}, state) do
    case Jason.decode(json) do
      {:ok, shadow_message} ->
        handle_shadow_message(shadow_message, state)

      {:error, reason} ->
        Logger.warning("Invalid JSON received from shadow bridge: #{inspect(reason)}")
        {:ok, state}
    end
  end

  def websocket_handle({:ping, _}, state) do
    {:reply, :pong, state}
  end

  def websocket_handle(frame, state) do
    Logger.warning("Unexpected WebSocket frame on shadow bridge: #{inspect(frame)}")
    {:ok, state}
  end

  # Handle Erlang messages sent to this process
  @impl :cowboy_websocket
  def websocket_info(info, state) do
    Logger.debug("Shadow bridge info received: #{inspect(info)}")
    {:ok, state}
  end

  # Handle connection termination
  @impl :cowboy_websocket
  def terminate(reason, _req, state) do
    Logger.info(
      "Shadow bridge connection terminated: #{inspect(reason)}, messages_processed: #{state.messages_processed}, decisions_captured: #{state.decisions_captured}"
    )

    # Track shadow disconnection
    :telemetry.execute(
      [:callsafe_signaling, :shadow, :disconnected],
      %{count: 1},
      %{
        reason: inspect(reason),
        messages_processed: state.messages_processed,
        decisions_captured: state.decisions_captured
      }
    )

    :ok
  end

  # Private functions

  defp handle_shadow_message(shadow_message, state) do
    %{
      "event_type" => event_type,
      "socket_id" => socket_id,
      "call_id" => call_id,
      "data" => data,
      "metadata" => metadata
    } = shadow_message

    Logger.debug(
      "Shadow message received: event=#{event_type}, socket=#{socket_id}, call=#{inspect(call_id)}"
    )

    # Track shadow message processing
    :telemetry.execute(
      [:callsafe_signaling, :shadow, :message_received],
      %{count: 1},
      %{event_type: event_type, socket_id: socket_id, call_id: call_id}
    )

    # Build a fake WebSocket state that matches the real handler's state
    # but marks it as shadow mode to suppress outbound messages
    fake_ws_state = build_fake_ws_state(metadata)

    # Route through the normal message pipeline
    # The MessageRouter will process this and make decisions
    result =
      case MessageRouter.route(data, fake_ws_state) do
        {:ok, response, new_state} ->
          # Capture the decision but do NOT send to real clients
          capture_shadow_decision(event_type, socket_id, call_id, :ok, response, metadata)
          {:ok, new_state}

        {:error, error_type, error_message, new_state} ->
          # Capture the error decision
          capture_shadow_decision(
            event_type,
            socket_id,
            call_id,
            :error,
            %{error_type: error_type, error_message: error_message},
            metadata
          )

          {:error, new_state}
      end

    # Update state with processed count
    new_state = %{
      state
      | messages_processed: state.messages_processed + 1,
        decisions_captured:
          state.decisions_captured + if(match?({:ok, _}, result), do: 1, else: 1)
    }

    # Send acknowledgment back to Node.js bridge
    ack = Jason.encode!(%{type: "ack", message_id: "#{socket_id}_#{System.system_time()}"})
    {:reply, {:text, ack}, new_state}
  end

  defp build_fake_ws_state(metadata) do
    # Build a state map that looks like a real WebSocket connection state
    # but is marked for shadow mode processing
    %{
      device_id: get_in(metadata, ["auth_context", "device_id"]),
      protocol_version: get_in(metadata, ["device_info", "protocol_version"]),
      device_type: :shadow,
      business_id: get_in(metadata, ["auth_context", "business_id"]),
      authenticated: true,
      connection_pid: nil,
      # Mark as nil to prevent sending
      ip_address: get_in(metadata, ["device_info", "remote_address"]) || "unknown",
      connected_at: DateTime.utc_now(),
      shadow_mode: true
    }
  end

  defp capture_shadow_decision(event_type, socket_id, call_id, result_type, response, metadata) do
    # Emit a decision record for this shadow processing
    DecisionCapture.emit(
      :shadow_processing,
      event_type,
      call_id,
      %{
        result: result_type,
        response: inspect(response),
        socket_id: socket_id
      },
      %{
        shadow: true,
        timestamp: metadata["timestamp"],
        node_js_origin: true
      }
    )

    # Track shadow decision capture
    :telemetry.execute(
      [:callsafe_signaling, :shadow, :decision_captured],
      %{count: 1},
      %{
        event_type: event_type,
        call_id: call_id,
        result_type: result_type
      }
    )

    Logger.debug(
      "Shadow decision captured: event=#{event_type}, call=#{inspect(call_id)}, result=#{result_type}"
    )
  end
end
