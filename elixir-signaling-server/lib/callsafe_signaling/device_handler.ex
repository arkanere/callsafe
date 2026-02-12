defmodule CallsafeSignaling.DeviceHandler do
  @moduledoc """
  Handler for device connection lifecycle messages.
  Manages device:connect, device:disconnect, device:status.
  Pure functional design - transforms state and returns responses.
  """

  require Logger
  alias CallsafeSignaling.{DeviceRegistry, Middleware.Pipeline}
  alias CallsafeSignaling.Protocol.{MessageTypes, Enums}

  @protocol_version "1.0.0"

  @type message :: map()
  @type state :: map()
  @type handler_result :: {:ok, map() | nil, state} | {:error, String.t(), String.t()}

  @doc """
  Handle device-related messages.
  Returns {:ok, response_message, new_state} or {:error, error_type, error_message}.
  """
  @spec handle(String.t(), message, state) :: handler_result
  def handle(message_type, message, state)

  # Handle device:connect
  def handle("device:connect", message, state) do
    with {:ok, auth_context} <- authenticate(message, state),
         {:ok, protocol_version} <- negotiate_protocol(message),
         {:ok, device_type} <- extract_device_type(message),
         {:ok, device_id} <- extract_device_id(message),
         {:ok, push_token} <- extract_push_token(message),
         business_id <- auth_context.business_id,
         connection_pid <- state.connection_pid,
         {:ok, _entry} <-
           register_device(device_id, business_id, connection_pid, device_type, push_token) do
      # Update state with authenticated device info
      new_state =
        state
        |> Map.put(:device_id, device_id)
        |> Map.put(:business_id, business_id)
        |> Map.put(:device_type, device_type)
        |> Map.put(:protocol_version, protocol_version)
        |> Map.put(:authenticated, true)

      response = %{
        "type" => MessageTypes.device_connected(),
        "deviceId" => device_id,
        "protocolVersion" => protocol_version,
        "status" => "connected"
      }

      Logger.info("Device connected: #{device_id} (#{device_type}) for business: #{business_id}")
      {:ok, response, new_state}
    else
      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, "auth_failed", Atom.to_string(reason)}
    end
  end

  # Handle device:disconnect
  def handle("device:disconnect", _message, state) do
    case Map.get(state, :device_id) do
      nil ->
        {:error, "not_authenticated", "Device must be connected first"}

      device_id ->
        # Unregister the device
        DeviceRegistry.unregister(device_id)

        response = %{
          "type" => MessageTypes.device_disconnected(),
          "deviceId" => device_id
        }

        Logger.info("Device disconnected: #{device_id}")
        {:ok, response, state}
    end
  end

  # Handle device:status
  def handle("device:status", message, state) do
    with {:ok, device_id} <- extract_device_id(message),
         {:ok, status_string} <- extract_status(message),
         status <- Enums.to_device_status(status_string),
         true <- Map.get(state, :authenticated, false),
         state_device_id <- Map.get(state, :device_id),
         true <- state_device_id == device_id,
         {:ok, _entry} <- DeviceRegistry.update_status(device_id, status) do
      response = %{
        "type" => MessageTypes.device_status_updated(),
        "deviceId" => device_id,
        "status" => Atom.to_string(status)
      }

      Logger.debug("Device status updated: #{device_id} -> #{status}")
      {:ok, response, state}
    else
      false ->
        {:error, "not_authenticated", "Device must be connected first"}

      {:error, :not_found} ->
        {:error, "device_not_found", "Device not registered"}

      {:error, error_type, error_message} ->
        {:error, error_type, error_message}
    end
  end

  # Fallback for unknown device message types
  def handle(message_type, _message, _state) do
    {:error, "unknown_message_type", "Unknown device message type: #{message_type}"}
  end

  # Private helper functions

  # Authenticate using JWT token from message
  defp authenticate(message, state) do
    token = Map.get(message, "token")
    ip_address = Map.get(state, :ip_address, "unknown")

    context = Pipeline.build_context(token, ip_address)

    case Pipeline.execute(Pipeline.standard_pipeline(), context) do
      {:ok, auth_context} ->
        {:ok, auth_context}

      {:error, reason} ->
        Logger.warning("Authentication failed: #{inspect(reason)}")
        {:error, "auth_failed", "Authentication failed: #{reason}"}
    end
  end

  # Negotiate protocol version
  defp negotiate_protocol(message) do
    client_version = Map.get(message, "protocolVersion", @protocol_version)

    # For now, accept any version and return server version
    # In the future, implement actual version negotiation
    cond do
      client_version == @protocol_version ->
        {:ok, @protocol_version}

      true ->
        Logger.info(
          "Client protocol version #{client_version}, using server version #{@protocol_version}"
        )

        {:ok, @protocol_version}
    end
  end

  # Extract device type from message
  defp extract_device_type(message) do
    case Map.get(message, "deviceType") do
      nil ->
        {:error, "missing_field", "deviceType is required"}

      device_type when is_binary(device_type) ->
        if Enums.valid_device_type?(device_type) do
          {:ok, Enums.to_device_type(device_type)}
        else
          {:error, "invalid_device_type", "deviceType must be 'web' or 'mobile'"}
        end

      _ ->
        {:error, "invalid_field", "deviceType must be a string"}
    end
  end

  # Extract device ID from message
  defp extract_device_id(message) do
    case Map.get(message, "deviceId") do
      nil ->
        {:error, "missing_field", "deviceId is required"}

      device_id when is_binary(device_id) ->
        {:ok, device_id}

      _ ->
        {:error, "invalid_field", "deviceId must be a string"}
    end
  end

  # Extract status from message
  defp extract_status(message) do
    case Map.get(message, "status") do
      nil ->
        {:error, "missing_field", "status is required"}

      status when is_binary(status) ->
        if Enums.valid_device_status?(status) do
          {:ok, status}
        else
          {:error, "invalid_status", "status must be 'available' or 'unavailable'"}
        end

      _ ->
        {:error, "invalid_field", "status must be a string"}
    end
  end

  # Extract push token from message (optional for web devices)
  defp extract_push_token(message) do
    {:ok, Map.get(message, "pushToken")}
  end

  # Register device in DeviceRegistry
  defp register_device(device_id, business_id, connection_pid, device_type, push_token) do
    case DeviceRegistry.register(
           device_id,
           business_id,
           connection_pid,
           device_type,
           :available,
           push_token
         ) do
      {:ok, entry} ->
        {:ok, entry}

      {:error, :already_registered} ->
        # Device already registered, update it instead
        Logger.warning("Device #{device_id} already registered, updating connection")

        # Unregister and re-register with new connection
        DeviceRegistry.unregister(device_id)

        DeviceRegistry.register(
          device_id,
          business_id,
          connection_pid,
          device_type,
          :available,
          push_token
        )
    end
  end
end
