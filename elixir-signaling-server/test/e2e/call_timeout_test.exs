defmodule CallsafeSignaling.E2E.CallTimeoutTest do
  @moduledoc """
  E2E tests for ringing and connecting timeout scenarios.
  """

  use ExUnit.Case, async: false

  import CallsafeSignaling.E2E.CallFixtures
  alias CallsafeSignaling.E2E.TestClient

  # Timeout values must match config/test.exs (timeout_ringing: 5_000, timeout_connecting: 5_000).
  @ringing_timeout_ms 5_000
  @timeout_margin_ms 3_000

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

    :ok = CallsafeSignaling.E2E.AppLifecycle.start()
    on_exit(fn -> CallsafeSignaling.E2E.AppLifecycle.stop() end)
    :ok
  end

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
end
