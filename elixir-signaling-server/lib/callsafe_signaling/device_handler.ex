defmodule CallsafeSignaling.DeviceHandler do
  @moduledoc """
  Handler for device connection lifecycle messages.
  Manages device:connect, device:disconnect, device:status.
  Pure functional design - transforms state and returns responses.
  """

  require Logger
  alias CallsafeSignaling.{CallHandler, DeviceRegistry, Middleware.Pipeline}
  alias CallsafeSignaling.Protocol.{Enums, MessageTypes, Spec}

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
    device_id = message["deviceId"]

    with {:ok, auth_context} <- authenticate(message, state),
         :ok <- check_device_claim(device_id, auth_context),
         {:ok, protocol_version} <- negotiate_protocol(message),
         device_type <- Enums.to_device_type(message["deviceType"]),
         role <- Enums.to_role(auth_context.role),
         business_id <- auth_context.business_id,
         {:ok, _entry} <-
           register_device(
             device_id,
             business_id,
             state.connection_pid,
             device_type,
             role,
             message["pushToken"]
           ) do
      # Update state with authenticated device info
      new_state =
        state
        |> Map.put(:device_id, device_id)
        |> Map.put(:business_id, business_id)
        |> Map.put(:device_type, device_type)
        |> Map.put(:role, role)
        |> Map.put(:protocol_version, protocol_version)
        |> Map.put(:authenticated, true)

      response = %{
        "type" => MessageTypes.device_connected(),
        "deviceId" => device_id,
        "role" => Atom.to_string(role),
        "protocolVersion" => protocol_version,
        "timestamp" => System.system_time(:millisecond)
      }

      Logger.info(
        "Device connected: #{device_id} (#{device_type}, #{role}) for business: #{business_id}"
      )

      # FCM wake flow: a business device connecting while calls are ringing
      # gets each ringing call:incoming re-delivered.
      if role == :business do
        CallHandler.redeliver_ringing_calls(business_id, device_id, state.connection_pid)
      end

      {:ok, response, new_state}
    else
      {:error, error_type, error_message} ->
        {:error, error_type, error_message}

      {:error, reason} when is_atom(reason) ->
        {:error, auth_error_code(reason), "Authentication failed: #{reason}"}
    end
  end

  # Handle device:disconnect — identity comes from the connection
  def handle("device:disconnect", _message, state) do
    device_id = state.device_id
    DeviceRegistry.unregister(device_id)

    response = %{
      "type" => MessageTypes.device_disconnected(),
      "deviceId" => device_id,
      "timestamp" => System.system_time(:millisecond)
    }

    Logger.info("Device disconnected: #{device_id}")
    {:ok, response, state}
  end

  # Handle device:status — identity comes from the connection
  def handle("device:status", message, state) do
    device_id = state.device_id
    status = Enums.to_device_status(message["status"])

    case DeviceRegistry.update_status(device_id, status) do
      {:ok, _entry} ->
        response = %{
          "type" => MessageTypes.device_status_updated(),
          "deviceId" => device_id,
          "status" => Atom.to_string(status),
          "timestamp" => System.system_time(:millisecond)
        }

        Logger.debug("Device status updated: #{device_id} -> #{status}")
        {:ok, response, state}

      {:error, :not_found} ->
        {:error, "device_not_found", "Device not registered"}
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
        {:error, auth_error_code(reason), "Authentication failed: #{reason}"}
    end
  end

  defp auth_error_code(:expired), do: "token_expired"
  defp auth_error_code(:rate_limit_exceeded), do: "rate_limited"
  defp auth_error_code(_reason), do: "auth_failed"

  # The deviceId sent on the wire MUST equal the token's device_id claim.
  defp check_device_claim(device_id, auth_context) do
    if device_id == auth_context.device_id do
      :ok
    else
      {:error, "device_mismatch", "deviceId does not match the token's device_id claim"}
    end
  end

  # Negotiate protocol version: the major version must match the server's.
  defp negotiate_protocol(message) do
    client_version = Map.get(message, "protocolVersion")

    case String.split(client_version, ".") do
      [major | _rest] when major != "" ->
        if Integer.parse(major) == {Spec.major_version(), ""} do
          {:ok, Spec.version()}
        else
          {:error, "protocol_incompatible",
           "Client protocol #{client_version} is incompatible with server #{Spec.version()}"}
        end

      _ ->
        {:error, "protocol_incompatible", "protocolVersion must be a semver string"}
    end
  end

  # Register device in DeviceRegistry; an existing registration with the same
  # deviceId is superseded (protocol: re-connecting replaces the old connection).
  defp register_device(device_id, business_id, connection_pid, device_type, role, push_token) do
    case DeviceRegistry.register(
           device_id,
           business_id,
           connection_pid,
           device_type,
           role,
           :available,
           push_token
         ) do
      {:ok, entry} ->
        {:ok, entry}

      {:error, :already_registered} ->
        Logger.info("Device #{device_id} reconnected, superseding previous connection")
        DeviceRegistry.unregister(device_id)

        DeviceRegistry.register(
          device_id,
          business_id,
          connection_pid,
          device_type,
          role,
          :available,
          push_token
        )
    end
  end
end
