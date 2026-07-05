defmodule CallsafeSignaling.HTTP.Router do
  @moduledoc """
  Plug-based HTTP router for REST API endpoints.
  Handles all non-WebSocket HTTP requests.
  """

  use Plug.Router
  require Logger

  alias CallsafeSignaling.{Config, DeviceRegistry, Stats}
  alias CallsafeSignaling.Auth.JWT
  alias CallsafeSignaling.HTTP.Middleware.{CORS, RateLimit}

  # Guest tokens are short-lived: enough to complete the device:connect handshake.
  @guest_token_ttl_seconds 300

  # CORS runs first so preflight OPTIONS requests are answered before
  # matching/dispatch (there are no explicit OPTIONS routes).
  plug(CORS)

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

  # Guest token for anonymous customers (embed widget). Declared here, before
  # the /api/v1 forward, so it bypasses the ApiV1Router's Auth plug; the
  # router-wide RateLimit plug still applies (IP-based for unauthenticated
  # requests). Claims: device_id = fresh UUIDv4, business_id = handle,
  # role = customer.
  get "/api/v1/guest-token" do
    conn = fetch_query_params(conn)
    handle = conn.query_params["handle"]

    cond do
      is_nil(Config.jwt_secret()) ->
        Logger.error("JWT secret not configured")

        send_json(conn, 500, %{error: "server_error", message: "Server configuration error"})

      not valid_handle?(handle) ->
        send_json(conn, 400, %{
          error: "validation_error",
          message: "handle is required (1-255 characters)"
        })

      true ->
        device_id = UUID.uuid4()

        token =
          JWT.generate(device_id, handle, "customer", Config.jwt_secret(),
            ttl: @guest_token_ttl_seconds
          )

        send_json(conn, 200, %{
          token: token,
          deviceId: device_id,
          expiresIn: @guest_token_ttl_seconds
        })
    end
  end

  # TURN credentials for embed guests. Public (like guest-token) so the widget
  # can fetch relay credentials before it has authenticated. Declared before the
  # /api/v1 forward so it bypasses the ApiV1Router Auth plug. The shared TURN
  # secret is never exposed — only ephemeral, derived credentials.
  get "/api/turn-credentials" do
    send_resp(conn, 200, Jason.encode!(CallsafeSignaling.Turn.Credentials.generate()))
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

  defp valid_handle?(handle) do
    is_binary(handle) and byte_size(handle) >= 1 and byte_size(handle) <= 255
  end

  defp send_json(conn, status, body) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(body))
  end

  defp get_uptime_seconds do
    {uptime_ms, _} = :erlang.statistics(:wall_clock)
    div(uptime_ms, 1000)
  end
end
