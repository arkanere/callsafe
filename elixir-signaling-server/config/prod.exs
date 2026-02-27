import Config

config :callsafe_signaling,
  port: String.to_integer(System.get_env("PORT") || "4000"),
  env: :prod,

  # Protocol validation
  log_validation_failures: true,
  reject_invalid_messages: true,

  # Rate limiting
  max_requests_per_device: 200,
  max_requests_per_ip: 2000,
  rate_limit_window_seconds: 60,

  # Call timeouts (milliseconds)
  timeout_ringing: 30_000,
  timeout_connecting: 10_000,
  timeout_idle: 300_000,

  # TURN servers - set at runtime from TURN_SERVER_URL env var (see runtime.exs)
  turn_servers: [],

  # FCM push notifications
  fcm_enabled: true,
  fcm_retry_attempts: 3,
  fcm_timeout_ms: 5_000,

  # Telemetry
  telemetry_enabled: true

# Logger configuration
config :logger,
  level: :info,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id, :device_id, :call_attempt_id, :call_id]
