defmodule CallsafeSignaling.MessageRouter do
  @moduledoc """
  Message dispatch router.
  Routes incoming WebSocket messages to appropriate handlers.
  Pure function composition - no side effects, returns responses as data.
  """

  require Logger
  alias CallsafeSignaling.Protocol.{Validator, MessageTypes}
  alias CallsafeSignaling.{DeviceHandler, CallHandler, WebRTCHandler, MediaHandler}

  @type message :: map()
  @type state :: map()
  @type response :: {:ok, map() | nil, state} | {:error, String.t(), String.t(), state}

  @doc """
  Route a message to its handler.
  Returns {:ok, response_message, new_state} or {:error, error_type, error_message, state}.
  response_message can be nil if no response should be sent.
  """
  @spec route(message, state) :: response
  def route(message, state) do
    with {:ok, message_type} <- extract_type(message),
         :ok <- validate_message(message_type, message),
         {:ok, response, new_state} <- dispatch(message_type, message, state) do
      {:ok, response, new_state}
    else
      {:error, error_type, error_message} ->
        Logger.warning("Message routing error: #{error_type} - #{error_message}")
        {:error, error_type, error_message, state}
    end
  end

  # Extract message type from message
  defp extract_type(%{"type" => type}) when is_binary(type) do
    {:ok, type}
  end

  defp extract_type(_) do
    {:error, "invalid_message", "Message must include a 'type' field"}
  end

  # Validate message against protocol schema
  defp validate_message(message_type, message) do
    case Validator.validate(message_type, message) do
      :ok ->
        :ok

      {:error, reasons} ->
        error_message = Enum.join(reasons, "; ")
        Logger.warning("Message validation failed: #{message_type} - #{error_message}")
        {:error, "validation_error", error_message}
    end
  end

  # Dispatch message to appropriate handler
  defp dispatch(message_type, message, state) do
    case categorize_message(message_type) do
      :device ->
        DeviceHandler.handle(message_type, message, state)

      :call ->
        CallHandler.handle(message_type, message, state)

      :webrtc ->
        WebRTCHandler.handle(message_type, message, state)

      :media ->
        MediaHandler.handle(message_type, message, state)

      :unknown ->
        {:error, "unknown_message_type", "Unknown message type: #{message_type}"}
    end
  end

  # Categorize message type into handler category
  defp categorize_message(message_type) do
    cond do
      message_type in [
        MessageTypes.device_connect(),
        MessageTypes.device_disconnect(),
        MessageTypes.device_status()
      ] ->
        :device

      message_type in [
        MessageTypes.call_initiate(),
        MessageTypes.call_accept(),
        MessageTypes.call_reject(),
        MessageTypes.call_end()
      ] ->
        :call

      message_type in [
        MessageTypes.webrtc_offer(),
        MessageTypes.webrtc_answer(),
        MessageTypes.webrtc_ice_candidate()
      ] ->
        :webrtc

      message_type in [
        MessageTypes.media_toggle(),
        MessageTypes.call_escalate(),
        MessageTypes.call_downgrade()
      ] ->
        :media

      true ->
        :unknown
    end
  end
end
