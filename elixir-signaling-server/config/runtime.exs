import Config

# Parse TURN server URLs — comma-separated, e.g. "turn:a.relay.metered.ca:80,turns:a.relay.metered.ca:443"
turn_urls =
  case System.get_env("TURN_SERVER_URL") do
    url when is_binary(url) and url != "" ->
      url |> String.split(",") |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))

    _ ->
      []
  end

turn_servers = if turn_urls == [], do: [], else: [%{urls: turn_urls}]

# CORS allowlist — comma-separated origins, e.g.
# "https://app.callsafe.tech,https://widget.callsafe.tech" (or "*" for any).
# Only overrides the compile-time config when the env var is set, so dev
# defaults from dev.exs survive.
case System.get_env("CORS_ALLOWED_ORIGINS") do
  origins when is_binary(origins) and origins != "" ->
    config :callsafe_signaling,
      cors_allowed_origins:
        origins |> String.split(",") |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))

  _ ->
    :ok
end

# Application configuration
config :callsafe_signaling,
  http_port: String.to_integer(System.get_env("PORT") || "4000"),
  env: String.to_atom(System.get_env("MIX_ENV") || "dev"),
  turn_servers: turn_servers,
  turn_secret: System.get_env("TURN_SECRET"),
  turn_username: System.get_env("TURN_USERNAME") || "callsafe",
  turn_static_username: System.get_env("TURN_STATIC_USERNAME"),
  turn_static_credential: System.get_env("TURN_STATIC_CREDENTIAL")
