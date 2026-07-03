defmodule CallsafeSignaling.MessageRouter do
  @moduledoc """
  Message dispatch router.
  Routes incoming WebSocket messages to appropriate handlers.

  Centralizes the protocol gates that apply to every message (all derived
  from protocol.json metadata): schema validation, direction (clients may
  only send c2s/both types), authentication (requiresAuth) and sender role
  (senderRole). Handlers only deal with call/domain semantics.
  """

  require Logger
  alias CallsafeSignaling.Protocol.{MessageTypes, Spec, Validator}
  alias CallsafeSignaling.{CallHandler, DeviceHandler, MediaHandler, WebRTCHandler}

  @type message :: map()
  @type state :: map()
  @type error_payload :: map()
  @type response :: {:ok, map() | nil, state} | {:error, error_payload, state}

  @doc """
  Route a message to its handler.
  Returns {:ok, response_message, new_state} or {:error, error_payload, state}
  where error_payload is the v2 error frame body (code, message, relatedType,
  callAttemptId?, timestamp) without the "type" field.
  """
  @spec route(message, state) :: response
  def route(message, state) do
    with {:ok, message_type} <- extract_type(message),
         :ok <- check_known_type(message_type),
         :ok <- check_direction(message_type),
         :ok <- validate_message(message_type, message),
         :ok <- check_authenticated(message_type, state),
         :ok <- check_sender_role(message_type, state),
         {:ok, response, new_state} <- dispatch(message_type, message, state) do
      {:ok, response, new_state}
    else
      {:error, code, error_message} ->
        Logger.warning("Message routing error: #{code} - #{error_message}")
        {:error, error_payload(code, error_message, message), state}
    end
  end

  @doc """
  Build a v2 error frame body (without "type") for a rejected message.
  """
  @spec error_payload(String.t(), String.t(), message | nil) :: error_payload
  def error_payload(code, error_message, original_message) do
    payload = %{
      "code" => code,
      "message" => error_message,
      "timestamp" => System.system_time(:millisecond)
    }

    payload =
      case original_message do
        %{"type" => type} when is_binary(type) -> Map.put(payload, "relatedType", type)
        _ -> payload
      end

    case original_message do
      %{"callAttemptId" => call_id} when is_binary(call_id) ->
        Map.put(payload, "callAttemptId", call_id)

      _ ->
        payload
    end
  end

  # Extract message type from message
  defp extract_type(%{"type" => type}) when is_binary(type) do
    {:ok, type}
  end

  defp extract_type(_) do
    {:error, "invalid_message", "Message must include a 'type' field"}
  end

  defp check_known_type(message_type) do
    if MessageTypes.valid?(message_type) do
      :ok
    else
      {:error, "unknown_message_type", "Unknown message type: #{message_type}"}
    end
  end

  # Clients may only send messages whose spec direction is c2s or both.
  defp check_direction(message_type) do
    case Spec.direction(message_type) do
      "s2c" ->
        {:error, "validation_error", "#{message_type} is a server-to-client message"}

      _ ->
        :ok
    end
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

  defp check_authenticated(message_type, state) do
    if Spec.requires_auth?(message_type) and not Map.get(state, :authenticated, false) do
      {:error, "not_authenticated", "device:connect must be the first message"}
    else
      :ok
    end
  end

  defp check_sender_role(message_type, state) do
    case Spec.sender_role(message_type) do
      nil ->
        :ok

      required_role ->
        if Atom.to_string(Map.get(state, :role) || :unknown) == required_role do
          :ok
        else
          {:error, "not_authorized",
           "#{message_type} may only be sent by #{required_role} devices"}
        end
    end
  end

  # Dispatch message to appropriate handler
  defp dispatch("ping", message, state) do
    pong = %{
      "type" => MessageTypes.pong(),
      "timestamp" => Map.get(message, "timestamp", System.system_time(:millisecond))
    }

    {:ok, pong, state}
  end

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
        MessageTypes.call_cancel(),
        MessageTypes.call_accept(),
        MessageTypes.call_reject(),
        MessageTypes.call_end(),
        MessageTypes.call_failed(),
        MessageTypes.call_reconnect()
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
        MessageTypes.escalation_accept(),
        MessageTypes.escalation_reject(),
        MessageTypes.call_downgrade()
      ] ->
        :media
    end
  end
end
