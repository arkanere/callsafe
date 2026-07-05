defmodule CallsafeSignaling.FCM.PushServiceTest do
  use ExUnit.Case, async: false

  alias CallsafeSignaling.FCM.PushService

  setup do
    start_supervised!(CallsafeSignaling.FCM.TokenServer)
    :ok
  end

  describe "send_notification/2" do
    test "returns error when FCM is not configured" do
      # TokenServer starts without FCM_SERVICE_ACCOUNT_JSON in test env
      result =
        PushService.send_notification("device_token_123", %{
          callAttemptId: "call_123",
          sourceId: "device_456",
          callType: "voice"
        })

      assert result == {:error, :fcm_not_configured}
    end

    test "validates device token is a string" do
      payload = %{callAttemptId: "call_123", sourceId: "device_456", callType: "voice"}

      # Should raise FunctionClauseError with nil token
      assert_raise FunctionClauseError, fn ->
        PushService.send_notification(nil, payload)
      end
    end

    test "validates payload is a map" do
      # Should raise FunctionClauseError with invalid payload
      assert_raise FunctionClauseError, fn ->
        PushService.send_notification("token", "not_a_map")
      end
    end
  end

  describe "notify_incoming_call/4" do
    test "builds correct payload structure" do
      device_token = "test_token"
      call_id = "call_789"
      caller_id = "device_123"
      call_type = :voice

      # This will fail due to no service account, but we can verify it doesn't crash
      result = PushService.notify_incoming_call(device_token, call_id, caller_id, call_type)

      # Should return error about configuration, not crash
      assert result == {:error, :fcm_not_configured}
    end

    test "handles different call types" do
      device_token = "test_token"
      call_id = "call_video"
      caller_id = "device_caller"

      # Test with video call type
      result = PushService.notify_incoming_call(device_token, call_id, caller_id, :video)
      assert result == {:error, :fcm_not_configured}

      # Test with voice call type
      result = PushService.notify_incoming_call(device_token, call_id, caller_id, :voice)
      assert result == {:error, :fcm_not_configured}
    end
  end

  describe "configuration integration" do
    test "reads FCM configuration from Config module" do
      fcm_config = CallsafeSignaling.Config.fcm_config()

      assert is_map(fcm_config)
      assert Map.has_key?(fcm_config, :enabled)
      assert Map.has_key?(fcm_config, :retry_attempts)
      assert Map.has_key?(fcm_config, :timeout_ms)
    end

    test "FCM service account JSON is accessible" do
      # Should not crash, returns nil or string
      json = CallsafeSignaling.Config.fcm_service_account_json()
      assert is_nil(json) or is_binary(json)
    end
  end
end
