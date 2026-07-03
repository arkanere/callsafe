defmodule CallsafeSignaling.Protocol.ValidatorTest do
  use ExUnit.Case, async: true

  alias CallsafeSignaling.Protocol.Validator

  @uuid "550e8400-e29b-41d4-a716-446655440000"

  describe "validate/2 for call:initiate" do
    test "accepts valid message" do
      payload = %{
        "callAttemptId" => @uuid,
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
      assert Enum.any?(errors, &String.contains?(&1, "UUIDv4"))
    end

    test "rejects non-v4 UUIDs (UUIDv4-strict)" do
      # Valid UUID shape but version 1
      payload = %{
        "callAttemptId" => "550e8400-e29b-11d4-a716-446655440000",
        "handle" => "support",
        "callType" => "voice",
        "mediaCapabilities" => %{"canSend" => ["audio"], "canReceive" => ["audio"]}
      }

      assert {:error, errors} = Validator.validate("call:initiate", payload)
      assert Enum.any?(errors, &String.contains?(&1, "UUIDv4"))
    end

    test "rejects invalid call type" do
      payload = %{
        "callAttemptId" => @uuid,
        "handle" => "support",
        "callType" => "invalid",
        "mediaCapabilities" => %{"canSend" => ["audio"], "canReceive" => ["audio"]}
      }

      assert {:error, errors} = Validator.validate("call:initiate", payload)
      assert Enum.any?(errors, fn e -> String.contains?(e, "callType") end)
    end

    test "rejects mediaCapabilities without arrays" do
      payload = %{
        "callAttemptId" => @uuid,
        "handle" => "support",
        "callType" => "voice",
        "mediaCapabilities" => %{"canSend" => true, "canReceive" => ["audio"]}
      }

      assert {:error, errors} = Validator.validate("call:initiate", payload)
      assert Enum.any?(errors, &String.contains?(&1, "mediaCapabilities"))
    end
  end

  describe "validate/2 for device:connect" do
    test "accepts valid v2 message (token + protocolVersion required)" do
      payload = %{
        "deviceType" => "mobile",
        "deviceId" => "device-123",
        "token" => "a.b.c",
        "protocolVersion" => "2.0.0"
      }

      assert :ok = Validator.validate("device:connect", payload)
    end

    test "rejects missing token and protocolVersion (v2 breaking change)" do
      payload = %{
        "deviceType" => "web",
        "deviceId" => "device-123"
      }

      assert {:error, errors} = Validator.validate("device:connect", payload)
      assert Enum.any?(errors, &String.contains?(&1, "protocolVersion"))
      assert Enum.any?(errors, &String.contains?(&1, "token"))
    end

    test "rejects invalid device type" do
      payload = %{
        "deviceType" => "tablet",
        "deviceId" => "device-123",
        "token" => "a.b.c",
        "protocolVersion" => "2.0.0"
      }

      assert {:error, errors} = Validator.validate("device:connect", payload)
      assert Enum.any?(errors, &String.contains?(&1, "deviceType"))
    end
  end

  describe "validate/2 for media:toggle" do
    test "accepts valid message (no success field in v2)" do
      payload = %{
        "callAttemptId" => @uuid,
        "action" => "enable_camera"
      }

      assert :ok = Validator.validate("media:toggle", payload)
    end

    test "rejects invalid toggle action" do
      payload = %{
        "callAttemptId" => @uuid,
        "action" => "invalid_action"
      }

      assert {:error, errors} = Validator.validate("media:toggle", payload)
      assert Enum.any?(errors, &String.contains?(&1, "action"))
    end
  end

  describe "validate/2 for webrtc messages" do
    test "accepts object-form offer (SessionDescription)" do
      payload = %{
        "callAttemptId" => @uuid,
        "offer" => %{"type" => "offer", "sdp" => "v=0..."}
      }

      assert :ok = Validator.validate("webrtc:offer", payload)
    end

    test "rejects flat-string offer (v1 shape)" do
      payload = %{
        "callAttemptId" => @uuid,
        "offer" => "v=0..."
      }

      assert {:error, errors} = Validator.validate("webrtc:offer", payload)
      assert Enum.any?(errors, &String.contains?(&1, "SessionDescription"))
    end

    test "accepts ICE candidate with null sdpMid/sdpMLineIndex" do
      payload = %{
        "callAttemptId" => @uuid,
        "candidate" => %{
          "candidate" => "candidate:0 1 udp ...",
          "sdpMid" => nil,
          "sdpMLineIndex" => nil
        }
      }

      assert :ok = Validator.validate("webrtc:ice-candidate", payload)
    end

    test "accepts empty candidate string (end-of-candidates)" do
      payload = %{
        "callAttemptId" => @uuid,
        "candidate" => %{
          "candidate" => "",
          "sdpMid" => "0",
          "sdpMLineIndex" => 0
        }
      }

      assert :ok = Validator.validate("webrtc:ice-candidate", payload)
    end

    test "rejects ICE candidate missing required nullable fields" do
      payload = %{
        "callAttemptId" => @uuid,
        "candidate" => %{"candidate" => "candidate:0 ..."}
      }

      assert {:error, errors} = Validator.validate("webrtc:ice-candidate", payload)
      assert Enum.any?(errors, &String.contains?(&1, "candidate"))
    end
  end

  describe "validate/2 for v2 system messages" do
    test "ping accepts an empty payload" do
      assert :ok = Validator.validate("ping", %{"type" => "ping"})
    end

    test "call:failed requires an enum reason" do
      assert :ok =
               Validator.validate("call:failed", %{
                 "callAttemptId" => @uuid,
                 "reason" => "media_permission_denied"
               })

      assert {:error, _} =
               Validator.validate("call:failed", %{
                 "callAttemptId" => @uuid,
                 "reason" => "because"
               })
    end
  end

  describe "validate/2 for invalid message type" do
    test "rejects unknown message type" do
      payload = %{}
      assert {:error, errors} = Validator.validate("unknown:type", payload)
      assert Enum.any?(errors, &String.contains?(&1, "Invalid message type"))
    end

    test "rejects v1 pseudo-message types" do
      assert {:error, _} = Validator.validate("open", %{})
      assert {:error, _} = Validator.validate("close", %{})
    end
  end
end
