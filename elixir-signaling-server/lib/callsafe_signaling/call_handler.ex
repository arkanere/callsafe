defmodule CallsafeSignaling.CallHandler do
  @moduledoc """
  Handler for call lifecycle messages (protocol v2).
  Manages call:initiate, call:cancel, call:accept, call:reject, call:end,
  call:failed and call:reconnect. Coordinates CallSession processes and
  device notifications.

  Authentication, schema validation and sender-role gating happen in
  MessageRouter before messages reach this module.
  """

  require Logger

  alias CallsafeSignaling.{
    CallSession,
    CallSessionSupervisor,
    DecisionCapture,
    DeviceRegistry,
    FCM.PushService,
    Stats
  }

  alias CallsafeSignaling.Protocol.{Enums, MessageTypes}

  @type message :: map()
  @type state :: map()
  @type handler_result :: {:ok, map() | nil, state} | {:error, String.t(), String.t()}

  @doc """
  Handle call-related messages.
  Returns {:ok, response_message, new_state} or {:error, error_type, error_message}.
  """
  @spec handle(String.t(), message, state) :: handler_result
  def handle(message_type, message, state)

  # Handle call:initiate (customer only, enforced by router)
  def handle("call:initiate", message, state) do
    call_id = message["callAttemptId"]
    handle_name = message["handle"]
    call_type = Enums.to_call_type(message["callType"])
    media_capabilities = message["mediaCapabilities"]
    caller_id = state.device_id
    business_id = state.business_id

    with :ok <- check_handle_scope(handle_name, business_id),
         {:ok, _pid} <-
           create_call_session(call_id, business_id, caller_id, call_type, media_capabilities),
         {:ok, _} <- CallSession.set_caller_pid(call_id, state.connection_pid) do
      Stats.increment_calls_initiated()

      case find_available_devices(business_id, caller_id) do
        [] ->
          # Terminal immediately: nobody to ring.
          CallSession.set_unavailable(call_id)

          response = %{
            "type" => MessageTypes.call_unavailable(),
            "callAttemptId" => call_id,
            "reason" => "no_devices_available",
            "timestamp" => System.system_time(:millisecond)
          }

          Logger.info("Call #{call_id}: no available devices for business #{business_id}")
          {:ok, response, state}

        devices ->
          notify_devices(devices, call_id, caller_id, call_type, media_capabilities)
          CallSession.add_notified_devices(call_id, Enum.map(devices, & &1.device_id))
          CallSession.set_ringing(call_id)

          response = %{
            "type" => MessageTypes.call_initiated(),
            "callAttemptId" => call_id,
            "devicesNotified" => length(devices),
            "timestamp" => System.system_time(:millisecond)
          }

          Logger.info(
            "Call initiated: #{call_id} (#{call_type}) - notified #{length(devices)} devices"
          )

          {:ok, response, state}
      end
    else
      {:error, {:already_started, _pid}} ->
        {:error, "duplicate_call_id", "callAttemptId was already used"}

      {:error, :already_started} ->
        {:error, "duplicate_call_id", "callAttemptId was already used"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} ->
        {:error, "server_error", "Failed to initiate call: #{inspect(reason)}"}
    end
  end

  # Handle call:cancel (customer abandons before acceptance)
  def handle("call:cancel", message, state) do
    call_id = message["callAttemptId"]

    with {:ok, call_state} <- get_call(call_id),
         :ok <- check_is_caller(call_state, state.device_id),
         {:ok, updated_state} <- CallSession.set_cancelled(call_id) do
      payload = %{
        "type" => MessageTypes.call_cancelled(),
        "callAttemptId" => call_id,
        "reason" => "cancelled_by_caller",
        "timestamp" => System.system_time(:millisecond)
      }

      notify_ringing_devices(updated_state, payload)

      Logger.info("Call cancelled by caller: #{call_id}")
      {:ok, payload, state}
    else
      error -> call_error(error)
    end
  end

  # Handle call:accept (business only, enforced by router)
  def handle("call:accept", message, state) do
    call_id = message["callAttemptId"]
    device_id = state.device_id
    media_capabilities = message["mediaCapabilities"]

    with {:ok, call_state} <- get_call(call_id),
         :ok <- check_same_business(call_state, state.business_id),
         {:ok, updated_state} <-
           CallSession.set_connecting(
             call_id,
             device_id,
             state.connection_pid,
             media_capabilities
           ) do
      Stats.increment_calls_accepted()

      payload =
        %{
          "type" => MessageTypes.call_accepted(),
          "callAttemptId" => call_id,
          "acceptingDeviceId" => device_id,
          "timestamp" => System.system_time(:millisecond)
        }
        |> put_optional("mediaCapabilities", media_capabilities)

      # Audience: caller AND accepting device (acceptor gets the response copy).
      notify_caller(updated_state, payload)
      cancel_other_devices(updated_state, device_id)

      Logger.info("Call accepted: #{call_id} by device: #{device_id}")
      {:ok, payload, state}
    else
      error -> call_error(error)
    end
  end

  # Handle call:reject (business only, enforced by router)
  def handle("call:reject", message, state) do
    call_id = message["callAttemptId"]
    device_id = state.device_id

    with {:ok, call_state} <- get_call(call_id),
         :ok <- check_same_business(call_state, state.business_id) do
      case CallSession.record_reject(call_id, device_id) do
        {:ok, :all_rejected, updated_state} ->
          Stats.increment_calls_rejected()

          notify_caller(updated_state, %{
            "type" => MessageTypes.call_unavailable(),
            "callAttemptId" => call_id,
            "reason" => "all_devices_rejected",
            "timestamp" => System.system_time(:millisecond)
          })

          Logger.info("Call rejected: #{call_id} by #{device_id}, all devices rejected")
          # No per-reject message is sent to anyone (spec).
          {:ok, nil, state}

        {:ok, :pending, _updated_state} ->
          Logger.info("Call rejected: #{call_id} by #{device_id}, still ringing elsewhere")
          {:ok, nil, state}

        {:error, :not_notified} ->
          {:error, "not_call_participant", "Device was not ringing for this call"}

        error ->
          call_error(error)
      end
    else
      error -> call_error(error)
    end
  end

  # Handle call:end (either participant hangs up an accepted call)
  def handle("call:end", message, state) do
    call_id = message["callAttemptId"]

    with {:ok, call_state} <- get_call(call_id),
         :ok <- check_participant(call_state, state.device_id),
         ended_by <- state.role,
         end_reason <- end_reason_for_role(ended_by),
         {:ok, _updated_state} <- CallSession.set_ended(call_id, end_reason, ended_by) do
      duration =
        if call_state.connected_at do
          System.system_time(:millisecond) - call_state.connected_at
        else
          0
        end

      payload = %{
        "type" => MessageTypes.call_ended(),
        "callAttemptId" => call_id,
        "duration" => duration,
        "reason" => Atom.to_string(end_reason),
        "endedBy" => Atom.to_string(ended_by),
        "timestamp" => System.system_time(:millisecond)
      }

      notify_peer(call_state, state.device_id, payload)
      Stats.increment_calls_ended()

      Logger.info("Call ended: #{call_id} by #{ended_by}, duration: #{duration}ms")
      {:ok, payload, state}
    else
      error -> call_error(error)
    end
  end

  # Handle call:failed (participant reports an unrecoverable local failure)
  def handle("call:failed", message, state) do
    call_id = message["callAttemptId"]
    reason = message["reason"]

    with {:ok, call_state} <- get_call(call_id),
         :ok <- check_participant(call_state, state.device_id),
         {:ok, _updated_state} <-
           CallSession.set_failed(call_id, Enums.to_call_fail_reason(reason)) do
      payload = %{
        "type" => MessageTypes.call_failed(),
        "callAttemptId" => call_id,
        "reason" => reason,
        "timestamp" => System.system_time(:millisecond)
      }

      # Audience: both participants (sender gets the response copy).
      notify_peer(call_state, state.device_id, payload)

      Logger.warning("Call failed: #{call_id} (#{reason}) reported by #{state.device_id}")
      {:ok, payload, state}
    else
      error -> call_error(error)
    end
  end

  # Handle call:reconnect (participant re-attaches after socket loss)
  def handle("call:reconnect", message, state) do
    call_id = message["callAttemptId"]

    case CallSession.reconnect(call_id, state.device_id, state.connection_pid) do
      {:ok, updated_state} ->
        response = %{
          "type" => MessageTypes.call_reconnected(),
          "callAttemptId" => call_id,
          "callState" => Atom.to_string(updated_state.state),
          "callType" => Atom.to_string(updated_state.call_type),
          "timestamp" => System.system_time(:millisecond)
        }

        Logger.info("Call reconnected: #{call_id} by #{state.device_id}")
        {:ok, response, state}

      {:error, :not_participant} ->
        {:error, "not_call_participant", "Device is not a participant of this call"}

      error ->
        call_error(error)
    end
  end

  # Fallback for unknown call message types
  def handle(message_type, _message, _state) do
    {:error, "unknown_message_type", "Unknown call message type: #{message_type}"}
  end

  @doc """
  Re-deliver call:incoming for every ringing call of a business to a device
  that just connected (FCM wake flow: push -> connect -> re-delivered ring).
  """
  @spec redeliver_ringing_calls(String.t(), String.t(), pid()) :: :ok
  def redeliver_ringing_calls(business_id, device_id, connection_pid) do
    CallSession.list_for_business(business_id)
    |> Enum.filter(&(&1.state == :ringing))
    |> Enum.each(fn call_state ->
      message =
        incoming_payload(
          call_state.call_id,
          call_state.caller_id,
          call_state.call_type,
          call_state.media_capabilities
        )

      send(connection_pid, {:send_message, message["type"], message})
      CallSession.add_notified_devices(call_state.call_id, [device_id])

      Logger.info("Re-delivered call:incoming for #{call_state.call_id} to #{device_id}")
    end)
  end

  # Private helper functions

  # Common error normalization for CallSession results
  defp call_error({:error, :not_found}),
    do: {:error, "call_not_found", "Call session not found"}

  defp call_error({:error, :invalid_transition}),
    do: {:error, "invalid_state", "Message not valid in the call's current state"}

  defp call_error({:error, error_type, error_message}), do: {:error, error_type, error_message}

  defp call_error({:error, reason}),
    do: {:error, "server_error", "Call operation failed: #{inspect(reason)}"}

  defp get_call(call_id) do
    CallSession.get_state(call_id)
  end

  # The handle in call:initiate must match the token's business scope.
  defp check_handle_scope(handle_name, business_id) do
    if handle_name == business_id do
      :ok
    else
      {:error, "not_authorized", "handle does not match the token's business scope"}
    end
  end

  defp check_is_caller(call_state, device_id) do
    if call_state.caller_id == device_id do
      :ok
    else
      {:error, "not_call_participant", "Only the caller may cancel a call"}
    end
  end

  defp check_same_business(call_state, business_id) do
    if call_state.business_id == business_id do
      :ok
    else
      {:error, "not_authorized", "Device does not belong to this call's business"}
    end
  end

  defp check_participant(call_state, device_id) do
    if device_id in [call_state.caller_id, call_state.callee_id] do
      :ok
    else
      {:error, "not_call_participant", "Device is not a participant of this call"}
    end
  end

  defp end_reason_for_role(:customer), do: :customer_hangup
  defp end_reason_for_role(:business), do: :business_hangup
  defp end_reason_for_role(_), do: :normal

  defp put_optional(map, _key, nil), do: map
  defp put_optional(map, key, value), do: Map.put(map, key, value)

  # Find available business-role devices to ring (excluding the caller and
  # devices that are unreachable both via WebSocket and FCM).
  defp find_available_devices(business_id, caller_id) do
    all_devices = DeviceRegistry.list_by_business(business_id)

    devices =
      Enum.filter(all_devices, fn device ->
        device.device_id != caller_id and
          device.role == :business and
          device.status == :available and
          (is_pid(device.connection_pid) or is_binary(device.push_token))
      end)

    DecisionCapture.emit(
      :device_selected,
      "call:initiate",
      nil,
      %{
        business_id: business_id,
        caller_id: caller_id,
        total_devices: length(all_devices),
        available_devices: Enum.map(devices, & &1.device_id),
        device_count: length(devices)
      },
      %{selection_criteria: "business_role_available_and_reachable"}
    )

    devices
  end

  # Create a new call session
  defp create_call_session(call_id, business_id, caller_id, call_type, media_capabilities) do
    opts = %{
      media_capabilities: media_capabilities,
      metadata: %{}
    }

    CallSessionSupervisor.start_call(call_id, business_id, caller_id, call_type, opts)
  end

  defp incoming_payload(call_id, caller_id, call_type, media_capabilities) do
    %{
      "type" => MessageTypes.call_incoming(),
      "callAttemptId" => call_id,
      "sourceId" => caller_id,
      "callType" => Atom.to_string(call_type),
      "mediaCapabilities" => media_capabilities,
      "timestamp" => System.system_time(:millisecond)
    }
  end

  # Notify devices about incoming call (via WebSocket PID or FCM)
  defp notify_devices(devices, call_id, caller_id, call_type, media_capabilities) do
    message = incoming_payload(call_id, caller_id, call_type, media_capabilities)

    Enum.each(devices, fn device ->
      routing_method = if device.connection_pid, do: "websocket", else: "fcm"

      DecisionCapture.emit_message_routed(
        call_id,
        MessageTypes.call_incoming(),
        "server",
        device.device_id,
        %{routing_method: routing_method, device_type: device.device_type}
      )

      case device.connection_pid do
        nil ->
          send_fcm_notification(device, call_id, caller_id, call_type)

        pid when is_pid(pid) ->
          send(pid, {:send_message, message["type"], message})
          Logger.debug("Sent call:incoming to device #{device.device_id} via WebSocket")
      end
    end)

    :ok
  end

  defp send_fcm_notification(device, call_id, caller_id, call_type) do
    case device.push_token do
      nil ->
        Logger.warning("Device #{device.device_id} has no push token, cannot send FCM")

      token ->
        case PushService.notify_incoming_call(token, call_id, caller_id, call_type) do
          {:ok, _response} ->
            Logger.debug("Sent FCM notification to device #{device.device_id}")

          {:error, reason} ->
            Logger.error("Failed to send FCM to device #{device.device_id}: #{inspect(reason)}")
        end
    end
  end

  # Cancel call notification on every other still-ringing device
  defp cancel_other_devices(call_state, accepting_device_id) do
    payload = %{
      "type" => MessageTypes.call_cancelled(),
      "callAttemptId" => call_state.call_id,
      "reason" => "answered_elsewhere",
      "timestamp" => System.system_time(:millisecond)
    }

    call_state.notified_device_ids
    |> MapSet.difference(call_state.rejected_device_ids)
    |> MapSet.delete(accepting_device_id)
    |> Enum.each(fn device_id ->
      case DeviceRegistry.lookup_by_device(device_id) do
        {:ok, %{connection_pid: pid}} when is_pid(pid) ->
          send(pid, {:send_message, payload["type"], payload})

        _ ->
          :ok
      end
    end)

    :ok
  end

  # Send a payload to every still-ringing notified device
  defp notify_ringing_devices(call_state, payload) do
    call_state.notified_device_ids
    |> MapSet.difference(call_state.rejected_device_ids)
    |> Enum.each(fn device_id ->
      case DeviceRegistry.lookup_by_device(device_id) do
        {:ok, %{connection_pid: pid}} when is_pid(pid) ->
          send(pid, {:send_message, payload["type"], payload})

        _ ->
          :ok
      end
    end)

    :ok
  end

  defp notify_caller(call_state, payload) do
    if call_state.caller_pid do
      DecisionCapture.emit_message_routed(
        call_state.call_id,
        payload["type"],
        "server",
        "caller",
        %{routing_method: "websocket"}
      )

      send(call_state.caller_pid, {:send_message, payload["type"], payload})
    end

    :ok
  end

  # Notify the other participant (relative to the sending device)
  defp notify_peer(call_state, sender_device_id, payload) do
    peer_pid =
      cond do
        sender_device_id == call_state.caller_id -> call_state.callee_pid
        sender_device_id == call_state.callee_id -> call_state.caller_pid
        true -> nil
      end

    if peer_pid do
      send(peer_pid, {:send_message, payload["type"], payload})
    end

    :ok
  end
end
