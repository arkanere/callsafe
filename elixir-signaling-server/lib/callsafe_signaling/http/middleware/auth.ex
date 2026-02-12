defmodule CallsafeSignaling.HTTP.Middleware.Auth do
  @moduledoc """
  Plug middleware for JWT authentication.
  Extracts and validates JWT tokens from Authorization header.
  Adds claims to conn.assigns for downstream handlers.
  """

  import Plug.Conn
  require Logger

  alias CallsafeSignaling.Auth.JWT

  @doc """
  Initialize the plug with options.
  """
  def init(opts), do: opts

  @doc """
  Call function for Plug behavior.
  Validates JWT token and adds claims to conn.assigns.
  """
  def call(conn, _opts) do
    case extract_token(conn) do
      {:ok, token} ->
        verify_token(conn, token)

      {:error, reason} ->
        send_unauthorized(conn, reason)
    end
  end

  # Extract token from Authorization header
  defp extract_token(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] ->
        {:ok, token}

      [token] when is_binary(token) ->
        # Also accept token without "Bearer " prefix
        {:ok, token}

      [] ->
        {:error, :missing_token}

      _ ->
        {:error, :invalid_auth_header}
    end
  end

  # Verify token using JWT module
  defp verify_token(conn, token) do
    case JWT.verify(token) do
      {:ok, claims} ->
        # Add claims to conn.assigns for downstream handlers
        assign(conn, :claims, claims)

      {:error, :expired} ->
        send_unauthorized(conn, :token_expired)

      {:error, :invalid_token} ->
        send_unauthorized(conn, :invalid_token)

      {:error, :missing_secret} ->
        Logger.error("JWT secret not configured")
        send_error(conn, 500, "internal_error", "Server configuration error")
    end
  end

  # Send 401 Unauthorized response
  defp send_unauthorized(conn, reason) do
    reason_string = reason_to_string(reason)

    conn
    |> put_resp_content_type("application/json")
    |> send_resp(
      401,
      Jason.encode!(%{
        error: "unauthorized",
        message: reason_string
      })
    )
    |> halt()
  end

  # Send custom error response
  defp send_error(conn, status, error, message) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(
      status,
      Jason.encode!(%{
        error: error,
        message: message
      })
    )
    |> halt()
  end

  # Convert error reason to human-readable string
  defp reason_to_string(:missing_token), do: "Missing authentication token"
  defp reason_to_string(:invalid_auth_header), do: "Invalid Authorization header format"
  defp reason_to_string(:token_expired), do: "Token has expired"
  defp reason_to_string(:invalid_token), do: "Invalid token"
  defp reason_to_string(_), do: "Authentication failed"
end
