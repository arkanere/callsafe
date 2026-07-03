defmodule CallsafeSignaling.E2E.CallFixtures do
  @moduledoc false

  # Unique string to prevent cross-test ETS collisions.
  def uid(prefix), do: "#{prefix}_#{System.unique_integer([:positive])}"

  # callAttemptId must be a valid UUIDv4 (validated by the protocol layer).
  def call_uuid, do: UUID.uuid4()

  # v2: the handle must match the caller token's business scope (business_id).
  def call_initiate(call_id, handle) do
    %{
      "type" => "call:initiate",
      "callAttemptId" => call_id,
      "handle" => handle,
      "callType" => "voice",
      "mediaCapabilities" => %{
        "canSend" => ["audio"],
        "canReceive" => ["audio"]
      }
    }
  end

  def call_initiate_video(call_id, handle) do
    %{
      "type" => "call:initiate",
      "callAttemptId" => call_id,
      "handle" => handle,
      "callType" => "video",
      "mediaCapabilities" => %{
        "canSend" => ["audio", "video"],
        "canReceive" => ["audio", "video"]
      }
    }
  end

  def media_toggle(call_id, action) do
    %{
      "type" => "media:toggle",
      "callAttemptId" => call_id,
      "action" => action
    }
  end

  # v2: identity comes from the connection — no deviceId/deviceType.
  def call_accept(call_id) do
    %{
      "type" => "call:accept",
      "callAttemptId" => call_id,
      "mediaCapabilities" => %{
        "canSend" => ["audio"],
        "canReceive" => ["audio"]
      }
    }
  end

  def call_reject(call_id) do
    %{
      "type" => "call:reject",
      "callAttemptId" => call_id
    }
  end

  def call_cancel(call_id) do
    %{
      "type" => "call:cancel",
      "callAttemptId" => call_id
    }
  end

  # v2: no initiator — the server derives endedBy from the sender's role.
  def call_end(call_id) do
    %{
      "type" => "call:end",
      "callAttemptId" => call_id
    }
  end

  def call_failed(call_id, reason) do
    %{
      "type" => "call:failed",
      "callAttemptId" => call_id,
      "reason" => reason
    }
  end

  def call_reconnect(call_id) do
    %{
      "type" => "call:reconnect",
      "callAttemptId" => call_id
    }
  end

  def call_escalate(call_id) do
    %{
      "type" => "call:escalate",
      "callAttemptId" => call_id,
      "mediaCapabilities" => %{
        "canSend" => ["audio", "video"],
        "canReceive" => ["audio", "video"]
      }
    }
  end

  def escalation_accept(call_id) do
    %{
      "type" => "escalation:accept",
      "callAttemptId" => call_id,
      "mediaCapabilities" => %{
        "canSend" => ["audio", "video"],
        "canReceive" => ["audio", "video"]
      }
    }
  end

  def escalation_reject(call_id) do
    %{
      "type" => "escalation:reject",
      "callAttemptId" => call_id
    }
  end

  def call_downgrade(call_id) do
    %{
      "type" => "call:downgrade",
      "callAttemptId" => call_id
    }
  end

  @sdp "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"

  # v2: offer/answer are SessionDescription objects ({type, sdp}).
  def webrtc_offer(call_id) do
    %{
      "type" => "webrtc:offer",
      "callAttemptId" => call_id,
      "offer" => %{"type" => "offer", "sdp" => @sdp}
    }
  end

  def webrtc_answer(call_id) do
    %{
      "type" => "webrtc:answer",
      "callAttemptId" => call_id,
      "answer" => %{"type" => "answer", "sdp" => @sdp}
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
