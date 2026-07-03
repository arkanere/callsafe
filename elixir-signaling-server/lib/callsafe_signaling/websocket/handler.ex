defmodule CallsafeSignaling.WebSocket.Handler do
  @moduledoc """
  Cowboy WebSocket handler for signaling connections.
  Manages WebSocket lifecycle, JSON frame parsing, and connection state.
  """

  @behaviour :cowboy_websocket
  require Logger
  alias CallsafeSignaling.{MessageRouter, Stats}

  @type state :: %{
          device_id: String.t() | nil,
          protocol_version: String.t() | nil,
          device_type: atom() | nil,
          business_id: String.t() | nil,
          role: atom() | nil,
          authenticated: boolean(),
          connection_pid: pid(),
          ip_address: String.t(),
          connected_at: DateTime.t()
        }

  # Server closes any connection that has produced no frames for this long
  # (protocol transport.heartbeat.serverIdleCloseMs; clients ping every 25 s).
  @idle_timeout_ms 60_000

  # WebSocket upgrade callback
  @impl :cowboy_websocket
  def init(req, _state) do
    Logger.debug("WebSocket connection request received")

    # Extract IP address from request
    {ip_addr, _port} = :cowboy_req.peer(req)
    ip_address = ip_addr |> :inet.ntoa() |> to_string()

    state = %{
      device_id: nil,
      protocol_version: nil,
      device_type: nil,
      business_id: nil,
      role: nil,
      authenticated: false,
      connection_pid: nil,
      ip_address: ip_address,
      connected_at: DateTime.utc_now()
    }

    Logger.debug("WebSocket connection from IP: #{ip_address}")

    # Track connection stats
    Stats.increment_connections_total()
    Stats.increment_connections_active()

    {:cowboy_websocket, req, state, %{idle_timeout: @idle_timeout_ms}}
  end

  # Called in the WebSocket process after the HTTP→WS upgrade completes.
  # self() here is the real WebSocket process — update connection_pid so
  # DeviceRegistry monitors the correct process.
  @impl :cowboy_websocket
  def websocket_init(state) do
    {:ok, %{state | connection_pid: self()}}
  end

  # Handle incoming WebSocket frames
  @impl :cowboy_websocket
  def websocket_handle({:text, json}, state) do
    # Track received message
    Stats.increment_messages_received()

    case Jason.decode(json) do
      {:ok, message} ->
        handle_message(message, state)

      {:error, reason} ->
        Logger.warning("Invalid JSON received: #{inspect(reason)}")

        error_response =
          MessageRouter.error_payload("invalid_json", "Failed to parse message as JSON", nil)
          |> Map.put("type", "error")
          |> Jason.encode!()

        {:reply, {:text, error_response}, state}
    end
  end

  def websocket_handle({:ping, _}, state) do
    {:reply, :pong, state}
  end

  def websocket_handle(frame, state) do
    Logger.warning("Unexpected WebSocket frame: #{inspect(frame)}")
    {:ok, state}
  end

  # Handle Erlang messages sent to this process
  @impl :cowboy_websocket
  def websocket_info({:send_message, message_type, payload}, state) when is_map(payload) do
    # Merge type into payload (relay payloads may omit it; notification payloads already include it)
    message = Map.put(payload, "type", message_type)

    case Jason.encode(message) do
      {:ok, json} ->
        Stats.increment_messages_sent()
        {:reply, {:text, json}, state}

      {:error, reason} ->
        Logger.error("Failed to encode message: #{inspect(reason)}")
        {:ok, state}
    end
  end

  def websocket_info(info, state) do
    Logger.debug("WebSocket info received: #{inspect(info)}")
    {:ok, state}
  end

  # Handle connection termination
  @impl :cowboy_websocket
  def terminate(reason, _req, state) do
    device_id = Map.get(state, :device_id)
    device_type = Map.get(state, :device_type)

    case device_id do
      nil ->
        Logger.info("WebSocket connection terminated (unauthenticated): #{inspect(reason)}")

      device_id ->
        cleanup_type = if device_type == :web, do: "removed", else: "persisted"

        Logger.info(
          "WebSocket connection terminated: #{device_id} (#{device_type}), cleanup: #{cleanup_type}, reason: #{inspect(reason)}"
        )
    end

    # DeviceRegistry will automatically handle cleanup via :DOWN message
    # Web devices will be removed, mobile devices will persist with connection_pid = nil

    # Track disconnection stats
    Stats.decrement_connections_active()

    :ok
  end

  # Private functions

  defp handle_message(message, state) do
    Logger.debug("Received message: #{inspect(message)}")

    case MessageRouter.route(message, state) do
      {:ok, response, new_state} ->
        # Send response if provided
        case response do
          nil ->
            {:ok, new_state}

          response_map ->
            response_json = Jason.encode!(response_map)
            {:reply, {:text, response_json}, new_state}
        end

      {:error, error_payload, new_state} ->
        # Send v2 error frame: {type, code, message, relatedType?, callAttemptId?, timestamp}
        error_response =
          error_payload
          |> Map.put("type", "error")
          |> Jason.encode!()

        {:reply, {:text, error_response}, new_state}
    end
  end
end
