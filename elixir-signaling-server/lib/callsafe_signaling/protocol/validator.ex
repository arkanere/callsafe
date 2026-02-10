defmodule CallsafeSignaling.Protocol.Validator do
  @moduledoc """
  Message validation as pure data transformation.
  Validates messages against protocol schemas without side effects.
  """

  alias CallsafeSignaling.Protocol.{MessageTypes, Enums}

  @type validation_result :: :ok | {:error, [String.t()]}

  @doc """
  Validate a message against its schema.
  Returns :ok or {:error, reasons}.
  """
  @spec validate(String.t(), map) :: validation_result
  def validate(message_type, payload) do
    errors = collect_errors(message_type, payload)

    case errors do
      [] -> :ok
      errors -> {:error, errors}
    end
  end

  # Collect all validation errors for a message
  defp collect_errors(message_type, payload) do
    []
    |> check_message_type(message_type)
    |> check_required_fields(message_type, payload)
    |> check_field_types(message_type, payload)
  end

  defp check_message_type(errors, message_type) do
    if MessageTypes.valid?(message_type) do
      errors
    else
      ["Invalid message type: #{message_type}" | errors]
    end
  end

  defp check_required_fields(errors, message_type, payload) do
    required = required_fields(message_type)
    missing = Enum.reject(required, &Map.has_key?(payload, &1))

    case missing do
      [] -> errors
      fields -> ["Missing required fields: #{Enum.join(fields, ", ")}" | errors]
    end
  end

  defp check_field_types(errors, message_type, payload) do
    Enum.reduce(payload, errors, fn {field, value}, acc ->
      case validate_field(message_type, field, value) do
        :ok -> acc
        {:error, reason} -> [reason | acc]
      end
    end)
  end

  # Define required fields per message type
  defp required_fields(msg_type) do
    case msg_type do
      "call:initiate" -> ["callAttemptId", "handle", "callType", "mediaCapabilities"]
      "call:accept" -> ["callAttemptId", "deviceType", "deviceId"]
      "call:reject" -> ["callAttemptId", "deviceType"]
      "call:end" -> ["callAttemptId", "initiator"]
      "call:failed" -> ["callAttemptId", "reason"]
      "call:incoming" -> ["callAttemptId", "sourceId", "callType", "timestamp"]
      "call:accepted" -> ["callAttemptId", "acceptingDevice", "timestamp"]
      "call:cancelled" -> ["callAttemptId", "reason", "timestamp"]
      "call:ended" -> ["callAttemptId", "duration", "timestamp"]
      "device:connect" -> ["deviceType", "deviceId"]
      "device:status" -> ["deviceId", "status"]
      "media:toggle" -> ["callAttemptId", "action", "success"]
      "call:escalate" -> ["callAttemptId", "requestedBy", "mediaCapabilities"]
      "call:downgrade" -> ["callAttemptId", "requestedBy"]
      "webrtc:offer" -> ["callAttemptId", "sdp"]
      "webrtc:answer" -> ["callAttemptId", "sdp"]
      "webrtc:ice-candidate" -> ["callAttemptId", "candidate"]
      _ -> []
    end
  end

  # Validate individual field values
  defp validate_field(message_type, field, value) do
    case {message_type, field} do
      {_, "callAttemptId"} -> validate_uuid(value)
      {_, "callType"} -> validate_call_type(value)
      {_, "deviceType"} -> validate_device_type(value)
      {_, "status"} -> validate_device_status(value)
      {_, "initiator"} -> validate_call_initiator(value)
      {_, "requestedBy"} -> validate_call_initiator(value)
      {_, "reason"} when message_type == "call:ended" -> validate_call_end_reason(value)
      {_, "action"} -> validate_media_toggle_action(value)
      {_, "success"} -> validate_boolean(value)
      {_, "timestamp"} -> validate_number(value)
      {_, "duration"} -> validate_number(value)
      {_, "mediaCapabilities"} -> validate_media_capabilities(value)
      {_, "protocolVersion"} -> validate_string(value)
      {_, "handle"} -> validate_string(value)
      {_, "deviceId"} -> validate_string(value)
      {_, "sourceId"} -> validate_string(value)
      {_, "pushToken"} -> validate_string(value)
      {_, "sdp"} -> validate_string(value)
      {_, "candidate"} -> validate_ice_candidate(value)
      _ -> :ok
    end
  end

  # Type validators
  defp validate_uuid(value) when is_binary(value) do
    # Basic UUID format check
    case Regex.match?(~r/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, value) do
      true -> :ok
      false -> {:error, "Invalid UUID format: #{value}"}
    end
  end
  defp validate_uuid(_), do: {:error, "UUID must be a string"}

  defp validate_call_type(value) when is_binary(value) do
    if Enums.valid_call_type?(value) do
      :ok
    else
      {:error, "Invalid call type: #{value}"}
    end
  end
  defp validate_call_type(_), do: {:error, "Call type must be a string"}

  defp validate_device_type(value) when is_binary(value) do
    if Enums.valid_device_type?(value) do
      :ok
    else
      {:error, "Invalid device type: #{value}"}
    end
  end
  defp validate_device_type(_), do: {:error, "Device type must be a string"}

  defp validate_device_status(value) when is_binary(value) do
    if Enums.valid_device_status?(value) do
      :ok
    else
      {:error, "Invalid device status: #{value}"}
    end
  end
  defp validate_device_status(_), do: {:error, "Device status must be a string"}

  defp validate_call_initiator(value) when is_binary(value) do
    if Enums.valid_call_initiator?(value) do
      :ok
    else
      {:error, "Invalid call initiator: #{value}"}
    end
  end
  defp validate_call_initiator(_), do: {:error, "Call initiator must be a string"}

  defp validate_call_end_reason(value) when is_binary(value) do
    if Enums.valid_call_end_reason?(value) do
      :ok
    else
      {:error, "Invalid call end reason: #{value}"}
    end
  end
  defp validate_call_end_reason(_), do: {:error, "Call end reason must be a string"}

  defp validate_media_toggle_action(value) when is_binary(value) do
    if Enums.valid_media_toggle_action?(value) do
      :ok
    else
      {:error, "Invalid media toggle action: #{value}"}
    end
  end
  defp validate_media_toggle_action(_), do: {:error, "Media toggle action must be a string"}

  defp validate_boolean(value) when is_boolean(value), do: :ok
  defp validate_boolean(_), do: {:error, "Value must be a boolean"}

  defp validate_number(value) when is_number(value), do: :ok
  defp validate_number(_), do: {:error, "Value must be a number"}

  defp validate_string(value) when is_binary(value), do: :ok
  defp validate_string(_), do: {:error, "Value must be a string"}

  defp validate_media_capabilities(value) when is_map(value) do
    # MediaCapabilities should have canSend and canReceive arrays
    cond do
      not Map.has_key?(value, "canSend") ->
        {:error, "MediaCapabilities missing canSend field"}
      not Map.has_key?(value, "canReceive") ->
        {:error, "MediaCapabilities missing canReceive field"}
      not is_list(value["canSend"]) ->
        {:error, "canSend must be an array"}
      not is_list(value["canReceive"]) ->
        {:error, "canReceive must be an array"}
      true ->
        :ok
    end
  end
  defp validate_media_capabilities(_), do: {:error, "MediaCapabilities must be an object"}

  defp validate_ice_candidate(value) when is_map(value) do
    # ICE candidate should have candidate, sdpMid, sdpMLineIndex
    required = ["candidate", "sdpMid", "sdpMLineIndex"]
    missing = Enum.reject(required, &Map.has_key?(value, &1))

    case missing do
      [] -> :ok
      fields -> {:error, "ICE candidate missing fields: #{Enum.join(fields, ", ")}"}
    end
  end
  defp validate_ice_candidate(_), do: {:error, "ICE candidate must be an object"}
end
