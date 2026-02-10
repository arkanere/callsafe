defmodule CallsafeSignaling.Protocol.ValidatorTest do
  use ExUnit.Case, async: true

  alias CallsafeSignaling.Protocol.Validator

  describe "validate/2 for call:initiate" do
    test "accepts valid message" do
      payload = %{
        "callAttemptId" => "550e8400-e29b-41d4-a716-446655440000",
        "handle" => "support",
        "callType" => "voice",
        "mediaCapabilities" => %{
          "canSend" => ["audio"],
          "canReceive" => ["audio"]
        }
      }

      assert :ok = Validator.validate("call:initiate", payload)
    end

    test "rejects missing required fields" do
      payload = %{
        "handle" => "support",
        "callType" => "voice"
      }

      assert {:error, errors} = Validator.validate("call:initiate", payload)
      assert Enum.any?(errors, &String.contains?(&1, "Missing required fields"))
    end

    test "rejects invalid UUID format" do
      payload = %{
        "callAttemptId" => "not-a-uuid",
        "handle" => "support",
        "callType" => "voice",
        "mediaCapabilities" => %{"canSend" => ["audio"], "canReceive" => ["audio"]}
      }

      assert {:error, errors} = Validator.validate("call:initiate", payload)
      assert Enum.any?(errors, &String.contains?(&1, "Invalid UUID format"))
    end

    test "rejects invalid call type" do
      payload = %{
        "callAttemptId" => "550e8400-e29b-41d4-a716-446655440000",
        "handle" => "support",
        "callType" => "invalid",
        "mediaCapabilities" => %{"canSend" => ["audio"], "canReceive" => ["audio"]}
      }

      assert {:error, errors} = Validator.validate("call:initiate", payload)
      assert Enum.any?(errors, &String.contains?(&1, "Invalid call type"))
    end
  end

  describe "validate/2 for device:connect" do
    test "accepts valid message" do
      payload = %{
        "deviceType" => "mobile",
        "deviceId" => "device-123",
        "protocolVersion" => "1.0.0"
      }

      assert :ok = Validator.validate("device:connect", payload)
    end

    test "rejects invalid device type" do
      payload = %{
        "deviceType" => "tablet",
        "deviceId" => "device-123"
      }

      assert {:error, errors} = Validator.validate("device:connect", payload)
      assert Enum.any?(errors, &String.contains?(&1, "Invalid device type"))
    end
  end

  describe "validate/2 for media:toggle" do
    test "accepts valid message" do
      payload = %{
        "callAttemptId" => "550e8400-e29b-41d4-a716-446655440000",
        "action" => "enable_camera",
        "success" => true
      }

      assert :ok = Validator.validate("media:toggle", payload)
    end

    test "rejects invalid toggle action" do
      payload = %{
        "callAttemptId" => "550e8400-e29b-41d4-a716-446655440000",
        "action" => "invalid_action",
        "success" => true
      }

      assert {:error, errors} = Validator.validate("media:toggle", payload)
      assert Enum.any?(errors, &String.contains?(&1, "Invalid media toggle action"))
    end

    test "rejects non-boolean success field" do
      payload = %{
        "callAttemptId" => "550e8400-e29b-41d4-a716-446655440000",
        "action" => "enable_camera",
        "success" => "yes"
      }

      assert {:error, errors} = Validator.validate("media:toggle", payload)
      assert Enum.any?(errors, &String.contains?(&1, "must be a boolean"))
    end
  end

  describe "validate/2 for invalid message type" do
    test "rejects unknown message type" do
      payload = %{}
      assert {:error, errors} = Validator.validate("unknown:type", payload)
      assert Enum.any?(errors, &String.contains?(&1, "Invalid message type"))
    end
  end
end
