defmodule CallsafeSignaling.HTTP.Router do
  @moduledoc """
  Plug-based HTTP router for REST API endpoints.
  Handles all non-WebSocket HTTP requests.
  """

  use Plug.Router
  require Logger

  plug(:match)
  plug(:dispatch)

  get "/" do
    send_resp(conn, 200, Jason.encode!(%{
      service: "CallSafe Signaling Server",
      version: "0.1.0",
      status: "running"
    }))
  end

  get "/health" do
    send_resp(conn, 200, Jason.encode!(%{
      status: "ok",
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    }))
  end

  match _ do
    send_resp(conn, 404, Jason.encode!(%{
      error: "not_found",
      message: "Unknown endpoint"
    }))
  end
end
