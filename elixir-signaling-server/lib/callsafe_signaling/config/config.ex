defmodule CallsafeSignaling.Config do
  @moduledoc """
  Configuration management for the signaling server.
  Reads from environment-specific config files and environment variables.
  """

  @doc """
  Get configuration value by key path.
  Falls back to default if not found.
  """
  def get(key_path, default \\ nil) do
    Application.get_env(:callsafe_signaling, key_path, default)
  end

  @doc """
  Get server port.
  """
  def port do
    get(:port, 4000)
  end

  @doc """
  Get current environment.
  """
  def env do
    get(:env, :dev)
  end

  @doc """
  Get JWT secret for authentication.
  """
  def jwt_secret do
    get(:jwt_secret, System.get_env("JWT_SECRET"))
  end

  @doc """
  Get FCM service account JSON from environment.
  """
  def fcm_service_account_json do
    System.get_env("FCM_SERVICE_ACCOUNT_JSON")
  end

  @doc """
  Get FCM project ID from TokenServer.
  """
  def fcm_project_id do
    case CallsafeSignaling.FCM.TokenServer.project_id() do
      {:ok, id} -> id
      {:error, _} -> nil
    end
  end

  @doc """
  Get TURN server configuration.
  """
  def turn_servers do
    get(:turn_servers, [])
  end

  @doc """
  Get TURN shared secret for HMAC credential generation.
  """
  def turn_secret do
    get(:turn_secret, nil)
  end

  @doc """
  Get TURN username identifier (embedded in time-limited username as "expiry:identifier").
  """
  def turn_username do
    get(:turn_username, "callsafe")
  end

  @doc """
  Get the list of origins allowed to make cross-origin HTTP requests.
  An entry of "*" allows any origin.
  """
  def cors_allowed_origins do
    get(:cors_allowed_origins, [])
  end

  @doc """
  Get rate limit configuration.
  """
  def rate_limits do
    %{
      max_requests_per_device: get(:max_requests_per_device, 100),
      max_requests_per_ip: get(:max_requests_per_ip, 1000),
      window_seconds: get(:rate_limit_window_seconds, 60)
    }
  end

  @doc """
  Get call timeout configuration (in milliseconds).
  """
  def call_timeouts do
    %{
      ringing: get(:timeout_ringing, 30_000),
      connecting: get(:timeout_connecting, 30_000),
      escalation: get(:timeout_escalation, 30_000),
      reconnect_grace: get(:timeout_reconnect_grace, 30_000),
      terminal_retention: get(:terminal_retention, 60_000),
      idle: get(:timeout_idle, 300_000)
    }
  end

  @doc """
  Check if protocol validation logging is enabled.
  """
  def log_validation_failures? do
    get(:log_validation_failures, true)
  end

  @doc """
  Check if protocol violations should reject messages.
  """
  def reject_invalid_messages? do
    get(:reject_invalid_messages, false)
  end

  @doc """
  Get FCM notification configuration.
  """
  def fcm_config do
    %{
      enabled: get(:fcm_enabled, true),
      retry_attempts: get(:fcm_retry_attempts, 3),
      timeout_ms: get(:fcm_timeout_ms, 5_000)
    }
  end

  @doc """
  Check if telemetry is enabled.
  """
  def telemetry_enabled? do
    get(:telemetry_enabled, true)
  end
end
