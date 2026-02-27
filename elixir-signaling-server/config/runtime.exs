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

# Application configuration
config :callsafe_signaling,
  http_port: String.to_integer(System.get_env("PORT") || "4000"),
  env: String.to_atom(System.get_env("MIX_ENV") || "dev"),
  turn_servers: turn_servers,
  turn_secret: System.get_env("TURN_SECRET"),
  turn_username: System.get_env("TURN_USERNAME") || "callsafe"
