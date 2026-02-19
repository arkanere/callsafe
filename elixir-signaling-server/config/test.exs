import Config

config :callsafe_signaling,
  port: 4001,
  http_port: 4001,
  env: :test,
  jwt_secret: "test_secret_for_e2e",

  # Protocol validation
  log_validation_failures: true,
  reject_invalid_messages: true,

  # Rate limiting
  max_requests_per_device: 10,
  max_requests_per_ip: 100,
  rate_limit_window_seconds: 60,

  # Call timeouts (milliseconds)
  timeout_ringing: 5_000,
  timeout_connecting: 5_000,
  timeout_idle: 10_000,

  # TURN servers
  turn_servers: [],

  # FCM push notifications
  fcm_enabled: false,
  fcm_retry_attempts: 1,
  fcm_timeout_ms: 1_000,

  # Telemetry
  telemetry_enabled: true

# Logger configuration
config :logger,
  level: :warning
