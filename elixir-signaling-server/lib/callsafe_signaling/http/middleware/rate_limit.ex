defmodule CallsafeSignaling.HTTP.Middleware.RateLimit do
  @moduledoc """
  Plug middleware for rate limiting HTTP requests.
  Uses the existing RateLimiter GenServer for consistent rate limiting.
  Checks both device_id (from JWT claims) and IP address.
  """

  import Plug.Conn
  require Logger

  alias CallsafeSignaling.Auth.RateLimiter

  @doc """
  Initialize the plug with options.
  """
  def init(opts), do: opts

  @doc """
  Call function for Plug behavior.
  Checks rate limits for device_id and IP address.
  """
  def call(conn, _opts) do
    device_id = get_device_id(conn)
    ip_address = get_ip_address(conn)

    case check_rate_limits(device_id, ip_address) do
      :ok ->
        conn

      {:error, :rate_limit_exceeded} ->
        send_rate_limited(conn, device_id, ip_address)
    end
  end

  # Extract device_id from conn.assigns (set by Auth middleware)
  defp get_device_id(conn) do
    case conn.assigns[:claims] do
      %{device_id: device_id} -> device_id
      _ -> nil
    end
  end

  # Extract IP address from conn
  defp get_ip_address(conn) do
    case get_peer_data(conn) do
      %{address: address} ->
        address
        |> :inet.ntoa()
        |> to_string()

      _ ->
        "unknown"
    end
  end

  # Check rate limits using RateLimiter
  defp check_rate_limits(nil, ip_address) do
    # No device_id available (unauthenticated endpoint), check IP only
    RateLimiter.check_ip(ip_address)
  end

  defp check_rate_limits(device_id, ip_address) do
    # Check both device_id and IP address
    RateLimiter.check(device_id, ip_address)
  end

  # Send 429 Too Many Requests response
  defp send_rate_limited(conn, device_id, ip_address) do
    Logger.warning("Rate limit exceeded",
      device_id: device_id,
      ip_address: ip_address
    )

    conn
    |> put_resp_content_type("application/json")
    |> send_resp(
      429,
      Jason.encode!(%{
        error: "rate_limit_exceeded",
        message: "Too many requests. Please try again later."
      })
    )
    |> halt()
  end
end
