defmodule CallsafeSignaling.WebRTCHandler do
  @moduledoc """
  Handler for WebRTC signaling messages (protocol v2).
  Relays offer, answer, and ICE candidates between peers verbatim — the
  offer/answer payloads are SessionDescription objects ({type, sdp}) and are
  never reshaped or interpreted.

  Offerer rule (glare-free by construction): the initial offer comes from the
  caller while the call is connecting; renegotiation offers (in connected)
  come only from the participant whose escalation/downgrade was granted.
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
    call_id = message["callAttemptId"]

    with {:ok, call_state} <- get_call(call_id),
         {:ok, sender_side} <- participant_side(call_state, state.device_id),
         :ok <- check_may_offer(call_state, sender_side),
         :ok <-
           relay(call_state, sender_side, MessageTypes.webrtc_offer(), %{
             "callAttemptId" => call_id,
             "offer" => message["offer"]
           }) do
      Logger.debug("Relayed webrtc:offer for call #{call_id}")
      {:ok, nil, state}
    else
      error -> webrtc_error(error)
    end
  end

  # Handle webrtc:answer
  def handle("webrtc:answer", message, state) do
    call_id = message["callAttemptId"]

    with {:ok, call_state} <- get_call(call_id),
         {:ok, sender_side} <- participant_side(call_state, state.device_id),
         :ok <- check_may_answer(call_state, sender_side),
         :ok <-
           relay(call_state, sender_side, MessageTypes.webrtc_answer(), %{
             "callAttemptId" => call_id,
             "answer" => message["answer"]
           }) do
      # Relaying the first answer moves the call to connected; renegotiation
      # answers (already connected) don't transition.
      if call_state.state == :connecting do
        CallSession.set_connected(call_id)
      end

      Logger.debug("Relayed webrtc:answer for call #{call_id}")
      {:ok, nil, state}
    else
      error -> webrtc_error(error)
    end
  end

  # Handle webrtc:ice-candidate (bidirectional at any point while connecting/connected)
  def handle("webrtc:ice-candidate", message, state) do
    call_id = message["callAttemptId"]

    with {:ok, call_state} <- get_call(call_id),
         {:ok, sender_side} <- participant_side(call_state, state.device_id),
         :ok <- check_call_state(call_state),
         :ok <-
           relay(call_state, sender_side, MessageTypes.webrtc_ice_candidate(), %{
             "callAttemptId" => call_id,
             "candidate" => message["candidate"]
           }) do
      Logger.debug("Relayed ICE candidate for call #{call_id}")
      {:ok, nil, state}
    else
      error -> webrtc_error(error)
    end
  end

  # Fallback for unknown WebRTC message types
  def handle(message_type, _message, _state) do
    {:error, "unknown_message_type", "Unknown WebRTC message type: #{message_type}"}
  end

  # Private helper functions

  defp get_call(call_id), do: CallSession.get_state(call_id)

  defp webrtc_error({:error, :not_found}),
    do: {:error, "call_not_found", "Call session not found"}

  defp webrtc_error({:error, :not_participant}),
    do: {:error, "not_call_participant", "Device is not a participant of this call"}

  defp webrtc_error({:error, :invalid_state}),
    do: {:error, "invalid_state", "Message not valid in the call's current state"}

  defp webrtc_error({:error, :not_offerer}),
    do: {:error, "not_authorized", "Only the designated offerer may send an offer"}

  defp webrtc_error({:error, :not_answerer}),
    do: {:error, "not_authorized", "Only the offer's recipient may send an answer"}

  defp webrtc_error({:error, :peer_not_connected}),
    do: {:error, "peer_not_connected", "The other participant is not reachable"}

  defp webrtc_error({:error, error_type, error_message}),
    do: {:error, error_type, error_message}

  defp webrtc_error({:error, reason}),
    do: {:error, "server_error", "WebRTC relay failed: #{inspect(reason)}"}

  # Which side of the call is this device: :caller (customer) or :callee (business)?
  defp participant_side(call_state, device_id) do
    cond do
      device_id == call_state.caller_id -> {:ok, :caller}
      device_id == call_state.callee_id -> {:ok, :callee}
      true -> {:error, :not_participant}
    end
  end

  defp check_call_state(%{state: s}) when s in [:connecting, :connected], do: :ok
  defp check_call_state(_call_state), do: {:error, :invalid_state}

  # Initial negotiation: only the caller offers, while connecting.
  # Renegotiation: only the granted escalation/downgrade requester offers.
  defp check_may_offer(%{state: :connecting}, :caller), do: :ok
  defp check_may_offer(%{state: :connecting}, :callee), do: {:error, :not_offerer}

  defp check_may_offer(%{state: :connected, renegotiation_offerer: offerer}, sender_side) do
    if offerer != nil and side_role(sender_side) == offerer do
      :ok
    else
      {:error, :not_offerer}
    end
  end

  defp check_may_offer(_call_state, _sender_side), do: {:error, :invalid_state}

  # The answer comes from the opposite side of the current offerer.
  defp check_may_answer(%{state: :connecting}, :callee), do: :ok
  defp check_may_answer(%{state: :connecting}, :caller), do: {:error, :not_answerer}

  defp check_may_answer(%{state: :connected, renegotiation_offerer: offerer}, sender_side) do
    if offerer != nil and side_role(sender_side) != offerer do
      :ok
    else
      {:error, :not_answerer}
    end
  end

  defp check_may_answer(_call_state, _sender_side), do: {:error, :invalid_state}

  defp side_role(:caller), do: :customer
  defp side_role(:callee), do: :business

  # Relay a payload to the other participant, verbatim.
  defp relay(call_state, sender_side, message_type, payload) do
    result =
      case sender_side do
        :caller -> CallSession.send_to_callee(call_state.call_id, message_type, payload)
        :callee -> CallSession.send_to_caller(call_state.call_id, message_type, payload)
      end

    case result do
      :ok -> :ok
      {:error, :caller_not_connected} -> {:error, :peer_not_connected}
      {:error, :callee_not_connected} -> {:error, :peer_not_connected}
      {:error, reason} -> {:error, reason}
    end
  end
end
