# Configuration for CallSafe Signaling Server
import Config

# General application configuration
config :callsafe_signaling,
  env: Mix.env()

# Import environment specific config
import_config "#{config_env()}.exs"
