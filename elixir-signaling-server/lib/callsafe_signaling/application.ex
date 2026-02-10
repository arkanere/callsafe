defmodule CallsafeSignaling.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application
  require Logger

  @impl true
  def start(_type, _args) do
    children = [
      # Registry for call session process lookup
      {Registry, keys: :unique, name: CallsafeSignaling.CallRegistry},

      # Device registry for connection tracking
      CallsafeSignaling.DeviceRegistry,

      # Dynamic supervisor for call sessions
      CallsafeSignaling.CallSessionSupervisor
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: CallsafeSignaling.Supervisor]

    Logger.info("CallsafeSignaling application starting")
    Supervisor.start_link(children, opts)
  end
end
