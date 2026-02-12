defmodule CallsafeSignaling.WebRTCHandler do
  @moduledoc """
  Handler for WebRTC signaling messages.
  Relays offer, answer, and ICE candidates between peers bidirectionally.
  Pure relay - no interpretation of SDP or ICE content.
  """

  require Logger
  alias CallsafeSignaling.CallSession
  alias CallsafeSignaling.Protocol.MessageTypes

  @type message :: map()
  @type state :: map()
  @type handler_result :: {:ok, map() | nil, state} | {:error, String.t(), String.t()}

  @doc """
  Handle WebRTC signaling messages.
  Returns {:ok, response_message, new_state} or {:error, error_type, error_message}.
  """
  @spec handle(String.t(), message, state) :: handler_result
  def handle(message_type, message, state)

  # Handle webrtc:offer
  def handle("webrtc:offer", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, sdp} <- extract_sdp(message),
         {:ok, call_state} <- CallSession.get_state(call_id),
         :ok <- validate_sender_is_caller(call_state, state.device_id),
         :ok <- relay_to_callee(call_id, "webrtc:offer", %{"sdp" => sdp}) do
      Logger.debug("Relayed webrtc:offer for call #{call_id}")

      # Transition to connecting state when offer is sent
      CallSession.set_connecting(call_id)

      # No response to sender - this is a pure relay
      {:ok, nil, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, :invalid_sender} ->
        {:error, "invalid_sender", "Only caller can send offer"}

      {:error, :callee_not_connected} ->
        {:error, "callee_not_connected", "Callee is not connected"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "webrtc_offer_failed", Atom.to_string(reason)}
    end
  end

  # Handle webrtc:answer
  def handle("webrtc:answer", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, sdp} <- extract_sdp(message),
         {:ok, call_state} <- CallSession.get_state(call_id),
         :ok <- validate_sender_is_callee(call_state, state.device_id),
         :ok <- relay_to_caller(call_id, "webrtc:answer", %{"sdp" => sdp}) do
      Logger.debug("Relayed webrtc:answer for call #{call_id}")

      # Transition to connected state when answer is sent
      CallSession.set_connected(call_id)

      # No response to sender - this is a pure relay
      {:ok, nil, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, :invalid_sender} ->
        {:error, "invalid_sender", "Only callee can send answer"}

      {:error, :caller_not_connected} ->
        {:error, "caller_not_connected", "Caller is not connected"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "webrtc_answer_failed", Atom.to_string(reason)}
    end
  end

  # Handle webrtc:ice-candidate
  def handle("webrtc:ice-candidate", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, candidate} <- extract_candidate(message),
         {:ok, call_state} <- CallSession.get_state(call_id),
         :ok <- relay_to_peer(call_id, call_state, state.device_id, candidate) do
      Logger.debug("Relayed ICE candidate for call #{call_id}")

      # No response to sender - this is a pure relay
      {:ok, nil, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, :peer_not_connected} ->
        {:error, "peer_not_connected", "Peer is not connected"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "webrtc_ice_failed", Atom.to_string(reason)}
    end
  end

  # Fallback for unknown WebRTC message types
  def handle(message_type, _message, _state) do
    {:error, "unknown_message_type", "Unknown WebRTC message type: #{message_type}"}
  end

  # Private helper functions

  defp extract_call_id(%{"callAttemptId" => call_id}) when is_binary(call_id), do: {:ok, call_id}
  defp extract_call_id(_), do: {:error, "missing_field", "callAttemptId is required"}

  defp extract_sdp(%{"sdp" => sdp}) when is_binary(sdp), do: {:ok, sdp}
  defp extract_sdp(_), do: {:error, "missing_field", "sdp is required"}

  defp extract_candidate(%{"candidate" => candidate}) when is_map(candidate) do
    {:ok, candidate}
  end

  defp extract_candidate(_), do: {:error, "missing_field", "candidate is required"}

  # Validate that sender is the caller
  defp validate_sender_is_caller(call_state, device_id) do
    if call_state.caller_id == device_id do
      :ok
    else
      {:error, :invalid_sender}
    end
  end

  # Validate that sender is the callee
  defp validate_sender_is_callee(call_state, device_id) do
    if call_state.callee_id == device_id do
      :ok
    else
      {:error, :invalid_sender}
    end
  end

  # Relay offer to callee
  defp relay_to_callee(call_id, message_type, payload) do
    case CallSession.send_to_callee(call_id, message_type, Map.put(payload, "callAttemptId", call_id)) do
      :ok -> :ok
      {:error, :callee_not_connected} -> {:error, :callee_not_connected}
      {:error, reason} -> {:error, reason}
    end
  end

  # Relay answer to caller
  defp relay_to_caller(call_id, message_type, payload) do
    case CallSession.send_to_caller(call_id, message_type, Map.put(payload, "callAttemptId", call_id)) do
      :ok -> :ok
      {:error, :caller_not_connected} -> {:error, :caller_not_connected}
      {:error, reason} -> {:error, reason}
    end
  end

  # Relay ICE candidate to peer (bidirectional)
  defp relay_to_peer(call_id, call_state, sender_device_id, candidate) do
    payload = %{
      "callAttemptId" => call_id,
      "candidate" => candidate
    }

    # Determine which peer to relay to
    result =
      cond do
        sender_device_id == call_state.caller_id ->
          # Caller sending to callee
          CallSession.send_to_callee(call_id, MessageTypes.webrtc_ice_candidate(), payload)

        sender_device_id == call_state.callee_id ->
          # Callee sending to caller
          CallSession.send_to_caller(call_id, MessageTypes.webrtc_ice_candidate(), payload)

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
end
