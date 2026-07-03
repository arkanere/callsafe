defmodule CallsafeSignaling.E2E.CallLifecycleTest do
  @moduledoc """
  E2E tests for the v2 call lifecycle: happy path, cancel, reject,
  unavailable, escalation, downgrade.
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

  # Open + authenticate a customer caller and a business callee for `biz`.
  defp call_pair(biz, caller_id, callee_id) do
    {:ok, caller} = TestClient.connect()
    {:ok, callee} = TestClient.connect()
    TestClient.authenticate(caller, caller_id, biz, role: "customer")
    TestClient.authenticate(callee, callee_id, biz, role: "business")
    {caller, callee}
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
      {caller, callee} = call_pair(biz, caller_id, callee_id)

      :ok = TestClient.send_message(caller, call_initiate(call_id, biz))

      # v2: the caller gets call:initiated (not an echo of call:incoming)
      initiated = TestClient.assert_receive_type(caller, "call:initiated")
      assert initiated["callAttemptId"] == call_id
      assert initiated["devicesNotified"] == 1

      callee_inc = TestClient.assert_receive_type(callee, "call:incoming")
      assert callee_inc["callAttemptId"] == call_id
      assert callee_inc["sourceId"] == caller_id
      assert callee_inc["callType"] == "voice"
      # v2: caller capabilities travel with the ring
      assert callee_inc["mediaCapabilities"]["canSend"] == ["audio"]

      :ok = TestClient.send_message(callee, call_accept(call_id))

      # v2: call:accepted goes to caller AND acceptor, with acceptingDeviceId
      callee_accepted = TestClient.assert_receive_type(callee, "call:accepted")
      assert callee_accepted["callAttemptId"] == call_id
      assert callee_accepted["acceptingDeviceId"] == callee_id

      caller_accepted = TestClient.assert_receive_type(caller, "call:accepted")
      assert caller_accepted["acceptingDeviceId"] == callee_id

      :ok = TestClient.send_message(caller, webrtc_offer(call_id))

      # v2: offer/answer are relayed verbatim as SessionDescription objects
      callee_offer = TestClient.assert_receive_type(callee, "webrtc:offer")
      assert callee_offer["callAttemptId"] == call_id
      assert callee_offer["offer"]["type"] == "offer"
      assert is_binary(callee_offer["offer"]["sdp"])

      :ok = TestClient.send_message(callee, webrtc_answer(call_id))

      caller_answer = TestClient.assert_receive_type(caller, "webrtc:answer")
      assert caller_answer["callAttemptId"] == call_id
      assert caller_answer["answer"]["type"] == "answer"

      :ok = TestClient.send_message(caller, webrtc_ice(call_id))

      callee_ice = TestClient.assert_receive_type(callee, "webrtc:ice-candidate")
      assert callee_ice["callAttemptId"] == call_id
      assert is_map(callee_ice["candidate"])

      :ok = TestClient.send_message(callee, webrtc_ice(call_id))

      caller_ice = TestClient.assert_receive_type(caller, "webrtc:ice-candidate")
      assert caller_ice["callAttemptId"] == call_id

      :ok = TestClient.send_message(caller, call_end(call_id))

      # v2: call:ended carries reason + endedBy
      caller_ended = TestClient.assert_receive_type(caller, "call:ended")
      assert caller_ended["callAttemptId"] == call_id
      assert caller_ended["reason"] == "customer_hangup"
      assert caller_ended["endedBy"] == "customer"
      assert is_number(caller_ended["duration"])

      callee_ended = TestClient.assert_receive_type(callee, "call:ended")
      assert callee_ended["endedBy"] == "customer"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # Heartbeat & protocol gates
  # ---------------------------------------------------------------------------

  describe "transport gates" do
    test "ping is answered with pong, even before authentication" do
      {:ok, client} = TestClient.connect()

      :ok = TestClient.send_message(client, %{"type" => "ping"})
      assert TestClient.assert_receive_type(client, "pong")

      TestClient.disconnect(client)
    end

    test "messages before device:connect are rejected with not_authenticated" do
      {:ok, client} = TestClient.connect()

      :ok = TestClient.send_message(client, %{"type" => "device:status", "status" => "available"})

      error = TestClient.assert_receive_type(client, "error")
      assert error["code"] == "not_authenticated"
      assert error["relatedType"] == "device:status"
      assert is_number(error["timestamp"])

      TestClient.disconnect(client)
    end

    test "deviceId not matching the token claim is rejected with device_mismatch" do
      {:ok, client} = TestClient.connect()

      token =
        CallsafeSignaling.Auth.JWT.generate(
          "other-device",
          uid("biz"),
          "business",
          "test_secret_for_e2e"
        )

      :ok =
        TestClient.send_message(client, %{
          "type" => "device:connect",
          "deviceId" => uid("dev"),
          "deviceType" => "web",
          "token" => token,
          "protocolVersion" => "2.0.0"
        })

      error = TestClient.assert_receive_type(client, "error")
      assert error["code"] == "device_mismatch"

      TestClient.disconnect(client)
    end

    test "protocol major version mismatch is rejected with protocol_incompatible" do
      {:ok, client} = TestClient.connect()

      device_id = uid("dev")

      token =
        CallsafeSignaling.Auth.JWT.generate(
          device_id,
          uid("biz"),
          "business",
          "test_secret_for_e2e"
        )

      :ok =
        TestClient.send_message(client, %{
          "type" => "device:connect",
          "deviceId" => device_id,
          "deviceType" => "web",
          "token" => token,
          "protocolVersion" => "1.0.0"
        })

      error = TestClient.assert_receive_type(client, "error")
      assert error["code"] == "protocol_incompatible"

      TestClient.disconnect(client)
    end

    test "customers may not send business-role messages" do
      biz = uid("biz")
      {:ok, client} = TestClient.connect()
      TestClient.authenticate(client, uid("cust"), biz, role: "customer")

      :ok = TestClient.send_message(client, %{"type" => "device:status", "status" => "available"})

      error = TestClient.assert_receive_type(client, "error")
      assert error["code"] == "not_authorized"

      TestClient.disconnect(client)
    end
  end

  # ---------------------------------------------------------------------------
  # Caller cancel (this crashed the v1 handler via call:end during ringing)
  # ---------------------------------------------------------------------------

  describe "caller cancel" do
    test "call:cancel during ringing cancels the call on all devices" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))

      :ok = TestClient.send_message(caller, call_initiate(call_id, biz))
      TestClient.assert_receive_type(caller, "call:initiated")
      TestClient.assert_receive_type(callee, "call:incoming")

      :ok = TestClient.send_message(caller, call_cancel(call_id))

      caller_cancelled = TestClient.assert_receive_type(caller, "call:cancelled")
      assert caller_cancelled["reason"] == "cancelled_by_caller"

      callee_cancelled = TestClient.assert_receive_type(callee, "call:cancelled")
      assert callee_cancelled["callAttemptId"] == call_id
      assert callee_cancelled["reason"] == "cancelled_by_caller"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # Call reject
  # ---------------------------------------------------------------------------

  describe "call reject" do
    test "single callee rejects → caller receives unavailable(all_devices_rejected)" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))

      :ok = TestClient.send_message(caller, call_initiate(call_id, biz))
      TestClient.assert_receive_type(caller, "call:initiated")
      TestClient.assert_receive_type(callee, "call:incoming")

      :ok = TestClient.send_message(callee, call_reject(call_id))

      caller_unavailable = TestClient.assert_receive_type(caller, "call:unavailable")
      assert caller_unavailable["callAttemptId"] == call_id
      assert caller_unavailable["reason"] == "all_devices_rejected"

      # v2: the rejector receives nothing back
      assert TestClient.drain(callee) == []

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # Video call lifecycle
  # ---------------------------------------------------------------------------

  describe "video call lifecycle" do
    test "initiate video call → call:incoming includes callType: video" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))

      :ok = TestClient.send_message(caller, call_initiate_video(call_id, biz))

      TestClient.assert_receive_type(caller, "call:initiated")

      callee_inc = TestClient.assert_receive_type(callee, "call:incoming")
      assert callee_inc["callAttemptId"] == call_id
      assert callee_inc["callType"] == "video"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # Media toggle
  # ---------------------------------------------------------------------------

  describe "media toggle" do
    defp connected_call(biz, call_id, caller, callee) do
      :ok = TestClient.send_message(caller, call_initiate_video(call_id, biz))
      TestClient.assert_receive_type(caller, "call:initiated")
      TestClient.assert_receive_type(callee, "call:incoming")

      :ok = TestClient.send_message(callee, call_accept(call_id))
      TestClient.assert_receive_type(callee, "call:accepted")
      TestClient.assert_receive_type(caller, "call:accepted")

      :ok = TestClient.send_message(caller, webrtc_offer(call_id))
      TestClient.assert_receive_type(callee, "webrtc:offer")
      :ok = TestClient.send_message(callee, webrtc_answer(call_id))
      TestClient.assert_receive_type(caller, "webrtc:answer")
    end

    test "disable_camera relayed to peer (no success field in v2)" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))
      connected_call(biz, call_id, caller, callee)

      :ok = TestClient.send_message(caller, media_toggle(call_id, "disable_camera"))

      callee_toggle = TestClient.assert_receive_type(callee, "media:toggle")
      assert callee_toggle["callAttemptId"] == call_id
      assert callee_toggle["action"] == "disable_camera"
      refute Map.has_key?(callee_toggle, "success")

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end

    test "callee can toggle camera and caller receives it" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))
      connected_call(biz, call_id, caller, callee)

      :ok = TestClient.send_message(callee, media_toggle(call_id, "disable_camera"))

      caller_toggle = TestClient.assert_receive_type(caller, "media:toggle")
      assert caller_toggle["callAttemptId"] == call_id
      assert caller_toggle["action"] == "disable_camera"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # Escalation & downgrade
  # ---------------------------------------------------------------------------

  describe "escalation" do
    defp connected_voice_call(biz, call_id, caller, callee) do
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
    end

    test "escalate → accept → both get escalation:accepted → requester renegotiates" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))
      connected_voice_call(biz, call_id, caller, callee)

      :ok = TestClient.send_message(caller, call_escalate(call_id))

      requested = TestClient.assert_receive_type(callee, "escalation:requested")
      assert requested["callAttemptId"] == call_id
      assert requested["requestedBy"] == "customer"
      assert is_map(requested["mediaCapabilities"])

      :ok = TestClient.send_message(callee, escalation_accept(call_id))

      caller_acc = TestClient.assert_receive_type(caller, "escalation:accepted")
      assert caller_acc["callAttemptId"] == call_id
      callee_acc = TestClient.assert_receive_type(callee, "escalation:accepted")
      assert callee_acc["callAttemptId"] == call_id

      # The requester (caller) renegotiates
      :ok = TestClient.send_message(caller, webrtc_offer(call_id))
      TestClient.assert_receive_type(callee, "webrtc:offer")
      :ok = TestClient.send_message(callee, webrtc_answer(call_id))
      TestClient.assert_receive_type(caller, "webrtc:answer")

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end

    test "escalate → reject → requester gets escalation:rejected(declined)" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))
      connected_voice_call(biz, call_id, caller, callee)

      :ok = TestClient.send_message(caller, call_escalate(call_id))
      TestClient.assert_receive_type(callee, "escalation:requested")

      :ok = TestClient.send_message(callee, escalation_reject(call_id))

      rejected = TestClient.assert_receive_type(caller, "escalation:rejected")
      assert rejected["callAttemptId"] == call_id
      assert rejected["reason"] == "declined"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end

    test "escalation not answered → requester gets escalation:rejected(timeout)" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))
      connected_voice_call(biz, call_id, caller, callee)

      :ok = TestClient.send_message(caller, call_escalate(call_id))
      TestClient.assert_receive_type(callee, "escalation:requested")

      # test config: timeout_escalation = 5_000
      rejected = TestClient.assert_receive_type(caller, "escalation:rejected", 7_000)
      assert rejected["reason"] == "timeout"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end

    test "downgrade → both get call:downgraded" do
      biz = uid("biz")
      call_id = call_uuid()
      {caller, callee} = call_pair(biz, uid("caller"), uid("callee"))

      :ok = TestClient.send_message(caller, call_initiate_video(call_id, biz))
      TestClient.assert_receive_type(caller, "call:initiated")
      TestClient.assert_receive_type(callee, "call:incoming")
      :ok = TestClient.send_message(callee, call_accept(call_id))
      TestClient.assert_receive_type(callee, "call:accepted")
      TestClient.assert_receive_type(caller, "call:accepted")
      :ok = TestClient.send_message(caller, webrtc_offer(call_id))
      TestClient.assert_receive_type(callee, "webrtc:offer")
      :ok = TestClient.send_message(callee, webrtc_answer(call_id))
      TestClient.assert_receive_type(caller, "webrtc:answer")

      :ok = TestClient.send_message(callee, call_downgrade(call_id))

      caller_down = TestClient.assert_receive_type(caller, "call:downgraded")
      assert caller_down["callAttemptId"] == call_id
      assert caller_down["requestedBy"] == "business"

      callee_down = TestClient.assert_receive_type(callee, "call:downgraded")
      assert callee_down["requestedBy"] == "business"

      TestClient.disconnect(caller)
      TestClient.disconnect(callee)
    end
  end

  # ---------------------------------------------------------------------------
  # No available devices
  # ---------------------------------------------------------------------------

  describe "call unavailable" do
    test "caller initiates when no business devices are online → call:unavailable" do
      biz = uid("biz")
      call_id = call_uuid()

      {:ok, caller} = TestClient.connect()
      TestClient.authenticate(caller, uid("caller"), biz, role: "customer")

      :ok = TestClient.send_message(caller, call_initiate(call_id, biz))

      unavailable = TestClient.assert_receive_type(caller, "call:unavailable")
      assert unavailable["callAttemptId"] == call_id
      assert unavailable["reason"] == "no_devices_available"

      TestClient.disconnect(caller)
    end
  end
end
