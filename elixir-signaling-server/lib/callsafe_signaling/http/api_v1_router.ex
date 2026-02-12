defmodule CallsafeSignaling.HTTP.ApiV1Router do
  @moduledoc """
  API v1 endpoints - all require JWT authentication.
  """

  use Plug.Router
  require Logger

  alias CallsafeSignaling.{DeviceRegistry, Config}
  alias CallsafeSignaling.HTTP.Middleware.Auth

  plug(:match)

  # Apply JWT authentication to all /api/v1/* endpoints
  plug(Auth)

  plug(:dispatch)

  # TURN credentials endpoint
  post "/turn/credentials" do
    # Return TURN server configuration
    turn_servers = Config.turn_servers()

    credentials = %{
      ttl: 86400,
      uris:
        Enum.map(turn_servers, fn server ->
          Map.get(server, :urls, [])
        end)
        |> List.flatten(),
      username: generate_turn_username(),
      password: generate_turn_password()
    }

    send_resp(conn, 200, Jason.encode!(credentials))
  end

  # FCM token registration endpoint
  post "/fcm/register" do
    device_id = conn.assigns.claims.device_id
    push_token = conn.body_params["push_token"]

    if is_nil(push_token) or push_token == "" do
      send_resp(
        conn,
        400,
        Jason.encode!(%{
          error: "bad_request",
          message: "push_token is required"
        })
      )
    else
      case DeviceRegistry.update_push_token(device_id, push_token) do
        {:ok, _entry} ->
          send_resp(
            conn,
            200,
            Jason.encode!(%{
              success: true,
              message: "Push token registered successfully"
            })
          )

        {:error, :not_found} ->
          send_resp(
            conn,
            404,
            Jason.encode!(%{
              error: "device_not_found",
              message: "Device not registered in DeviceRegistry"
            })
          )
      end
    end
  end

  # FCM token status endpoint
  get "/fcm/status/:device_id" do
    device_id = conn.path_params["device_id"]
    claims_device_id = conn.assigns.claims.device_id

    # Ensure device can only query its own status
    if device_id != claims_device_id do
      send_resp(
        conn,
        403,
        Jason.encode!(%{
          error: "forbidden",
          message: "Cannot query other device's status"
        })
      )
    else
      case DeviceRegistry.lookup_by_device(device_id) do
        {:ok, entry} ->
          status = %{
            device_id: entry.device_id,
            has_push_token: not is_nil(entry.push_token),
            status: entry.status,
            connected_at: entry.connected_at
          }

          send_resp(conn, 200, Jason.encode!(status))

        {:error, :not_found} ->
          send_resp(
            conn,
            404,
            Jason.encode!(%{
              error: "device_not_found",
              message: "Device not registered"
            })
          )
      end
    end
  end

  match _ do
    send_resp(
      conn,
      404,
      Jason.encode!(%{
        error: "not_found",
        message: "Unknown API endpoint"
      })
    )
  end

  # Private helpers

  defp generate_turn_username do
    # Generate timestamp-based username (expires in 24 hours)
    expiry = System.system_time(:second) + 86400
    "#{expiry}:callsafe"
  end

  defp generate_turn_password do
    # Generate HMAC-based password using shared secret
    # In production, this should use actual TURN server credentials
    username = generate_turn_username()
    secret = Config.jwt_secret() || "turn-secret"

    :crypto.mac(:hmac, :sha256, secret, username)
    |> Base.encode64()
  end
end
