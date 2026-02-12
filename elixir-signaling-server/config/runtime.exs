import Config

# Application configuration
config :callsafe_signaling,
  http_port: String.to_integer(System.get_env("PORT") || "4000"),
  env: String.to_atom(System.get_env("MIX_ENV") || "dev")
