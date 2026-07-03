defmodule CallsafeSignaling.Integration.CallSessionTest do
  @moduledoc """
  Integration tests for CallSession GenServer: timers, state transitions, and
  peer notifications — exercised directly without WebSocket or TCP.

  Pattern: use self() as caller/callee PID; assert_receive for notifications.
  """

  use ExUnit.Case, async: false

  alias CallsafeSignaling.CallSession

  setup do
    start_supervised!({Registry, keys: :unique, name: CallsafeSignaling.CallRegistry})
    :ok
  end

  defp unique_call_id do
    "integration_#{System.unique_integer([:positive, :monotonic])}"
  end

  # ---------------------------------------------------------------------------
  # Ringing timer
  # ---------------------------------------------------------------------------

  describe "ringing timer" do
    test "fires after configured timeout and transitions state to :timeout" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      CallSession.set_caller_pid(call_id, self())
      CallSession.set_ringing(call_id)

      # Timer fires at configured timeout (5_000ms in test env); v2 payload
      # carries phase and timeoutDuration.
      assert_receive {:send_message, "call:timeout", payload}, 6_000
      assert payload["phase"] == "ringing"
      assert payload["timeoutDuration"] == 5_000

      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :timeout
    end

    test "is cancelled when state transitions away from :ringing" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      CallSession.set_ringing(call_id)

      {:ok, ringing_state} = CallSession.get_state(call_id)
      assert ringing_state.ringing_timer != nil

      CallSession.set_connecting(call_id, "device_2", self())

      {:ok, connecting_state} = CallSession.get_state(call_id)
      assert connecting_state.ringing_timer == nil
      assert connecting_state.connecting_timer != nil
    end
  end

  # ---------------------------------------------------------------------------
  # Connecting timer
  # ---------------------------------------------------------------------------

  describe "connecting timer" do
    test "fires after configured timeout and transitions state to :timeout" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      CallSession.set_caller_pid(call_id, self())
      CallSession.set_ringing(call_id)
      CallSession.set_connecting(call_id, "device_2", self())

      assert_receive {:send_message, "call:timeout", payload}, 6_000
      assert payload["phase"] == "connecting"

      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :timeout
    end

    test "is cancelled when state transitions away from :connecting" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      CallSession.set_ringing(call_id)
      CallSession.set_connecting(call_id, "device_2", self())

      {:ok, connecting_state} = CallSession.get_state(call_id)
      assert connecting_state.connecting_timer != nil

      CallSession.set_connected(call_id)

      {:ok, connected_state} = CallSession.get_state(call_id)
      assert connected_state.connecting_timer == nil
    end
  end

  # ---------------------------------------------------------------------------
  # notify_timeout
  # ---------------------------------------------------------------------------

  describe "notify_timeout" do
    test "connecting phase notifies both participants" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      # Both PIDs are self() so this process receives two messages.
      CallSession.set_caller_pid(call_id, self())
      CallSession.set_ringing(call_id)
      CallSession.set_connecting(call_id, "device_2", self())

      assert_receive {:send_message, "call:timeout", %{"callAttemptId" => ^call_id}}, 6_000
      assert_receive {:send_message, "call:timeout", %{"callAttemptId" => ^call_id}}, 100
    end

    test "caller_pid nil does not crash, callee still notified" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      # caller_pid intentionally not set — remains nil.
      CallSession.set_ringing(call_id)
      CallSession.set_connecting(call_id, "device_2", self())

      assert_receive {:send_message, "call:timeout", %{"callAttemptId" => ^call_id}}, 6_000
    end
  end

  # ---------------------------------------------------------------------------
  # Escalation timer
  # ---------------------------------------------------------------------------

  describe "escalation timer" do
    test "expiry reverts to :connected and rejects with reason timeout" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      CallSession.set_caller_pid(call_id, self())
      CallSession.set_ringing(call_id)
      CallSession.set_connecting(call_id, "device_2", spawn(fn -> Process.sleep(:infinity) end))
      CallSession.set_connected(call_id)

      caps = %{"canSend" => ["audio", "video"], "canReceive" => ["audio", "video"]}
      {:ok, _} = CallSession.set_escalation_pending(call_id, :customer, caps)

      # timeout_escalation is 5_000 in test config; requester (customer=caller) is self()
      assert_receive {:send_message, "escalation:rejected", payload}, 6_000
      assert payload["reason"] == "timeout"

      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :connected
      assert state.call_type == :voice
    end
  end

  # ---------------------------------------------------------------------------
  # Reconnect grace
  # ---------------------------------------------------------------------------

  describe "reconnect grace" do
    test "participant socket death starts grace; expiry fails the call and notifies survivor" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)

      callee_socket = spawn(fn -> Process.sleep(:infinity) end)
      CallSession.set_caller_pid(call_id, self())
      CallSession.set_ringing(call_id)
      CallSession.set_connecting(call_id, "device_2", callee_socket)
      CallSession.set_connected(call_id)

      # Callee socket dies mid-call
      Process.exit(callee_socket, :kill)

      # timeout_reconnect_grace is 2_000 in test config
      assert_receive {:send_message, "call:failed", payload}, 4_000
      assert payload["reason"] == "peer_disconnected"

      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :failed
      assert state.fail_reason == :peer_disconnected
    end

    test "reconnect within grace cancels the timer" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)

      callee_socket = spawn(fn -> Process.sleep(:infinity) end)
      CallSession.set_caller_pid(call_id, self())
      CallSession.set_ringing(call_id)
      CallSession.set_connecting(call_id, "device_2", callee_socket)
      CallSession.set_connected(call_id)

      Process.exit(callee_socket, :kill)
      Process.sleep(100)

      new_socket = spawn(fn -> Process.sleep(:infinity) end)
      assert {:ok, _} = CallSession.reconnect(call_id, "device_2", new_socket)

      # No failure after the grace window would have expired
      refute_receive {:send_message, "call:failed", _}, 3_000

      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :connected
      assert state.callee_pid == new_socket
    end
  end
end
