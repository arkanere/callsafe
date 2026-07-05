defmodule CallsafeSignaling.HTTP.ApiV1Router do
  @moduledoc """
  API v1 endpoints - all require JWT authentication.
  """

  use Plug.Router
  require Logger

  alias CallsafeSignaling.DeviceRegistry
  alias CallsafeSignaling.HTTP.Middleware.Auth

  plug(:match)

  # Apply JWT authentication to all /api/v1/* endpoints
  plug(Auth)

  plug(:dispatch)

  # TURN credentials endpoint (authenticated — app + mobile). Guests use the
  # public GET /api/turn-credentials; both share Turn.Credentials.generate/0.
  post "/turn/credentials" do
    send_resp(conn, 200, Jason.encode!(CallsafeSignaling.Turn.Credentials.generate()))
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
end
