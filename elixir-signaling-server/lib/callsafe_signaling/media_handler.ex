defmodule CallsafeSignaling.MediaHandler do
  @moduledoc """
  Handler for media control and escalation messages (protocol v2).
  Manages media:toggle, call:escalate, escalation:accept, escalation:reject
  and call:downgrade. The escalation timer itself lives in CallSession.
  """

  require Logger
  alias CallsafeSignaling.CallSession
  alias CallsafeSignaling.Protocol.MessageTypes

  @type message :: map()
  @type state :: map()
  @type handler_result :: {:ok, map() | nil, state} | {:error, String.t(), String.t()}

  @doc """
  Handle media control messages.
  Returns {:ok, response_message, new_state} or {:error, error_type, error_message}.
  """
  @spec handle(String.t(), message, state) :: handler_result
  def handle(message_type, message, state)

  # Handle media:toggle — purely informational relay to the peer
  def handle("media:toggle", message, state) do
    call_id = message["callAttemptId"]

    with {:ok, call_state} <- get_call(call_id),
         {:ok, sender_side} <- participant_side(call_state, state.device_id),
         :ok <- check_state(call_state, [:connected, :escalation_pending]) do
      payload = %{
        "callAttemptId" => call_id,
        "action" => message["action"],
        "timestamp" => System.system_time(:millisecond)
      }

      # Best effort: a momentarily disconnected peer just misses the toggle.
      relay_to_peer(call_state, sender_side, MessageTypes.media_toggle(), payload)

      Logger.debug("Media toggle for call #{call_id}: #{message["action"]}")
      {:ok, nil, state}
    else
      error -> media_error(error)
    end
  end

  # Handle call:escalate (voice -> video request; peer must consent)
  def handle("call:escalate", message, state) do
    call_id = message["callAttemptId"]
    media_capabilities = message["mediaCapabilities"]

    with {:ok, call_state} <- get_call(call_id),
         {:ok, sender_side} <- participant_side(call_state, state.device_id),
         :ok <- check_voice_call(call_state),
         requested_by <- side_role(sender_side),
         {:ok, _updated} <-
           CallSession.set_escalation_pending(call_id, requested_by, media_capabilities) do
      payload = %{
        "callAttemptId" => call_id,
        "requestedBy" => Atom.to_string(requested_by),
        "mediaCapabilities" => media_capabilities,
        "timestamp" => System.system_time(:millisecond)
      }

      case relay_to_peer(call_state, sender_side, MessageTypes.escalation_requested(), payload) do
        :ok ->
          Logger.info("Call escalation requested for #{call_id} by #{requested_by}")
          {:ok, nil, state}

        {:error, _} ->
          # Peer unreachable: revert immediately rather than leave the call hanging.
          CallSession.resolve_escalation(call_id, :rejected)
          {:error, "peer_not_connected", "The other participant is not reachable"}
      end
    else
      error -> media_error(error)
    end
  end

  # Handle escalation:accept (the peer consents; call becomes video)
  def handle("escalation:accept", message, state) do
    call_id = message["callAttemptId"]
    media_capabilities = message["mediaCapabilities"]

    with {:ok, call_state} <- get_call(call_id),
         {:ok, sender_side} <- participant_side(call_state, state.device_id),
         :ok <- check_escalation_responder(call_state, sender_side),
         {:ok, _updated} <- CallSession.resolve_escalation(call_id, :accepted) do
      payload = %{
        "callAttemptId" => call_id,
        "mediaCapabilities" => media_capabilities,
        "timestamp" => System.system_time(:millisecond)
      }

      # Audience: both participants (sender gets the response copy).
      relay_to_peer(call_state, sender_side, MessageTypes.escalation_accepted(), payload)

      Logger.info("Call escalation accepted for #{call_id}; call is now video")
      {:ok, Map.put(payload, "type", MessageTypes.escalation_accepted()), state}
    else
      error -> media_error(error)
    end
  end

  # Handle escalation:reject (the peer declines; call stays voice)
  def handle("escalation:reject", message, state) do
    call_id = message["callAttemptId"]

    with {:ok, call_state} <- get_call(call_id),
         {:ok, sender_side} <- participant_side(call_state, state.device_id),
         :ok <- check_escalation_responder(call_state, sender_side),
         {:ok, _updated} <- CallSession.resolve_escalation(call_id, :rejected) do
      payload = %{
        "callAttemptId" => call_id,
        "reason" => "declined",
        "timestamp" => System.system_time(:millisecond)
      }

      # Audience: the requester only.
      relay_to_peer(call_state, sender_side, MessageTypes.escalation_rejected(), payload)

      Logger.info("Call escalation rejected for #{call_id}")
      {:ok, nil, state}
    else
      error -> media_error(error)
    end
  end

  # Handle call:downgrade (video -> voice, unilateral)
  def handle("call:downgrade", message, state) do
    call_id = message["callAttemptId"]

    with {:ok, call_state} <- get_call(call_id),
         {:ok, sender_side} <- participant_side(call_state, state.device_id),
         requested_by <- side_role(sender_side),
         {:ok, _updated} <- CallSession.downgrade(call_id, requested_by) do
      payload = %{
        "callAttemptId" => call_id,
        "requestedBy" => Atom.to_string(requested_by),
        "timestamp" => System.system_time(:millisecond)
      }

      # Audience: both participants (sender gets the response copy).
      relay_to_peer(call_state, sender_side, MessageTypes.call_downgraded(), payload)

      Logger.info("Call downgraded to voice for #{call_id} by #{requested_by}")
      {:ok, Map.put(payload, "type", MessageTypes.call_downgraded()), state}
    else
      error -> media_error(error)
    end
  end

  # Fallback for unknown media message types
  def handle(message_type, _message, _state) do
    {:error, "unknown_message_type", "Unknown media message type: #{message_type}"}
  end

  # Private helper functions

  defp get_call(call_id), do: CallSession.get_state(call_id)

  defp media_error({:error, :not_found}),
    do: {:error, "call_not_found", "Call session not found"}

  defp media_error({:error, :not_participant}),
    do: {:error, "not_call_participant", "Device is not a participant of this call"}

  defp media_error({:error, :invalid_transition}),
    do: {:error, "invalid_state", "Message not valid in the call's current state"}

  defp media_error({:error, :invalid_state}),
    do: {:error, "invalid_state", "Message not valid in the call's current state"}

  defp media_error({:error, :not_voice_call}),
    do: {:error, "validation_error", "Only voice calls can be escalated"}

  defp media_error({:error, :not_responder}),
    do: {:error, "not_authorized", "Only the escalation's recipient may respond to it"}

  defp media_error({:error, error_type, error_message}),
    do: {:error, error_type, error_message}

  defp media_error({:error, reason}),
    do: {:error, "server_error", "Media operation failed: #{inspect(reason)}"}

  defp participant_side(call_state, device_id) do
    cond do
      device_id == call_state.caller_id -> {:ok, :caller}
      device_id == call_state.callee_id -> {:ok, :callee}
      true -> {:error, :not_participant}
    end
  end

  defp side_role(:caller), do: :customer
  defp side_role(:callee), do: :business

  defp check_state(%{state: s}, allowed) do
    if s in allowed, do: :ok, else: {:error, :invalid_state}
  end

  defp check_voice_call(%{state: :connected, call_type: :voice}), do: :ok
  defp check_voice_call(%{state: :connected}), do: {:error, :not_voice_call}
  defp check_voice_call(_call_state), do: {:error, :invalid_state}

  # Only the participant who did NOT request the escalation may accept/reject it.
  defp check_escalation_responder(%{state: :escalation_pending} = call_state, sender_side) do
    if side_role(sender_side) == call_state.escalation_requested_by do
      {:error, :not_responder}
    else
      :ok
    end
  end

  defp check_escalation_responder(_call_state, _sender_side), do: {:error, :invalid_state}

  defp relay_to_peer(call_state, sender_side, message_type, payload) do
    result =
      case sender_side do
        :caller -> CallSession.send_to_callee(call_state.call_id, message_type, payload)
        :callee -> CallSession.send_to_caller(call_state.call_id, message_type, payload)
      end

    case result do
      :ok -> :ok
      {:error, reason} -> {:error, reason}
    end
  end
end
