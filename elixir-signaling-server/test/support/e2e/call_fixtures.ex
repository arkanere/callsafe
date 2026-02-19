defmodule CallsafeSignaling.E2E.CallFixtures do
  @moduledoc false

  # Unique string to prevent cross-test ETS collisions.
  def uid(prefix), do: "#{prefix}_#{System.unique_integer([:positive])}"

  # callAttemptId must be a valid UUID (validated by the protocol layer).
  def call_uuid, do: UUID.uuid4()

  def call_initiate(call_id) do
    %{
      "type" => "call:initiate",
      "callAttemptId" => call_id,
      "handle" => "test_business",
      "callType" => "voice",
      "mediaCapabilities" => %{
        "canSend" => ["audio"],
        "canReceive" => ["audio"]
      }
    }
  end

  def call_accept(call_id, callee_id) do
    %{
      "type" => "call:accept",
      "callAttemptId" => call_id,
      "deviceType" => "web",
      "deviceId" => callee_id
    }
  end

  def call_reject(call_id) do
    %{
      "type" => "call:reject",
      "callAttemptId" => call_id,
      "deviceType" => "web"
    }
  end

  def call_end(call_id) do
    %{
      "type" => "call:end",
      "callAttemptId" => call_id,
      "initiator" => "customer"
    }
  end

  def webrtc_offer(call_id) do
    %{
      "type" => "webrtc:offer",
      "callAttemptId" => call_id,
      "sdp" => "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"
    }
  end

  def webrtc_answer(call_id) do
    %{
      "type" => "webrtc:answer",
      "callAttemptId" => call_id,
      "sdp" => "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"
    }
  end

  def webrtc_ice(call_id) do
    %{
      "type" => "webrtc:ice-candidate",
      "callAttemptId" => call_id,
      "candidate" => %{
        "candidate" => "candidate:0 1 udp 2113937151 192.168.1.1 54400 typ host",
        "sdpMLineIndex" => 0,
        "sdpMid" => "audio"
      }
    }
  end
end
