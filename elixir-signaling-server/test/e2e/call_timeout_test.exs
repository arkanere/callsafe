defmodule CallsafeSignaling.E2E.CallTimeoutTest do
  @moduledoc """
  E2E tests for v2 timer behavior: ringing/connecting timeouts (with phase +
  timeoutDuration) and the mid-call reconnect grace window.
  """

  use ExUnit.Case, async: false

  import CallsafeSignaling.E2E.CallFixtures
  alias CallsafeSignaling.E2E.TestClient

  # Timer values must match config/test.exs.
  @ringing_timeout_ms 5_000
  @connecting_timeout_ms 5_000
  @reconnect_grace_ms 2_000
  @timeout_margin_ms 3_000

  setup_all do
    Application.put_env(:callsafe_signaling, :jwt_secret, "test_secret_for_e2e")
    Application.put_env(:callsafe_signaling, :http_port, 4001)

    assert Application.get_env(:callsafe_signaling, :timeout_ringing) == @ringing_timeout_ms,
           "timeout_ringing must be #{@ringing_timeout_ms}ms in test config (config/test.exs)"

    assert Application.get_env(:callsafe_signaling, :timeout_connecting) == @connecting_timeout_ms,
           "timeout_connecting must be #{@connecting_timeout_ms}ms in test config (config/test.exs)"

    assert Application.get_env(:callsafe_signaling, :timeout_reconnect_grace) ==
             @reconnect_grace_ms,
           "timeout_reconnect_grace must be #{@reconnect_grace_ms}ms in test config (config/test.exs)"

    :ok = CallsafeSignaling.E2E.AppLifecycle.start()
    on_exit(fn -> CallsafeSignaling.E2E.AppLifecycle.stop() end)
    :ok
  end

  defp call_pair(biz, caller_id, callee_id) do
    {:ok, caller} = TestClient.connect()
    {:ok, callee} = TestClient.connect()
    TestClient.authenticate(caller, caller_id, biz, role: "customer")
    TestClient.authenticate(callee, callee_id, biz, role: "business")
    {caller, callee}
  end

  describe "call timeouts" do
    @tag timeout: 15_000
    test "ringing timeout: nobody accepts → caller and ringing devices get phase=ringing" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))

      :ok = TestClient.send_message(caller, call_initiate(call_id, biz))
      TestClient.assert_receive_type(caller, "call:initiated")
      TestClient.assert_receive_type(callee, "call:incoming")

      # Nobody accepts — wait for the ringing timer
      wait_ms = @ringing_timeout_ms + @timeout_margin_ms

      caller_timeout = TestClient.assert_receive_type(caller, "call:timeout", wait_ms)
      assert caller_timeout["callAttemptId"] == call_id
      assert caller_timeout["phase"] == "ringing"
      assert caller_timeout["timeoutDuration"] == @ringing_timeout_ms

      callee_timeout = TestClient.assert_receive_type(callee, "call:timeout", @timeout_margin_ms)
      assert callee_timeout["callAttemptId"] == call_id
      assert callee_timeout["phase"] == "ringing"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end

    @tag timeout: 15_000
    test "connecting timeout: accepted but never answers → phase=connecting to both" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))

      :ok = TestClient.send_message(caller, call_initiate(call_id, biz))
      TestClient.assert_receive_type(caller, "call:initiated")
      TestClient.assert_receive_type(callee, "call:incoming")

      # Accept moves the call to :connecting and starts the connecting timer
      :ok = TestClient.send_message(callee, call_accept(call_id))
      TestClient.assert_receive_type(callee, "call:accepted")
      TestClient.assert_receive_type(caller, "call:accepted")

      # Withhold webrtc:answer — wait for the connecting timer
      wait_ms = @connecting_timeout_ms + @timeout_margin_ms

      caller_timeout = TestClient.assert_receive_type(caller, "call:timeout", wait_ms)
      assert caller_timeout["callAttemptId"] == call_id
      assert caller_timeout["phase"] == "connecting"
      assert caller_timeout["timeoutDuration"] == @connecting_timeout_ms

      callee_timeout = TestClient.assert_receive_type(callee, "call:timeout", @timeout_margin_ms)
      assert callee_timeout["phase"] == "connecting"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  describe "mid-call reconnect" do
    @tag timeout: 15_000
    test "participant reconnects within grace → call:reconnected with current state" do
      biz = uid("biz")
      call_id = call_uuid()
      caller_id = uid("caller")
      {caller, callee} = call_pair(biz, caller_id, uid("callee"))

      :ok = TestClient.send_message(caller, call_initiate(call_id, biz))
      TestClient.assert_receive_type(caller, "call:initiated")
      TestClient.assert_receive_type(callee, "call:incoming")
      :ok = TestClient.send_message(callee, call_accept(call_id))
      TestClient.assert_receive_type(callee, "call:accepted")
      TestClient.assert_receive_type(caller, "call:accepted")
      :ok = TestClient.send_message(caller, webrtc_offer(call_id))
      TestClient.assert_receive_type(callee, "webrtc:offer")
      :ok = TestClient.send_message(callee, webrtc_answer(call_id))
      TestClient.assert_receive_type(caller, "webrtc:answer")

      # Caller's socket drops mid-call
      TestClient.disconnect(caller)
      Process.sleep(200)

      # Caller reconnects and re-attaches within the grace window
      {:ok, caller2} = TestClient.connect()
      TestClient.authenticate(caller2, caller_id, biz, role: "customer")
      :ok = TestClient.send_message(caller2, call_reconnect(call_id))

      reconnected = TestClient.assert_receive_type(caller2, "call:reconnected")
      assert reconnected["callAttemptId"] == call_id
      assert reconnected["callState"] == "connected"
      assert reconnected["callType"] == "voice"

      # Signaling is re-bound: the reconnected caller can still hang up
      :ok = TestClient.send_message(caller2, call_end(call_id))
      TestClient.assert_receive_type(caller2, "call:ended")
      TestClient.assert_receive_type(callee, "call:ended")

      TestClient.disconnect(caller2)
      TestClient.disconnect(callee)
    end

    @tag timeout: 15_000
    test "participant never reconnects → survivor gets call:failed(peer_disconnected)" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))

      :ok = TestClient.send_message(caller, call_initiate(call_id, biz))
      TestClient.assert_receive_type(caller, "call:initiated")
      TestClient.assert_receive_type(callee, "call:incoming")
      :ok = TestClient.send_message(callee, call_accept(call_id))
      TestClient.assert_receive_type(callee, "call:accepted")
      TestClient.assert_receive_type(caller, "call:accepted")
      :ok = TestClient.send_message(caller, webrtc_offer(call_id))
      TestClient.assert_receive_type(callee, "webrtc:offer")
      :ok = TestClient.send_message(callee, webrtc_answer(call_id))
      TestClient.assert_receive_type(caller, "webrtc:answer")

      # Caller drops and never comes back
      TestClient.disconnect(caller)

      failed =
        TestClient.assert_receive_type(
          callee,
          "call:failed",
          @reconnect_grace_ms + @timeout_margin_ms
        )

      assert failed["callAttemptId"] == call_id
      assert failed["reason"] == "peer_disconnected"

      TestClient.disconnect(callee)
    end
  end
end
