defmodule CallsafeSignaling.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application
  require Logger

  @impl true
  def start(_type, _args) do
    # Setup telemetry handlers before starting supervision tree
    CallsafeSignaling.Telemetry.setup()

    children = [
      # Registry for call session process lookup
      {Registry, keys: :unique, name: CallsafeSignaling.CallRegistry},

      # Device registry for connection tracking
      CallsafeSignaling.DeviceRegistry,

      # Rate limiter for security
      CallsafeSignaling.Auth.RateLimiter,

      # Stats tracking with :counters
      CallsafeSignaling.Stats,

      # FCM OAuth2 token cache
      CallsafeSignaling.FCM.TokenServer,

      # Dynamic supervisor for call sessions
      CallsafeSignaling.CallSessionSupervisor,

      # Periodic cleanup for stale sessions
      CallsafeSignaling.CleanupServer,

      # HTTP/WebSocket server
      {CallsafeSignaling.HTTP.Server, port: get_port()}
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: CallsafeSignaling.Supervisor]

    Logger.info("CallsafeSignaling application starting")
    Supervisor.start_link(children, opts)
  end

  defp get_port do
    Application.get_env(:callsafe_signaling, :http_port, 4000)
  end
end
