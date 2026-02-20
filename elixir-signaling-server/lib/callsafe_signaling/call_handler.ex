defmodule CallsafeSignaling.CallHandler do
  @moduledoc """
  Handler for call lifecycle messages.
  Manages call:initiate, call:accept, call:reject, call:end.
  Coordinates CallSession processes and device notifications.
  """

  require Logger

  alias CallsafeSignaling.{
    DeviceRegistry,
    CallSession,
    CallSessionSupervisor,
    FCM.PushService,
    Stats,
    DecisionCapture
  }

  alias CallsafeSignaling.Protocol.{MessageTypes, Enums}

  @type message :: map()
  @type state :: map()
  @type handler_result :: {:ok, map() | nil, state} | {:error, String.t(), String.t()}

  @doc """
  Handle call-related messages.
  Returns {:ok, response_message, new_state} or {:error, error_type, error_message}.
  """
  @spec handle(String.t(), message, state) :: handler_result
  def handle(message_type, message, state)

  # Handle call:initiate
  def handle("call:initiate", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, _business_handle} <- extract_handle(message),
         {:ok, call_type} <- extract_call_type(message),
         {:ok, media_capabilities} <- extract_media_capabilities(message),
         caller_id <- Map.get(state, :device_id),
         business_id <- Map.get(state, :business_id),
         {:ok, devices} <- find_available_devices(business_id, caller_id),
         {:ok, _session_pid} <-
           create_call_session(call_id, business_id, caller_id, call_type, media_capabilities),
         :ok <- set_caller_connection(call_id, state.connection_pid),
         :ok <- notify_devices(devices, call_id, caller_id, call_type) do
      # Track call initiated
      Stats.increment_calls_initiated()

      response = %{
        "type" => MessageTypes.call_incoming(),
        "callAttemptId" => call_id,
        "sourceId" => caller_id,
        "callType" => Atom.to_string(call_type),
        "timestamp" => System.system_time(:millisecond),
        "devicesNotified" => length(devices)
      }

      Logger.info("Call initiated: #{call_id} (#{call_type}) - notified #{length(devices)} devices")
      {:ok, response, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :no_available_devices} ->
        {:error, "no_devices", "No available devices found for business"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "call_initiate_failed", Atom.to_string(reason)}
    end
  end

  # Handle call:accept
  def handle("call:accept", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, _device_type} <- extract_device_type(message),
         {:ok, device_id} <- extract_device_id(message),
         state_device_id <- Map.get(state, :device_id),
         true <- state_device_id == device_id,
         {:ok, call_state} <- CallSession.get_state(call_id),
         :ok <- validate_accepting_device(call_state, device_id),
         {:ok, _new_state} <- CallSession.set_ringing(call_id, device_id, state.connection_pid),
         :ok <- cancel_other_devices(call_id, call_state, device_id),
         :ok <- notify_caller_accepted(call_id, device_id, call_state.caller_pid) do
      # Track call accepted
      Stats.increment_calls_accepted()

      response = %{
        "type" => MessageTypes.call_accepted(),
        "callAttemptId" => call_id,
        "acceptingDevice" => device_id,
        "timestamp" => System.system_time(:millisecond)
      }

      Logger.info("Call accepted: #{call_id} by device: #{device_id}")
      {:ok, response, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, :invalid_device} ->
        {:error, "invalid_device", "Device not authorized for this call"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "call_accept_failed", Atom.to_string(reason)}
    end
  end

  # Handle call:reject
  def handle("call:reject", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, _device_type} <- extract_device_type(message),
         device_id <- Map.get(state, :device_id),
         {:ok, call_state} <- CallSession.get_state(call_id),
         {:ok, remaining_devices} <- get_remaining_devices(call_state, device_id) do
      # Check if there are other devices that can accept
      case remaining_devices do
        [] ->
          # No more devices, mark call as unavailable
          CallSession.set_unavailable(call_id)
          notify_caller_unavailable(call_id, call_state.caller_pid)
          Stats.increment_calls_rejected()
          Logger.info("Call rejected: #{call_id} by #{device_id}, no more devices available")

        _devices ->
          # Other devices still available
          Logger.info("Call rejected: #{call_id} by #{device_id}, #{length(remaining_devices)} devices remaining")
      end

      response = %{
        "type" => MessageTypes.call_cancelled(),
        "callAttemptId" => call_id,
        "reason" => "rejected",
        "timestamp" => System.system_time(:millisecond)
      }

      {:ok, response, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "call_reject_failed", Atom.to_string(reason)}
    end
  end

  # Handle call:end
  def handle("call:end", message, state) do
    with true <- Map.get(state, :authenticated, false),
         {:ok, call_id} <- extract_call_id(message),
         {:ok, initiator} <- extract_initiator(message),
         {:ok, call_state} <- CallSession.get_state(call_id) do
      # Determine end reason based on initiator
      end_reason =
        case initiator do
          :customer -> :customer_hangup
          :business -> :business_hangup
          _ -> :normal
        end

      # Transition to ended state
      {:ok, _new_state} = CallSession.set_ended(call_id, end_reason)

      # Calculate duration if call was connected
      duration =
        if call_state.connected_at do
          System.system_time(:millisecond) - call_state.connected_at
        else
          0
        end

      # Notify other peer
      notify_peer_ended(call_id, call_state, state.device_id, duration)

      # Track call ended
      Stats.increment_calls_ended()

      response = %{
        "type" => MessageTypes.call_ended(),
        "callAttemptId" => call_id,
        "duration" => duration,
        "timestamp" => System.system_time(:millisecond)
      }

      Logger.info("Call ended: #{call_id} by #{initiator}, duration: #{duration}ms")
      {:ok, response, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "call_not_found", "Call session not found"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "call_end_failed", Atom.to_string(reason)}
    end
  end

  # Fallback for unknown call message types
  def handle(message_type, _message, _state) do
    {:error, "unknown_message_type", "Unknown call message type: #{message_type}"}
  end

  # Private helper functions

  defp extract_call_id(%{"callAttemptId" => call_id}) when is_binary(call_id), do: {:ok, call_id}
  defp extract_call_id(_), do: {:error, "missing_field", "callAttemptId is required"}

  defp extract_handle(%{"handle" => handle}) when is_binary(handle), do: {:ok, handle}
  defp extract_handle(_), do: {:error, "missing_field", "handle is required"}

  defp extract_call_type(%{"callType" => type}) when is_binary(type) do
    if Enums.valid_call_type?(type) do
      {:ok, Enums.to_call_type(type)}
    else
      {:error, "invalid_call_type", "callType must be 'voice' or 'video'"}
    end
  end

  # Default to voice for backward-compatible clients that omit callType
  defp extract_call_type(_), do: {:ok, :voice}

  defp extract_media_capabilities(%{"mediaCapabilities" => caps}) when is_map(caps) do
    {:ok, caps}
  end

  # Default to audio-only for backward-compatible clients that omit mediaCapabilities
  defp extract_media_capabilities(_),
    do: {:ok, %{"audio" => true, "video" => false}}

  defp extract_device_type(%{"deviceType" => type}) when is_binary(type) do
    if Enums.valid_device_type?(type) do
      {:ok, Enums.to_device_type(type)}
    else
      {:error, "invalid_device_type", "deviceType must be 'web' or 'mobile'"}
    end
  end

  defp extract_device_type(_), do: {:error, "missing_field", "deviceType is required"}

  defp extract_device_id(%{"deviceId" => device_id}) when is_binary(device_id) do
    {:ok, device_id}
  end

  defp extract_device_id(_), do: {:error, "missing_field", "deviceId is required"}

  defp extract_initiator(%{"initiator" => initiator}) when is_binary(initiator) do
    if Enums.valid_call_initiator?(initiator) do
      {:ok, Enums.to_call_initiator(initiator)}
    else
      {:error, "invalid_initiator", "initiator must be 'customer' or 'business'"}
    end
  end

  defp extract_initiator(_), do: {:error, "missing_field", "initiator is required"}

  # Find available devices for a business, excluding the caller
  defp find_available_devices(business_id, caller_id) do
    all_devices = DeviceRegistry.list_by_business(business_id)

    devices =
      all_devices
      |> Enum.filter(fn device ->
        device.device_id != caller_id and device.status == :available
      end)

    # Capture device selection decision (even if none found)
    selected_device_ids = Enum.map(devices, & &1.device_id)

    DecisionCapture.emit(
      :device_selected,
      "call:initiate",
      nil,
      %{
        business_id: business_id,
        caller_id: caller_id,
        total_devices: length(all_devices),
        available_devices: selected_device_ids,
        device_count: length(devices)
      },
      %{selection_criteria: "available_and_not_caller"}
    )

    case devices do
      [] -> {:error, :no_available_devices}
      devices -> {:ok, devices}
    end
  end

  # Create a new call session
  defp create_call_session(call_id, business_id, caller_id, call_type, media_capabilities) do
    opts = %{
      media_capabilities: media_capabilities,
      metadata: %{}
    }

    CallSessionSupervisor.start_call(call_id, business_id, caller_id, call_type, opts)
  end

  # Set caller connection PID in call session
  defp set_caller_connection(call_id, connection_pid) do
    case CallSession.set_caller_pid(call_id, connection_pid) do
      {:ok, _state} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  # Notify devices about incoming call (via WebSocket PID or FCM)
  defp notify_devices(devices, call_id, caller_id, call_type) do
    Enum.each(devices, fn device ->
      notify_device(device, call_id, caller_id, call_type)
    end)

    :ok
  end

  defp notify_device(device, call_id, caller_id, call_type) do
    message = %{
      "type" => MessageTypes.call_incoming(),
      "callAttemptId" => call_id,
      "sourceId" => caller_id,
      "callType" => Atom.to_string(call_type),
      "timestamp" => System.system_time(:millisecond)
    }

    # Capture message routing decision
    routing_method =
      if device.connection_pid do
        "websocket"
      else
        "fcm"
      end

    DecisionCapture.emit_message_routed(
      call_id,
      MessageTypes.call_incoming(),
      "server",
      device.device_id,
      %{
        routing_method: routing_method,
        device_type: device.device_type
      }
    )

    # Try to send via WebSocket first
    case device.connection_pid do
      nil ->
        # Device offline, send FCM push notification
        send_fcm_notification(device, call_id, caller_id, call_type)

      pid when is_pid(pid) ->
        # Device online, send WebSocket message
        send(pid, {:send_message, message["type"], message})
        Logger.debug("Sent call:incoming to device #{device.device_id} via WebSocket")
    end
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

  # Validate that the accepting device is part of the business
  defp validate_accepting_device(call_state, device_id) do
    case DeviceRegistry.lookup_by_device(device_id) do
      {:ok, device} ->
        if device.business_id == call_state.business_id do
          :ok
        else
          {:error, :invalid_device}
        end

      {:error, :not_found} ->
        {:error, :invalid_device}
    end
  end

  # Cancel call notifications to other devices
  defp cancel_other_devices(call_id, call_state, accepting_device_id) do
    # Get all devices for the business except the accepting one
    DeviceRegistry.list_by_business(call_state.business_id)
    |> Enum.reject(fn device ->
      device.device_id == accepting_device_id or device.device_id == call_state.caller_id
    end)
    |> Enum.each(fn device ->
      send_cancel_notification(device, call_id)
    end)

    :ok
  end

  defp send_cancel_notification(device, call_id) do
    message = %{
      "type" => MessageTypes.call_cancelled(),
      "callAttemptId" => call_id,
      "reason" => "accepted_by_another_device",
      "timestamp" => System.system_time(:millisecond)
    }

    case device.connection_pid do
      nil -> :ok
      pid when is_pid(pid) -> send(pid, {:send_message, message["type"], message})
    end
  end

  # Notify caller that call was accepted
  defp notify_caller_accepted(call_id, accepting_device_id, caller_pid) do
    if caller_pid do
      message = %{
        "type" => MessageTypes.call_accepted(),
        "callAttemptId" => call_id,
        "acceptingDevice" => accepting_device_id,
        "timestamp" => System.system_time(:millisecond)
      }

      # Capture message routing decision
      DecisionCapture.emit_message_routed(
        call_id,
        MessageTypes.call_accepted(),
        accepting_device_id,
        "caller",
        %{routing_method: "websocket"}
      )

      send(caller_pid, {:send_message, message["type"], message})
    end

    :ok
  end

  # Notify caller that no devices are available
  defp notify_caller_unavailable(call_id, caller_pid) do
    if caller_pid do
      message = %{
        "type" => MessageTypes.call_unavailable(),
        "callAttemptId" => call_id,
        "timestamp" => System.system_time(:millisecond)
      }

      send(caller_pid, {:send_message, message["type"], message})
    end

    :ok
  end

  # Get remaining devices that can accept the call
  defp get_remaining_devices(call_state, rejecting_device_id) do
    devices =
      DeviceRegistry.list_by_business(call_state.business_id)
      |> Enum.filter(fn device ->
        device.device_id != rejecting_device_id and
          device.device_id != call_state.caller_id and
          device.status == :available
      end)

    {:ok, devices}
  end

  # Notify the other peer that the call ended
  defp notify_peer_ended(call_id, call_state, ending_device_id, duration) do
    message = %{
      "type" => MessageTypes.call_ended(),
      "callAttemptId" => call_id,
      "duration" => duration,
      "timestamp" => System.system_time(:millisecond)
    }

    # Determine which peer to notify
    peer_pid =
      cond do
        ending_device_id == call_state.caller_id -> call_state.callee_pid
        ending_device_id == call_state.callee_id -> call_state.caller_pid
        true -> nil
      end

    if peer_pid do
      send(peer_pid, {:send_message, message["type"], message})
    end

    :ok
  end
end
