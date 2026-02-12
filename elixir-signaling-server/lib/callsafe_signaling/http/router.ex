defmodule CallsafeSignaling.HTTP.Router do
  @moduledoc """
  Plug-based HTTP router for REST API endpoints.
  Handles all non-WebSocket HTTP requests.
  """

  use Plug.Router
  require Logger

  alias CallsafeSignaling.{Stats, DeviceRegistry}
  alias CallsafeSignaling.HTTP.Middleware.RateLimit

  # Parse JSON body for POST requests
  plug(Plug.Parsers,
    parsers: [:json],
    pass: ["application/json"],
    json_decoder: Jason
  )

  plug(:match)

  # Apply rate limiting to all endpoints
  plug(RateLimit)

  plug(:dispatch)

  # Public endpoints (no auth required)

  get "/" do
    send_resp(
      conn,
      200,
      Jason.encode!(%{
        service: "CallSafe Signaling Server",
        version: "0.1.0",
        status: "running"
      })
    )
  end

  get "/health" do
    # Detailed health check with system metrics
    health_data = %{
      status: "ok",
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
      uptime_seconds: get_uptime_seconds(),
      system: %{
        total_memory: :erlang.memory(:total),
        process_count: :erlang.system_info(:process_count),
        port_count: :erlang.system_info(:port_count),
        atom_count: :erlang.system_info(:atom_count)
      },
      connections: %{
        active: DeviceRegistry.count()
      }
    }

    send_resp(conn, 200, Jason.encode!(health_data))
  end

  get "/status" do
    # Server status with basic metrics
    status_data = %{
      status: "running",
      version: "0.1.0",
      uptime_seconds: get_uptime_seconds(),
      devices_connected: DeviceRegistry.count(),
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    }

    send_resp(conn, 200, Jason.encode!(status_data))
  end

  get "/stats" do
    # Comprehensive statistics
    stats_data = Stats.get_all()
    send_resp(conn, 200, Jason.encode!(stats_data))
  end

  # Protected endpoints (require JWT auth)

  forward("/api/v1", to: CallsafeSignaling.HTTP.ApiV1Router)

  match _ do
    send_resp(
      conn,
      404,
      Jason.encode!(%{
        error: "not_found",
        message: "Unknown endpoint"
      })
    )
  end

  # Private helpers

  defp get_uptime_seconds do
    {uptime_ms, _} = :erlang.statistics(:wall_clock)
    div(uptime_ms, 1000)
  end
end
