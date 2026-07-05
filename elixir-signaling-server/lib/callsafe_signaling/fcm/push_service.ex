defmodule CallsafeSignaling.FCM.PushService do
  @moduledoc """
  Firebase Cloud Messaging integration for push notifications to offline devices.
  Uses the FCM HTTP v2 API with OAuth2 bearer token auth.
  """

  require Logger
  alias CallsafeSignaling.Stats
  alias CallsafeSignaling.FCM.TokenServer

  @doc """
  Send push notification to a device via FCM HTTP v2 API.

  ## Parameters
    - device_token: FCM registration token for the target device
    - payload: Data payload including callAttemptId, sourceId, callType

  ## Returns
    - {:ok, response} on success
    - {:error, reason} on failure
  """
  def send_notification(device_token, payload) when is_binary(device_token) and is_map(payload) do
    case TokenServer.get_token() do
      {:ok, access_token, project_id} ->
        send_fcm_request(device_token, payload, access_token, project_id)

      {:error, :fcm_not_configured} ->
        Logger.warning("FCM service account not configured, skipping push notification")
        {:error, :fcm_not_configured}

      {:error, reason} ->
        Logger.error("FCM token retrieval failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Send incoming call notification to device.
  """
  def notify_incoming_call(device_token, call_id, caller_id, call_type) do
    # Field names match the v2 protocol's call:incoming payload; timestamps
    # are ms epoch, consistent with protocol messages.
    payload = %{
      callAttemptId: call_id,
      sourceId: caller_id,
      callType: to_string(call_type),
      timestamp: System.system_time(:millisecond)
    }

    send_notification(device_token, payload)
  end

  # Private functions

  defp fcm_endpoint(project_id) do
    Application.get_env(
      :callsafe_signaling,
      :fcm_endpoint,
      "https://fcm.googleapis.com/v1/projects/#{project_id}/messages:send"
    )
  end

  defp send_fcm_request(device_token, payload, access_token, project_id) do
    headers = [
      {"Authorization", "Bearer #{access_token}"},
      {"Content-Type", "application/json"}
    ]

    # Data-only message: on Android a `notification` block would be delivered
    # to the system tray in the background instead of onMessageReceived, which
    # breaks the wake -> connect -> re-delivered call:incoming flow. High
    # priority is required for timely delivery in Doze (ring timeout is 30s).
    body = %{
      message: %{
        token: device_token,
        data: stringify_values(payload),
        android: %{priority: "high"}
      }
    }

    start_time = System.monotonic_time(:millisecond)

    case Req.post(fcm_endpoint(project_id), headers: headers, json: body) do
      {:ok, %{status: status, body: response_body}} when status in 200..299 ->
        duration = System.monotonic_time(:millisecond) - start_time

        Stats.increment_fcm_sent()

        :telemetry.execute(
          [:callsafe_signaling, :fcm, :notification, :sent],
          %{duration: duration},
          %{call_id: payload.callAttemptId, call_type: payload.callType}
        )

        Logger.debug("FCM notification sent successfully",
          call_id: payload.callAttemptId,
          duration_ms: duration
        )

        {:ok, response_body}

      {:ok, %{status: status, body: response_body}} ->
        Stats.increment_fcm_failed()

        Logger.warning("FCM request failed",
          status: status,
          response: inspect(response_body),
          call_id: payload.callAttemptId
        )

        :telemetry.execute(
          [:callsafe_signaling, :fcm, :notification, :failed],
          %{count: 1},
          %{status: status, call_id: payload.callAttemptId}
        )

        {:error, {:fcm_error, status, response_body}}

      {:error, reason} ->
        Stats.increment_fcm_failed()

        Logger.error("FCM request error",
          error: inspect(reason),
          call_id: payload.callAttemptId
        )

        :telemetry.execute(
          [:callsafe_signaling, :fcm, :notification, :error],
          %{count: 1},
          %{reason: inspect(reason)}
        )

        {:error, reason}
    end
  end

  defp stringify_values(map) do
    Map.new(map, fn {k, v} -> {to_string(k), to_string(v)} end)
  end
end
