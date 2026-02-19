defmodule CallsafeSignaling.E2E.CallLifecycleTest do
  @moduledoc """
  E2E tests for basic call lifecycle: happy path, reject, unavailable.
  """

  use ExUnit.Case, async: false

  import CallsafeSignaling.E2E.CallFixtures
  alias CallsafeSignaling.E2E.TestClient

  setup_all do
    Application.put_env(:callsafe_signaling, :jwt_secret, "test_secret_for_e2e")
    Application.put_env(:callsafe_signaling, :http_port, 4001)
    :ok = CallsafeSignaling.E2E.AppLifecycle.start()
    on_exit(fn -> CallsafeSignaling.E2E.AppLifecycle.stop() end)
    :ok
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

      :ok = TestClient.send_message(caller, call_initiate(call_id))

      caller_inc = TestClient.assert_receive_type(caller, "call:incoming")
      assert caller_inc["callAttemptId"] == call_id
      assert caller_inc["devicesNotified"] == 1

      callee_inc = TestClient.assert_receive_type(callee, "call:incoming")
      assert callee_inc["callAttemptId"] == call_id
      assert callee_inc["sourceId"] == caller_id
      assert callee_inc["callType"] == "voice"

      :ok = TestClient.send_message(callee, call_accept(call_id, callee_id))

      callee_accepted = TestClient.assert_receive_type(callee, "call:accepted")
      assert callee_accepted["callAttemptId"] == call_id
      assert callee_accepted["acceptingDevice"] == callee_id

      caller_accepted = TestClient.assert_receive_type(caller, "call:accepted")
      assert caller_accepted["callAttemptId"] == call_id

      :ok = TestClient.send_message(caller, webrtc_offer(call_id))

      callee_offer = TestClient.assert_receive_type(callee, "webrtc:offer")
      assert callee_offer["callAttemptId"] == call_id
      assert is_binary(callee_offer["sdp"])

      :ok = TestClient.send_message(callee, webrtc_answer(call_id))

      caller_answer = TestClient.assert_receive_type(caller, "webrtc:answer")
      assert caller_answer["callAttemptId"] == call_id
      assert is_binary(caller_answer["sdp"])

      :ok = TestClient.send_message(caller, webrtc_ice(call_id))

      callee_ice = TestClient.assert_receive_type(callee, "webrtc:ice-candidate")
      assert callee_ice["callAttemptId"] == call_id
      assert is_map(callee_ice["candidate"])

      :ok = TestClient.send_message(callee, webrtc_ice(call_id))

      caller_ice = TestClient.assert_receive_type(caller, "webrtc:ice-candidate")
      assert caller_ice["callAttemptId"] == call_id
      assert is_map(caller_ice["candidate"])

      :ok = TestClient.send_message(caller, call_end(call_id))

      caller_ended = TestClient.assert_receive_type(caller, "call:ended")
      assert caller_ended["callAttemptId"] == call_id

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

      callee_cancelled = TestClient.assert_receive_type(callee, "call:cancelled")
      assert callee_cancelled["callAttemptId"] == call_id
      assert callee_cancelled["reason"] == "rejected"

      caller_unavailable = TestClient.assert_receive_type(caller, "call:unavailable")
      assert caller_unavailable["callAttemptId"] == call_id

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

      :ok = TestClient.send_message(caller, call_initiate(call_id))

      error_msg = TestClient.assert_receive_type(caller, "error")
      assert error_msg["error"] == "no_devices"

      TestClient.disconnect(caller)
    end
  end
end
