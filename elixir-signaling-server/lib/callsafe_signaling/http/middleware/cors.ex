defmodule CallsafeSignaling.HTTP.Middleware.CORS do
  @moduledoc """
  Plug middleware for CORS.
  Compares the request Origin against the configured allowlist
  (Config.cors_allowed_origins/0). Allowed origins get the
  access-control-allow-* response headers; OPTIONS preflight requests are
  answered directly with 204. Requests from origins not on the allowlist
  pass through unchanged — the browser enforces the block.
  """

  import Plug.Conn

  alias CallsafeSignaling.Config

  @preflight_max_age_seconds "3600"

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_req_header(conn, "origin") do
      [origin] -> handle_origin(conn, origin)
      _ -> conn
    end
  end

  defp handle_origin(conn, origin) do
    allowed = Config.cors_allowed_origins()

    cond do
      "*" in allowed -> put_cors_headers(conn, "*")
      origin in allowed -> put_cors_headers(conn, origin)
      true -> conn
    end
    |> maybe_halt_preflight()
  end

  defp put_cors_headers(conn, allow_origin) do
    conn
    |> put_resp_header("access-control-allow-origin", allow_origin)
    |> put_resp_header("access-control-allow-methods", "GET, POST, OPTIONS")
    |> put_resp_header("access-control-allow-headers", "authorization, content-type")
    |> put_resp_header("access-control-max-age", @preflight_max_age_seconds)
    |> put_resp_header("vary", "origin")
  end

  defp maybe_halt_preflight(%Plug.Conn{method: "OPTIONS"} = conn) do
    conn
    |> send_resp(204, "")
    |> halt()
  end

  defp maybe_halt_preflight(conn), do: conn
end
