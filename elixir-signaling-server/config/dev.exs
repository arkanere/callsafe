import Config

config :callsafe_signaling,
  port: 4000,
  env: :dev,

  # Protocol validation
  log_validation_failures: true,
  reject_invalid_messages: false,

  # Rate limiting
  max_requests_per_device: 100,
  max_requests_per_ip: 1000,
  rate_limit_window_seconds: 60,

  # Call timeouts (milliseconds)
  timeout_ringing: 30_000,
  timeout_connecting: 10_000,
  timeout_idle: 300_000,

  # TURN servers
  turn_servers: [],

  # FCM push notifications
  fcm_enabled: true,
  fcm_retry_attempts: 2,
  fcm_timeout_ms: 5_000,

  # Telemetry
  telemetry_enabled: true

# Logger configuration
config :logger, level: :debug

config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id, :device_id, :call_attempt_id, :call_id]
