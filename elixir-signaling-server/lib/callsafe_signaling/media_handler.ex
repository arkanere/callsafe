defmodule CallsafeSignaling.MediaHandler do
  @moduledoc """
  Handler for media control messages.
  Manages media:toggle, call:escalate, call:downgrade.
  Coordinates media state transitions and peer notifications.
  """

  require Logger
  alias CallsafeSignaling.CallSession
  alias CallsafeSignaling.Protocol.{MessageTypes, Enums}

  @type message :: map()
  @type state :: map()
  @type handler_result :: {:ok, map() | nil, state} | {:error, String.t(), String.t()}

  @doc """
  Handle media control messages.
  Returns {:ok, response_message, new_state} or {:error, error_type, error_message}.
  """
  @spec handle(String.t(), message, state) :: handler_result
  def handle(message_type, message, state)

  # Handle media:toggle
  def handle("media:toggle", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, action} <- extract_action(message),
         {:ok, success} <- extract_success(message),
         {:ok, call_state} <- CallSession.get_state(call_id),
         :ok <- validate_participant(call_state, state.device_id),
         :ok <- notify_peer_toggle(call_id, call_state, state.device_id, action, success) do
      Logger.debug("Media toggle for call #{call_id}: #{action} (#{success})")

      # No response needed - notification sent to peer
      {:ok, nil, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, :invalid_participant} ->
        {:error, "invalid_participant", "Device not part of this call"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "media_toggle_failed", Atom.to_string(reason)}
    end
  end

  # Handle call:escalate (voice -> video)
  def handle("call:escalate", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, requested_by} <- extract_requested_by(message),
         {:ok, media_capabilities} <- extract_media_capabilities(message),
         {:ok, call_state} <- CallSession.get_state(call_id),
         :ok <- validate_participant(call_state, state.device_id),
         :ok <- validate_voice_call(call_state),
         {:ok, _new_state} <- CallSession.set_escalation_pending(call_id),
         :ok <- update_media_capabilities(call_id, media_capabilities),
         :ok <- notify_peer_escalation_request(call_id, call_state, state.device_id, requested_by) do
      Logger.info("Call escalation requested for #{call_id} by #{requested_by}")

      response = %{
        "type" => "escalation:requested",
        "callAttemptId" => call_id,
        "requestedBy" => Atom.to_string(requested_by),
        "timestamp" => System.system_time(:millisecond)
      }

      {:ok, response, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, :invalid_participant} ->
        {:error, "invalid_participant", "Device not part of this call"}

      {:error, :not_voice_call} ->
        {:error, "invalid_call_type", "Can only escalate voice calls"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "call_escalate_failed", Atom.to_string(reason)}
    end
  end

  # Handle call:downgrade (video -> voice)
  def handle("call:downgrade", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, requested_by} <- extract_requested_by(message),
         {:ok, call_state} <- CallSession.get_state(call_id),
         :ok <- validate_participant(call_state, state.device_id),
         :ok <- validate_video_call(call_state),
         :ok <- notify_peer_downgrade(call_id, call_state, state.device_id, requested_by) do
      Logger.info("Call downgrade requested for #{call_id} by #{requested_by}")

      response = %{
        "type" => "downgrade:confirmed",
        "callAttemptId" => call_id,
        "requestedBy" => Atom.to_string(requested_by),
        "timestamp" => System.system_time(:millisecond)
      }

      {:ok, response, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, :invalid_participant} ->
        {:error, "invalid_participant", "Device not part of this call"}

      {:error, :not_video_call} ->
        {:error, "invalid_call_type", "Can only downgrade video calls"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "call_downgrade_failed", Atom.to_string(reason)}
    end
  end

  # Fallback for unknown media message types
  def handle(message_type, _message, _state) do
    {:error, "unknown_message_type", "Unknown media message type: #{message_type}"}
  end

  # Private helper functions

  defp extract_call_id(%{"callAttemptId" => call_id}) when is_binary(call_id), do: {:ok, call_id}
  defp extract_call_id(_), do: {:error, "missing_field", "callAttemptId is required"}

  defp extract_action(%{"action" => action}) when is_binary(action) do
    if Enums.valid_media_toggle_action?(action) do
      {:ok, Enums.to_media_toggle_action(action)}
    else
      {:error, "invalid_action", "Invalid media toggle action"}
    end
  end

  defp extract_action(_), do: {:error, "missing_field", "action is required"}

  defp extract_success(%{"success" => success}) when is_boolean(success), do: {:ok, success}
  defp extract_success(_), do: {:error, "missing_field", "success is required"}

  defp extract_requested_by(%{"requestedBy" => requested_by}) when is_binary(requested_by) do
    if Enums.valid_call_initiator?(requested_by) do
      {:ok, Enums.to_call_initiator(requested_by)}
    else
      {:error, "invalid_requested_by", "requestedBy must be 'customer' or 'business'"}
    end
  end

  defp extract_requested_by(_), do: {:error, "missing_field", "requestedBy is required"}

  defp extract_media_capabilities(%{"mediaCapabilities" => caps}) when is_map(caps) do
    {:ok, caps}
  end

  defp extract_media_capabilities(_),
    do: {:error, "missing_field", "mediaCapabilities is required"}

  # Validate that device is a participant in the call
  defp validate_participant(call_state, device_id) do
    if call_state.caller_id == device_id or call_state.callee_id == device_id do
      :ok
    else
      {:error, :invalid_participant}
    end
  end

  # Validate that the call is a voice call
  defp validate_voice_call(call_state) do
    if call_state.call_type == :voice do
      :ok
    else
      {:error, :not_voice_call}
    end
  end

  # Validate that the call is a video call
  defp validate_video_call(call_state) do
    if call_state.call_type == :video do
      :ok
    else
      {:error, :not_video_call}
    end
  end

  # Update media capabilities in call session
  defp update_media_capabilities(call_id, capabilities) do
    case CallSession.update_media_capabilities(call_id, capabilities) do
      {:ok, _state} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  # Notify peer about media toggle
  defp notify_peer_toggle(call_id, call_state, sender_device_id, action, success) do
    message = %{
      "type" => MessageTypes.media_toggle(),
      "callAttemptId" => call_id,
      "action" => Atom.to_string(action),
      "success" => success,
      "timestamp" => System.system_time(:millisecond)
    }

    # Send to the other peer
    result =
      cond do
        sender_device_id == call_state.caller_id ->
          CallSession.send_to_callee(call_id, message["type"], message)

        sender_device_id == call_state.callee_id ->
          CallSession.send_to_caller(call_id, message["type"], message)

        true ->
          {:error, :invalid_sender}
      end

    case result do
      :ok -> :ok
      {:error, :caller_not_connected} -> :ok
      {:error, :callee_not_connected} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  # Notify peer about escalation request
  defp notify_peer_escalation_request(call_id, call_state, sender_device_id, requested_by) do
    message = %{
      "type" => MessageTypes.call_escalate(),
      "callAttemptId" => call_id,
      "requestedBy" => Atom.to_string(requested_by),
      "timestamp" => System.system_time(:millisecond)
    }

    # Send to the other peer
    result =
      cond do
        sender_device_id == call_state.caller_id ->
          CallSession.send_to_callee(call_id, message["type"], message)

        sender_device_id == call_state.callee_id ->
          CallSession.send_to_caller(call_id, message["type"], message)

        true ->
          {:error, :invalid_sender}
      end

    case result do
      :ok -> :ok
      {:error, :caller_not_connected} -> {:error, :peer_not_connected}
      {:error, :callee_not_connected} -> {:error, :peer_not_connected}
      {:error, reason} -> {:error, reason}
    end
  end

  # Notify peer about downgrade
  defp notify_peer_downgrade(call_id, call_state, sender_device_id, requested_by) do
    message = %{
      "type" => MessageTypes.call_downgrade(),
      "callAttemptId" => call_id,
      "requestedBy" => Atom.to_string(requested_by),
      "timestamp" => System.system_time(:millisecond)
    }

    # Send to the other peer
    result =
      cond do
        sender_device_id == call_state.caller_id ->
          CallSession.send_to_callee(call_id, message["type"], message)

        sender_device_id == call_state.callee_id ->
          CallSession.send_to_caller(call_id, message["type"], message)

        true ->
          {:error, :invalid_sender}
      end

    case result do
      :ok -> :ok
      {:error, :caller_not_connected} -> :ok
      {:error, :callee_not_connected} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end
end
