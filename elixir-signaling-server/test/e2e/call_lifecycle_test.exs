defmodule CallsafeSignaling.E2E.CallLifecycleTest do
  @moduledoc """
  Phase 2 E2E tests: call lifecycle flows against the live server.

  Tests complete call flows through the real WebSocket server using multiple
  TestClient instances playing caller and callee roles.  Covers:
    - Full happy path: initiate → accept → offer → answer → ICE → end
    - Reject: single callee rejects, caller receives unavailable
    - Ringing timeout: callee accepted but WebRTC offer never sent
    - Connecting timeout: offer sent but answer never received
    - Unavailable: no agents online when call initiated
    - Concurrent calls: two simultaneous calls on different businesses
  """

  use ExUnit.Case, async: false

  alias CallsafeSignaling.E2E.TestClient

  # ---------------------------------------------------------------------------
  # Setup: start the full application once for all tests in this module.
  # ---------------------------------------------------------------------------

  setup_all do
    Application.put_env(:callsafe_signaling, :jwt_secret, "test_secret_for_e2e")
    Application.put_env(:callsafe_signaling, :http_port, 4001)

    timeout_ringing = Application.get_env(:callsafe_signaling, :timeout_ringing)
    timeout_connecting = Application.get_env(:callsafe_signaling, :timeout_connecting)

    assert timeout_ringing == 5_000,
           "timeout_ringing must be 5_000ms in test config, got: #{inspect(timeout_ringing)}. " <>
             "Check config/test.exs — if this is nil, test.exs is not being loaded and timeouts default to 30s."

    assert timeout_connecting == 5_000,
           "timeout_connecting must be 5_000ms in test config, got: #{inspect(timeout_connecting)}. " <>
             "Check config/test.exs — if this is nil, test.exs is not being loaded and timeouts default to 30s."

    {:ok, _apps} = Application.ensure_all_started(:callsafe_signaling)
    # Give Cowboy a moment to bind the port.
    Process.sleep(50)

    on_exit(fn ->
      # Clean stop: remove listener from Ranch before stopping the app to prevent
      # Ranch from attempting to restart it and hitting eaddrinuse.
      :cowboy.stop_listener(:http_listener)
      Application.stop(:callsafe_signaling)
    end)

    :ok
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # Generate a unique string to prevent cross-test ETS collisions.
  defp uid(prefix), do: "#{prefix}_#{System.unique_integer([:positive])}"

  # callAttemptId must be a valid UUID (validated by the protocol layer).
  defp call_uuid, do: UUID.uuid4()

  defp call_initiate(call_id) do
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

  defp call_accept(call_id, callee_id) do
    %{
      "type" => "call:accept",
      "callAttemptId" => call_id,
      "deviceType" => "web",
      "deviceId" => callee_id
    }
  end

  defp call_reject(call_id) do
    %{
      "type" => "call:reject",
      "callAttemptId" => call_id,
      "deviceType" => "web"
    }
  end

  defp call_end(call_id) do
    %{
      "type" => "call:end",
      "callAttemptId" => call_id,
      "initiator" => "customer"
    }
  end

  defp webrtc_offer(call_id) do
    %{
      "type" => "webrtc:offer",
      "callAttemptId" => call_id,
      "sdp" => "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"
    }
  end

  defp webrtc_answer(call_id) do
    %{
      "type" => "webrtc:answer",
      "callAttemptId" => call_id,
      "sdp" => "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n"
    }
  end

  defp webrtc_ice(call_id) do
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

  # ---------------------------------------------------------------------------
  # Full happy path
  # ---------------------------------------------------------------------------

  describe "full call lifecycle" do
    test "initiate → accept → offer → answer → ICE candidates → end" do
      biz = uid("biz")
      call_id = call_uuid()
      caller_id = uid("caller")
      callee_id = uid("callee")

      {:ok, caller} = TestClient.connect()
      {:ok, callee} = TestClient.connect()

      TestClient.authenticate(caller, caller_id, biz)
      TestClient.authenticate(callee, callee_id, biz)

      # --- initiate ---
      :ok = TestClient.send_message(caller, call_initiate(call_id))

      # Caller receives call:incoming as acknowledgement
      caller_inc = TestClient.assert_receive_type(caller, "call:incoming")
      assert caller_inc["callAttemptId"] == call_id
      assert caller_inc["devicesNotified"] == 1

      # Callee receives call:incoming as async push
      callee_inc = TestClient.assert_receive_type(callee, "call:incoming")
      assert callee_inc["callAttemptId"] == call_id
      assert callee_inc["sourceId"] == caller_id
      assert callee_inc["callType"] == "voice"

      # --- accept ---
      :ok = TestClient.send_message(callee, call_accept(call_id, callee_id))

      # Callee receives call:accepted as direct response
      callee_accepted = TestClient.assert_receive_type(callee, "call:accepted")
      assert callee_accepted["callAttemptId"] == call_id
      assert callee_accepted["acceptingDevice"] == callee_id

      # Caller receives call:accepted as async notification
      caller_accepted = TestClient.assert_receive_type(caller, "call:accepted")
      assert caller_accepted["callAttemptId"] == call_id

      # --- offer ---
      :ok = TestClient.send_message(caller, webrtc_offer(call_id))

      # Callee receives relayed offer (no echo back to caller)
      callee_offer = TestClient.assert_receive_type(callee, "webrtc:offer")
      assert callee_offer["callAttemptId"] == call_id
      assert is_binary(callee_offer["sdp"])

      # --- answer ---
      :ok = TestClient.send_message(callee, webrtc_answer(call_id))

      # Caller receives relayed answer (no echo back to callee)
      caller_answer = TestClient.assert_receive_type(caller, "webrtc:answer")
      assert caller_answer["callAttemptId"] == call_id
      assert is_binary(caller_answer["sdp"])

      # --- ICE exchange (bidirectional) ---
      :ok = TestClient.send_message(caller, webrtc_ice(call_id))

      callee_ice = TestClient.assert_receive_type(callee, "webrtc:ice-candidate")
      assert callee_ice["callAttemptId"] == call_id
      assert is_map(callee_ice["candidate"])

      :ok = TestClient.send_message(callee, webrtc_ice(call_id))

      caller_ice = TestClient.assert_receive_type(caller, "webrtc:ice-candidate")
      assert caller_ice["callAttemptId"] == call_id
      assert is_map(caller_ice["candidate"])

      # --- end (caller hangs up after WebRTC connected) ---
      :ok = TestClient.send_message(caller, call_end(call_id))

      # Caller receives call:ended as direct response
      caller_ended = TestClient.assert_receive_type(caller, "call:ended")
      assert caller_ended["callAttemptId"] == call_id

      # Callee receives call:ended as async notification
      callee_ended = TestClient.assert_receive_type(callee, "call:ended")
      assert callee_ended["callAttemptId"] == call_id

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # Call reject
  # ---------------------------------------------------------------------------

  describe "call reject" do
    test "single callee rejects → caller receives unavailable" do
      biz = uid("biz")
      call_id = call_uuid()
      caller_id = uid("caller")
      callee_id = uid("callee")

      {:ok, caller} = TestClient.connect()
      {:ok, callee} = TestClient.connect()

      TestClient.authenticate(caller, caller_id, biz)
      TestClient.authenticate(callee, callee_id, biz)

      :ok = TestClient.send_message(caller, call_initiate(call_id))
      TestClient.assert_receive_type(caller, "call:incoming")
      TestClient.assert_receive_type(callee, "call:incoming")

      :ok = TestClient.send_message(callee, call_reject(call_id))

      # Callee receives call:cancelled as direct response to reject
      callee_cancelled = TestClient.assert_receive_type(callee, "call:cancelled")
      assert callee_cancelled["callAttemptId"] == call_id
      assert callee_cancelled["reason"] == "rejected"

      # Caller receives call:unavailable — no remaining devices
      caller_unavailable = TestClient.assert_receive_type(caller, "call:unavailable")
      assert caller_unavailable["callAttemptId"] == call_id

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # Timeouts
  # ---------------------------------------------------------------------------

  # Ringing timeout is 5s in test config (timeout_ringing: 5_000).
  # Allow 8s for the timeout to fire plus a margin for delivery.
  @ringing_timeout_ms 5_000
  @timeout_margin_ms 3_000

  describe "call timeouts" do
    @tag timeout: 15_000
    test "ringing timeout: callee accepted but caller never sends webrtc:offer" do
      biz = uid("biz")
      call_id = call_uuid()
      caller_id = uid("caller")
      callee_id = uid("callee")

      {:ok, caller} = TestClient.connect()
      {:ok, callee} = TestClient.connect()

      TestClient.authenticate(caller, caller_id, biz)
      TestClient.authenticate(callee, callee_id, biz)

      :ok = TestClient.send_message(caller, call_initiate(call_id))
      TestClient.assert_receive_type(caller, "call:incoming")
      TestClient.assert_receive_type(callee, "call:incoming")

      # Callee accepts — call enters :ringing state, ringing timer starts
      :ok = TestClient.send_message(callee, call_accept(call_id, callee_id))
      TestClient.assert_receive_type(callee, "call:accepted")
      TestClient.assert_receive_type(caller, "call:accepted")

      # Intentionally withhold webrtc:offer — wait for ringing timeout
      wait_ms = @ringing_timeout_ms + @timeout_margin_ms

      caller_timeout = TestClient.assert_receive_type(caller, "call:timeout", wait_ms)
      assert caller_timeout["callAttemptId"] == call_id

      callee_timeout = TestClient.assert_receive_type(callee, "call:timeout", @timeout_margin_ms)
      assert callee_timeout["callAttemptId"] == call_id

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end

    @tag timeout: 15_000
    test "connecting timeout: offer sent but callee never sends webrtc:answer" do
      biz = uid("biz")
      call_id = call_uuid()
      caller_id = uid("caller")
      callee_id = uid("callee")

      {:ok, caller} = TestClient.connect()
      {:ok, callee} = TestClient.connect()

      TestClient.authenticate(caller, caller_id, biz)
      TestClient.authenticate(callee, callee_id, biz)

      :ok = TestClient.send_message(caller, call_initiate(call_id))
      TestClient.assert_receive_type(caller, "call:incoming")
      TestClient.assert_receive_type(callee, "call:incoming")

      :ok = TestClient.send_message(callee, call_accept(call_id, callee_id))
      TestClient.assert_receive_type(callee, "call:accepted")
      TestClient.assert_receive_type(caller, "call:accepted")

      # Offer sent — call enters :connecting state, connecting timer starts
      :ok = TestClient.send_message(caller, webrtc_offer(call_id))
      TestClient.assert_receive_type(callee, "webrtc:offer")

      # Intentionally withhold webrtc:answer — wait for connecting timeout
      wait_ms = @ringing_timeout_ms + @timeout_margin_ms

      caller_timeout = TestClient.assert_receive_type(caller, "call:timeout", wait_ms)
      assert caller_timeout["callAttemptId"] == call_id

      callee_timeout = TestClient.assert_receive_type(callee, "call:timeout", @timeout_margin_ms)
      assert callee_timeout["callAttemptId"] == call_id

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # No available devices
  # ---------------------------------------------------------------------------

  describe "call unavailable" do
    test "caller initiates when no other devices are online → error response" do
      biz = uid("biz")
      call_id = call_uuid()
      caller_id = uid("caller")

      {:ok, caller} = TestClient.connect()
      TestClient.authenticate(caller, caller_id, biz)

      # Only the caller is registered — no agents available
      :ok = TestClient.send_message(caller, call_initiate(call_id))

      error_msg = TestClient.assert_receive_type(caller, "error")
      assert error_msg["error"] == "no_devices"

      TestClient.disconnect(caller)
    end
  end

  # ---------------------------------------------------------------------------
  # Concurrent calls
  # ---------------------------------------------------------------------------

  describe "concurrent calls" do
    test "two simultaneous calls on separate businesses do not interfere" do
      biz_a = uid("biz_a")
      biz_b = uid("biz_b")
      call_a = call_uuid()
      call_b = call_uuid()
      caller_a_id = uid("caller_a")
      callee_a_id = uid("callee_a")
      caller_b_id = uid("caller_b")
      callee_b_id = uid("callee_b")

      {:ok, caller_a} = TestClient.connect()
      {:ok, callee_a} = TestClient.connect()
      {:ok, caller_b} = TestClient.connect()
      {:ok, callee_b} = TestClient.connect()

      TestClient.authenticate(caller_a, caller_a_id, biz_a)
      TestClient.authenticate(callee_a, callee_a_id, biz_a)
      TestClient.authenticate(caller_b, caller_b_id, biz_b)
      TestClient.authenticate(callee_b, callee_b_id, biz_b)

      # Both callers initiate
      :ok = TestClient.send_message(caller_a, call_initiate(call_a))
      :ok = TestClient.send_message(caller_b, call_initiate(call_b))

      # Each caller gets its own call:incoming — correct callAttemptId
      inc_a = TestClient.assert_receive_type(caller_a, "call:incoming")
      assert inc_a["callAttemptId"] == call_a

      inc_b = TestClient.assert_receive_type(caller_b, "call:incoming")
      assert inc_b["callAttemptId"] == call_b

      # Each callee gets notified of its own call only
      callee_a_inc = TestClient.assert_receive_type(callee_a, "call:incoming")
      assert callee_a_inc["callAttemptId"] == call_a
      assert callee_a_inc["sourceId"] == caller_a_id

      callee_b_inc = TestClient.assert_receive_type(callee_b, "call:incoming")
      assert callee_b_inc["callAttemptId"] == call_b
      assert callee_b_inc["sourceId"] == caller_b_id

      # Both calls accepted
      :ok = TestClient.send_message(callee_a, call_accept(call_a, callee_a_id))
      :ok = TestClient.send_message(callee_b, call_accept(call_b, callee_b_id))

      TestClient.assert_receive_type(callee_a, "call:accepted")
      TestClient.assert_receive_type(caller_a, "call:accepted")
      TestClient.assert_receive_type(callee_b, "call:accepted")
      TestClient.assert_receive_type(caller_b, "call:accepted")

      # WebRTC exchange on both calls
      :ok = TestClient.send_message(caller_a, webrtc_offer(call_a))
      :ok = TestClient.send_message(caller_b, webrtc_offer(call_b))

      # Each callee gets only its own offer — no cross-contamination
      offer_a = TestClient.assert_receive_type(callee_a, "webrtc:offer")
      assert offer_a["callAttemptId"] == call_a

      offer_b = TestClient.assert_receive_type(callee_b, "webrtc:offer")
      assert offer_b["callAttemptId"] == call_b

      # Answers
      :ok = TestClient.send_message(callee_a, webrtc_answer(call_a))
      :ok = TestClient.send_message(callee_b, webrtc_answer(call_b))

      answer_a = TestClient.assert_receive_type(caller_a, "webrtc:answer")
      assert answer_a["callAttemptId"] == call_a

      answer_b = TestClient.assert_receive_type(caller_b, "webrtc:answer")
      assert answer_b["callAttemptId"] == call_b

      # Both calls ended independently
      :ok = TestClient.send_message(caller_a, call_end(call_a))
      :ok = TestClient.send_message(caller_b, call_end(call_b))

      ended_a = TestClient.assert_receive_type(caller_a, "call:ended")
      assert ended_a["callAttemptId"] == call_a

      ended_b = TestClient.assert_receive_type(caller_b, "call:ended")
      assert ended_b["callAttemptId"] == call_b

      # Peers notified
      callee_a_ended = TestClient.assert_receive_type(callee_a, "call:ended")
      assert callee_a_ended["callAttemptId"] == call_a

      callee_b_ended = TestClient.assert_receive_type(callee_b, "call:ended")
      assert callee_b_ended["callAttemptId"] == call_b

      # Verify no cross-contamination: biz_b messages never reached biz_a clients
      assert [] = TestClient.drain(caller_a)
      assert [] = TestClient.drain(callee_a)
      assert [] = TestClient.drain(caller_b)
      assert [] = TestClient.drain(callee_b)

      TestClient.disconnect(caller_a)
      TestClient.disconnect(callee_a)
      TestClient.disconnect(caller_b)
      TestClient.disconnect(callee_b)
    end
  end
end
