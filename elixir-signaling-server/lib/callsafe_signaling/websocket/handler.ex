defmodule CallsafeSignaling.WebSocket.Handler do
  @moduledoc """
  Cowboy WebSocket handler for signaling connections.
  Manages WebSocket lifecycle, JSON frame parsing, and connection state.
  """

  @behaviour :cowboy_websocket
  require Logger
  alias CallsafeSignaling.MessageRouter

  @type state :: %{
    device_id: String.t() | nil,
    protocol_version: String.t() | nil,
    device_type: atom() | nil,
    business_id: String.t() | nil,
    authenticated: boolean(),
    connection_pid: pid(),
    ip_address: String.t(),
    connected_at: DateTime.t()
  }

  # WebSocket upgrade callback
  @impl :cowboy_websocket
  def init(req, _state) do
    Logger.debug("WebSocket connection request received")

    # Extract IP address from request
    {{ip_addr, _port}, _req} = :cowboy_req.peer(req)
    ip_address = ip_addr |> :inet.ntoa() |> to_string()

    state = %{
      device_id: nil,
      protocol_version: nil,
      device_type: nil,
      business_id: nil,
      authenticated: false,
      connection_pid: self(),
      ip_address: ip_address,
      connected_at: DateTime.utc_now()
    }

    Logger.debug("WebSocket connection from IP: #{ip_address}")
    {:cowboy_websocket, req, state}
  end

  # Handle incoming WebSocket frames
  @impl :cowboy_websocket
  def websocket_handle({:text, json}, state) do
    case Jason.decode(json) do
      {:ok, message} ->
        handle_message(message, state)

      {:error, reason} ->
        Logger.warning("Invalid JSON received: #{inspect(reason)}")
        error_response = Jason.encode!(%{
          type: "error",
          error: "invalid_json",
          message: "Failed to parse message as JSON"
        })
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
  def websocket_info({:send_message, message}, state) when is_map(message) do
    # Send message to WebSocket client
    case Jason.encode(message) do
      {:ok, json} ->
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
        Logger.info("WebSocket connection terminated: #{device_id} (#{device_type}), cleanup: #{cleanup_type}, reason: #{inspect(reason)}")
    end

    # DeviceRegistry will automatically handle cleanup via :DOWN message
    # Web devices will be removed, mobile devices will persist with connection_pid = nil
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

      {:error, error_type, error_message, new_state} ->
        # Send error response
        error_response = Jason.encode!(%{
          "type" => "error",
          "error" => error_type,
          "message" => error_message
        })

        {:reply, {:text, error_response}, new_state}
    end
  end
end
