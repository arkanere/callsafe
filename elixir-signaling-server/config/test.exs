import Config

config :callsafe_signaling,
  port: 4001,
  env: :test,

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
  turn_servers: []

# Logger configuration
config :logger,
  level: :warn
