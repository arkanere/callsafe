defmodule CallsafeSignaling.E2E.CallConcurrencyTest do
  @moduledoc """
  E2E tests for multi-party concurrency: busy agent and same-business concurrent calls.
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
  # Busy agent
  # ---------------------------------------------------------------------------

  describe "busy agent" do
    test "agent on active call still receives and can accept a second incoming call (status never set to :busy)" do
      biz = uid("biz")
      call1_id = call_uuid()
      call2_id = call_uuid()
      customer1_id = uid("customer1")
      customer2_id = uid("customer2")
      agent1_id = uid("agent1")

      {:ok, customer1} = TestClient.connect()
      {:ok, customer2} = TestClient.connect()
      {:ok, agent1} = TestClient.connect()

      TestClient.authenticate(customer1, customer1_id, biz)
      TestClient.authenticate(customer2, customer2_id, biz)
      TestClient.authenticate(agent1, agent1_id, biz)

      # --- Call 1: customer1 calls, agent1 accepts, full WebRTC handshake ---

      :ok = TestClient.send_message(customer1, call_initiate(call1_id))

      # customer1 ack: notified customer2 + agent1
      inc1 = TestClient.assert_receive_type(customer1, "call:incoming")
      assert inc1["callAttemptId"] == call1_id
      assert inc1["devicesNotified"] == 2

      TestClient.assert_receive_type(customer2, "call:incoming")
      TestClient.assert_receive_type(agent1, "call:incoming")

      :ok = TestClient.send_message(agent1, call_accept(call1_id, agent1_id))
      TestClient.assert_receive_type(agent1, "call:accepted")
      TestClient.assert_receive_type(customer1, "call:accepted")
      # customer2 cancelled since agent1 accepted
      TestClient.assert_receive_type(customer2, "call:cancelled")

      # WebRTC handshake to reach :connected — status on agent1 stays :available
      :ok = TestClient.send_message(customer1, webrtc_offer(call1_id))
      TestClient.assert_receive_type(agent1, "webrtc:offer")

      :ok = TestClient.send_message(agent1, webrtc_answer(call1_id))
      TestClient.assert_receive_type(customer1, "webrtc:answer")

      # Drain before call2 to keep assertions clean
      Process.sleep(50)
      TestClient.drain(customer1)
      TestClient.drain(customer2)
      TestClient.drain(agent1)

      # --- Call 2: customer2 calls same business while agent1 is on call1 ---

      :ok = TestClient.send_message(customer2, call_initiate(call2_id))

      # (b) devicesNotified includes agent1 — status was never changed to :busy
      inc2 = TestClient.assert_receive_type(customer2, "call:incoming")
      assert inc2["callAttemptId"] == call2_id
      assert inc2["devicesNotified"] == 2

      # (a) agent1 receives call:incoming despite being on an active call
      agent1_inc2 = TestClient.assert_receive_type(agent1, "call:incoming")
      assert agent1_inc2["callAttemptId"] == call2_id

      # customer1 also notified (status not tracked)
      TestClient.assert_receive_type(customer1, "call:incoming")

      # (c) agent1 accepts call2 — server does not prevent it
      :ok = TestClient.send_message(agent1, call_accept(call2_id, agent1_id))

      agent1_accepted2 = TestClient.assert_receive_type(agent1, "call:accepted")
      assert agent1_accepted2["callAttemptId"] == call2_id

      customer2_accepted = TestClient.assert_receive_type(customer2, "call:accepted")
      assert customer2_accepted["callAttemptId"] == call2_id

      # customer1 gets call:cancelled for call2 (agent1 accepted)
      TestClient.assert_receive_type(customer1, "call:cancelled")

      TestClient.disconnect(customer1)
      TestClient.disconnect(customer2)
      TestClient.disconnect(agent1)
    end
  end

  # ---------------------------------------------------------------------------
  # Same-business concurrent calls
  # ---------------------------------------------------------------------------

  describe "same-business concurrent calls" do
    test "two sequential calls on one business — WebRTC exchanges don't cross-contaminate, calls end independently" do
      biz = uid("biz")
      call1_id = call_uuid()
      call2_id = call_uuid()
      customer1_id = uid("customer1")
      customer2_id = uid("customer2")
      agent1_id = uid("agent1")
      agent2_id = uid("agent2")

      {:ok, customer1} = TestClient.connect()
      {:ok, customer2} = TestClient.connect()
      {:ok, agent1} = TestClient.connect()
      {:ok, agent2} = TestClient.connect()

      TestClient.authenticate(customer1, customer1_id, biz)
      TestClient.authenticate(customer2, customer2_id, biz)
      TestClient.authenticate(agent1, agent1_id, biz)
      TestClient.authenticate(agent2, agent2_id, biz)

      # --- Call 1: customer1 calls, all three others notified, agent1 accepts ---

      :ok = TestClient.send_message(customer1, call_initiate(call1_id))

      inc1 = TestClient.assert_receive_type(customer1, "call:incoming")
      assert inc1["callAttemptId"] == call1_id
      assert inc1["devicesNotified"] == 3

      TestClient.assert_receive_type(customer2, "call:incoming")
      TestClient.assert_receive_type(agent1, "call:incoming")
      TestClient.assert_receive_type(agent2, "call:incoming")

      :ok = TestClient.send_message(agent1, call_accept(call1_id, agent1_id))
      TestClient.assert_receive_type(agent1, "call:accepted")
      TestClient.assert_receive_type(customer1, "call:accepted")
      # customer2 and agent2 cancelled — agent1 accepted
      TestClient.assert_receive_type(customer2, "call:cancelled")
      TestClient.assert_receive_type(agent2, "call:cancelled")

      # WebRTC exchange on call1
      :ok = TestClient.send_message(customer1, webrtc_offer(call1_id))
      offer1 = TestClient.assert_receive_type(agent1, "webrtc:offer")
      assert offer1["callAttemptId"] == call1_id

      :ok = TestClient.send_message(agent1, webrtc_answer(call1_id))
      answer1 = TestClient.assert_receive_type(customer1, "webrtc:answer")
      assert answer1["callAttemptId"] == call1_id

      # Drain before call2 to keep assertions clean
      Process.sleep(50)
      TestClient.drain(customer1)
      TestClient.drain(customer2)
      TestClient.drain(agent1)
      TestClient.drain(agent2)

      # --- Call 2: customer2 calls, status not tracked so all three notified, agent2 accepts ---

      :ok = TestClient.send_message(customer2, call_initiate(call2_id))

      # devicesNotified = 3: agent1, agent2, customer1 (status never set to :busy)
      inc2 = TestClient.assert_receive_type(customer2, "call:incoming")
      assert inc2["callAttemptId"] == call2_id
      assert inc2["devicesNotified"] == 3

      TestClient.assert_receive_type(agent2, "call:incoming")
      TestClient.assert_receive_type(agent1, "call:incoming")
      TestClient.assert_receive_type(customer1, "call:incoming")

      :ok = TestClient.send_message(agent2, call_accept(call2_id, agent2_id))
      TestClient.assert_receive_type(agent2, "call:accepted")
      TestClient.assert_receive_type(customer2, "call:accepted")
      # agent1 and customer1 cancelled — agent2 accepted
      TestClient.assert_receive_type(agent1, "call:cancelled")
      TestClient.assert_receive_type(customer1, "call:cancelled")

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

      :ok = TestClient.send_message(callee_a, call_accept(call_a, callee_a_id))
      :ok = TestClient.send_message(callee_b, call_accept(call_b, callee_b_id))

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
