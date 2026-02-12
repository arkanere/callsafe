defmodule CallsafeSignaling.WebSocket.Handler do
  @moduledoc """
  Cowboy WebSocket handler for signaling connections.
  Manages WebSocket lifecycle, JSON frame parsing, and connection state.
  """

  @behaviour :cowboy_websocket
  require Logger

  @type state :: %{
    device_id: String.t() | nil,
    protocol_version: String.t() | nil,
    device_type: atom() | nil,
    connected_at: DateTime.t()
  }

  # WebSocket upgrade callback
  @impl :cowboy_websocket
  def init(req, _state) do
    Logger.debug("WebSocket connection request received")

    state = %{
      device_id: nil,
      protocol_version: nil,
      device_type: nil,
      connected_at: DateTime.utc_now()
    }

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
  def websocket_info(info, state) do
    Logger.debug("WebSocket info received: #{inspect(info)}")
    {:ok, state}
  end

  # Handle connection termination
  @impl :cowboy_websocket
  def terminate(reason, _req, state) do
    Logger.info("WebSocket connection terminated: #{inspect(reason)}, state: #{inspect(state)}")
    :ok
  end

  # Private functions

  defp handle_message(%{"type" => type}, state) do
    Logger.debug("Received message type: #{type}")

    error_response = Jason.encode!(%{
      type: "error",
      error: "not_implemented",
      message: "Message type '#{type}' not yet implemented",
      received_type: type
    })

    {:reply, {:text, error_response}, state}
  end

  defp handle_message(message, state) do
    Logger.warning("Message missing 'type' field: #{inspect(message)}")

    error_response = Jason.encode!(%{
      type: "error",
      error: "invalid_message",
      message: "Message must include a 'type' field"
    })

    {:reply, {:text, error_response}, state}
  end
end
