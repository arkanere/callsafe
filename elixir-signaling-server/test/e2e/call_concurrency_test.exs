defmodule CallsafeSignaling.E2E.CallConcurrencyTest do
  @moduledoc """
  E2E tests for multi-party concurrency: busy agent, multi-device accept,
  and same-business / separate-business concurrent calls.

  v2 note: only business-role devices ring; customer devices are never
  notified of other customers' calls.
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

  defp connect_as(device_id, biz, role) do
    {:ok, client} = TestClient.connect()
    TestClient.authenticate(client, device_id, biz, role: role)
    client
  end

  # ---------------------------------------------------------------------------
  # Busy agent (busy detection is deferred — agents keep ringing while on a call)
  # ---------------------------------------------------------------------------

  describe "busy agent" do
    test "agent on active call still receives and can accept a second incoming call" do
      biz = uid("biz")
      call1_id = call_uuid()
      call2_id = call_uuid()

      customer1 = connect_as(uid("customer1"), biz, "customer")
      customer2 = connect_as(uid("customer2"), biz, "customer")
      agent1 = connect_as(uid("agent1"), biz, "business")

      # --- Call 1: customer1 calls, agent1 accepts, full WebRTC handshake ---

      :ok = TestClient.send_message(customer1, call_initiate(call1_id, biz))

      init1 = TestClient.assert_receive_type(customer1, "call:initiated")
      assert init1["callAttemptId"] == call1_id
      # v2: only the business-role agent rings; customer2 is never notified
      assert init1["devicesNotified"] == 1

      TestClient.assert_receive_type(agent1, "call:incoming")

      :ok = TestClient.send_message(agent1, call_accept(call1_id))
      TestClient.assert_receive_type(agent1, "call:accepted")
      TestClient.assert_receive_type(customer1, "call:accepted")

      :ok = TestClient.send_message(customer1, webrtc_offer(call1_id))
      TestClient.assert_receive_type(agent1, "webrtc:offer")

      :ok = TestClient.send_message(agent1, webrtc_answer(call1_id))
      TestClient.assert_receive_type(customer1, "webrtc:answer")

      Process.sleep(50)
      TestClient.drain(customer1)
      TestClient.drain(customer2)
      TestClient.drain(agent1)

      # --- Call 2: customer2 calls while agent1 is on call1 ---

      :ok = TestClient.send_message(customer2, call_initiate(call2_id, biz))

      init2 = TestClient.assert_receive_type(customer2, "call:initiated")
      assert init2["callAttemptId"] == call2_id
      # Busy detection deferred: agent1 rings despite the active call
      assert init2["devicesNotified"] == 1

      agent1_inc2 = TestClient.assert_receive_type(agent1, "call:incoming")
      assert agent1_inc2["callAttemptId"] == call2_id

      :ok = TestClient.send_message(agent1, call_accept(call2_id))

      agent1_accepted2 = TestClient.assert_receive_type(agent1, "call:accepted")
      assert agent1_accepted2["callAttemptId"] == call2_id

      customer2_accepted = TestClient.assert_receive_type(customer2, "call:accepted")
      assert customer2_accepted["callAttemptId"] == call2_id

      # customer1 saw nothing about call2
      assert [] = TestClient.drain(customer1)

      TestClient.disconnect(customer1)
      TestClient.disconnect(customer2)
      TestClient.disconnect(agent1)
    end
  end

  # ---------------------------------------------------------------------------
  # Multi-device accept: first accept wins
  # ---------------------------------------------------------------------------

  describe "multi-device accept" do
    test "first accept wins; other ringing devices get call:cancelled(answered_elsewhere)" do
      biz = uid("biz")
      call_id = call_uuid()
      agent1_id = uid("agent1")

      customer = connect_as(uid("customer"), biz, "customer")
      agent1 = connect_as(agent1_id, biz, "business")
      agent2 = connect_as(uid("agent2"), biz, "business")

      :ok = TestClient.send_message(customer, call_initiate(call_id, biz))

      init = TestClient.assert_receive_type(customer, "call:initiated")
      assert init["devicesNotified"] == 2

      TestClient.assert_receive_type(agent1, "call:incoming")
      TestClient.assert_receive_type(agent2, "call:incoming")

      :ok = TestClient.send_message(agent1, call_accept(call_id))

      accepted = TestClient.assert_receive_type(customer, "call:accepted")
      assert accepted["acceptingDeviceId"] == agent1_id
      TestClient.assert_receive_type(agent1, "call:accepted")

      cancelled = TestClient.assert_receive_type(agent2, "call:cancelled")
      assert cancelled["callAttemptId"] == call_id
      assert cancelled["reason"] == "answered_elsewhere"

      TestClient.disconnect(customer)
      TestClient.disconnect(agent1)
      TestClient.disconnect(agent2)
    end
  end

  # ---------------------------------------------------------------------------
  # Same-business concurrent calls
  # ---------------------------------------------------------------------------

  describe "same-business concurrent calls" do
    test "two calls on one business — WebRTC exchanges don't cross-contaminate, calls end independently" do
      biz = uid("biz")
      call1_id = call_uuid()
      call2_id = call_uuid()

      customer1 = connect_as(uid("customer1"), biz, "customer")
      customer2 = connect_as(uid("customer2"), biz, "customer")
      agent1 = connect_as(uid("agent1"), biz, "business")
      agent2 = connect_as(uid("agent2"), biz, "business")

      # --- Call 1: customer1 calls, both agents ring, agent1 accepts ---

      :ok = TestClient.send_message(customer1, call_initiate(call1_id, biz))

      init1 = TestClient.assert_receive_type(customer1, "call:initiated")
      assert init1["callAttemptId"] == call1_id
      assert init1["devicesNotified"] == 2

      TestClient.assert_receive_type(agent1, "call:incoming")
      TestClient.assert_receive_type(agent2, "call:incoming")

      :ok = TestClient.send_message(agent1, call_accept(call1_id))
      TestClient.assert_receive_type(agent1, "call:accepted")
      TestClient.assert_receive_type(customer1, "call:accepted")

      agent2_cancelled = TestClient.assert_receive_type(agent2, "call:cancelled")
      assert agent2_cancelled["reason"] == "answered_elsewhere"

      :ok = TestClient.send_message(customer1, webrtc_offer(call1_id))
      offer1 = TestClient.assert_receive_type(agent1, "webrtc:offer")
      assert offer1["callAttemptId"] == call1_id

      :ok = TestClient.send_message(agent1, webrtc_answer(call1_id))
      answer1 = TestClient.assert_receive_type(customer1, "webrtc:answer")
      assert answer1["callAttemptId"] == call1_id

      Process.sleep(50)
      TestClient.drain(customer1)
      TestClient.drain(customer2)
      TestClient.drain(agent1)
      TestClient.drain(agent2)

      # --- Call 2: customer2 calls, agent2 accepts ---

      :ok = TestClient.send_message(customer2, call_initiate(call2_id, biz))

      init2 = TestClient.assert_receive_type(customer2, "call:initiated")
      assert init2["callAttemptId"] == call2_id
      # Busy detection deferred: agent1 still rings while on call1
      assert init2["devicesNotified"] == 2

      TestClient.assert_receive_type(agent2, "call:incoming")
      TestClient.assert_receive_type(agent1, "call:incoming")

      :ok = TestClient.send_message(agent2, call_accept(call2_id))
      TestClient.assert_receive_type(agent2, "call:accepted")
      TestClient.assert_receive_type(customer2, "call:accepted")

      agent1_cancelled = TestClient.assert_receive_type(agent1, "call:cancelled")
      assert agent1_cancelled["callAttemptId"] == call2_id
      assert agent1_cancelled["reason"] == "answered_elsewhere"

      # (a) WebRTC exchange on call2 — offer/answer carry call2_id, not call1_id
      :ok = TestClient.send_message(customer2, webrtc_offer(call2_id))
      offer2 = TestClient.assert_receive_type(agent2, "webrtc:offer")
      assert offer2["callAttemptId"] == call2_id

      :ok = TestClient.send_message(agent2, webrtc_answer(call2_id))
      answer2 = TestClient.assert_receive_type(customer2, "webrtc:answer")
      assert answer2["callAttemptId"] == call2_id

      # (b) Both calls end independently
      :ok = TestClient.send_message(customer1, call_end(call1_id))
      ended1_caller = TestClient.assert_receive_type(customer1, "call:ended")
      assert ended1_caller["callAttemptId"] == call1_id
      ended1_callee = TestClient.assert_receive_type(agent1, "call:ended")
      assert ended1_callee["callAttemptId"] == call1_id

      :ok = TestClient.send_message(customer2, call_end(call2_id))
      ended2_caller = TestClient.assert_receive_type(customer2, "call:ended")
      assert ended2_caller["callAttemptId"] == call2_id
      ended2_callee = TestClient.assert_receive_type(agent2, "call:ended")
      assert ended2_callee["callAttemptId"] == call2_id

      # (c) No cross-contamination — queues empty after both calls end
      Process.sleep(50)
      assert [] = TestClient.drain(customer1)
      assert [] = TestClient.drain(customer2)
      assert [] = TestClient.drain(agent1)
      assert [] = TestClient.drain(agent2)

      TestClient.disconnect(customer1)
      TestClient.disconnect(customer2)
      TestClient.disconnect(agent1)
      TestClient.disconnect(agent2)
    end
  end

  # ---------------------------------------------------------------------------
  # Concurrent calls on separate businesses
  # ---------------------------------------------------------------------------

  describe "concurrent calls" do
    test "two simultaneous calls on separate businesses do not interfere" do
      biz_a = uid("biz_a")
      biz_b = uid("biz_b")
      call_a = call_uuid()
      call_b = call_uuid()
      caller_a_id = uid("caller_a")
      caller_b_id = uid("caller_b")

      caller_a = connect_as(caller_a_id, biz_a, "customer")
      callee_a = connect_as(uid("callee_a"), biz_a, "business")
      caller_b = connect_as(caller_b_id, biz_b, "customer")
      callee_b = connect_as(uid("callee_b"), biz_b, "business")

      :ok = TestClient.send_message(caller_a, call_initiate(call_a, biz_a))
      :ok = TestClient.send_message(caller_b, call_initiate(call_b, biz_b))

      init_a = TestClient.assert_receive_type(caller_a, "call:initiated")
      assert init_a["callAttemptId"] == call_a

      init_b = TestClient.assert_receive_type(caller_b, "call:initiated")
      assert init_b["callAttemptId"] == call_b

      # Each callee gets notified of its own call only
      callee_a_inc = TestClient.assert_receive_type(callee_a, "call:incoming")
      assert callee_a_inc["callAttemptId"] == call_a
      assert callee_a_inc["sourceId"] == caller_a_id

      callee_b_inc = TestClient.assert_receive_type(callee_b, "call:incoming")
      assert callee_b_inc["callAttemptId"] == call_b
      assert callee_b_inc["sourceId"] == caller_b_id

      :ok = TestClient.send_message(callee_a, call_accept(call_a))
      :ok = TestClient.send_message(callee_b, call_accept(call_b))

      TestClient.assert_receive_type(callee_a, "call:accepted")
      TestClient.assert_receive_type(caller_a, "call:accepted")
      TestClient.assert_receive_type(callee_b, "call:accepted")
      TestClient.assert_receive_type(caller_b, "call:accepted")

      :ok = TestClient.send_message(caller_a, webrtc_offer(call_a))
      :ok = TestClient.send_message(caller_b, webrtc_offer(call_b))

      # Each callee gets only its own offer — no cross-contamination
      offer_a = TestClient.assert_receive_type(callee_a, "webrtc:offer")
      assert offer_a["callAttemptId"] == call_a

      offer_b = TestClient.assert_receive_type(callee_b, "webrtc:offer")
      assert offer_b["callAttemptId"] == call_b

      :ok = TestClient.send_message(callee_a, webrtc_answer(call_a))
      :ok = TestClient.send_message(callee_b, webrtc_answer(call_b))

      answer_a = TestClient.assert_receive_type(caller_a, "webrtc:answer")
      assert answer_a["callAttemptId"] == call_a

      answer_b = TestClient.assert_receive_type(caller_b, "webrtc:answer")
      assert answer_b["callAttemptId"] == call_b

      :ok = TestClient.send_message(caller_a, call_end(call_a))
      :ok = TestClient.send_message(caller_b, call_end(call_b))

      ended_a = TestClient.assert_receive_type(caller_a, "call:ended")
      assert ended_a["callAttemptId"] == call_a

      ended_b = TestClient.assert_receive_type(caller_b, "call:ended")
      assert ended_b["callAttemptId"] == call_b

      callee_a_ended = TestClient.assert_receive_type(callee_a, "call:ended")
      assert callee_a_ended["callAttemptId"] == call_a

      callee_b_ended = TestClient.assert_receive_type(callee_b, "call:ended")
      assert callee_b_ended["callAttemptId"] == call_b

      # No cross-contamination: biz_b messages never reached biz_a clients
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
