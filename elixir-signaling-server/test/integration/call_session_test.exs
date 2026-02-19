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
      CallSession.set_ringing(call_id, "device_2", self())

      # Timer fires at configured timeout (5_000ms in test env).
      assert_receive {:send_message, "call:timeout", _payload}, 6_000

      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :timeout
    end

    test "is cancelled when state transitions away from :ringing" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      CallSession.set_ringing(call_id, "device_2", self())

      {:ok, ringing_state} = CallSession.get_state(call_id)
      assert ringing_state.ringing_timer != nil

      CallSession.set_connecting(call_id)

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
      CallSession.set_ringing(call_id, "device_2", self())
      CallSession.set_connecting(call_id)

      assert_receive {:send_message, "call:timeout", _payload}, 6_000

      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :timeout
    end

    test "is cancelled when state transitions away from :connecting" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      CallSession.set_ringing(call_id, "device_2", self())
      CallSession.set_connecting(call_id)

      {:ok, connecting_state} = CallSession.get_state(call_id)
      assert connecting_state.connecting_timer != nil

      CallSession.set_connected(call_id)

      {:ok, connected_state} = CallSession.get_state(call_id)
      assert connected_state.connecting_timer == nil
    end
  end

  # ---------------------------------------------------------------------------
  # notify_timeout/1
  # ---------------------------------------------------------------------------

  describe "notify_timeout" do
    test "sends call:timeout to both caller and callee" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      # Both PIDs are self() so this process receives two messages.
      CallSession.set_caller_pid(call_id, self())
      CallSession.set_ringing(call_id, "device_2", self())

      assert_receive {:send_message, "call:timeout", %{"callAttemptId" => ^call_id}}, 6_000
      assert_receive {:send_message, "call:timeout", %{"callAttemptId" => ^call_id}}, 100
    end

    test "caller_pid nil does not crash, callee still notified" do
      call_id = unique_call_id()
      {:ok, _pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      # caller_pid intentionally not set — remains nil.
      CallSession.set_ringing(call_id, "device_2", self())

      assert_receive {:send_message, "call:timeout", %{"callAttemptId" => ^call_id}}, 6_000
    end

    test "callee_pid nil does not crash, caller still notified" do
      call_id = unique_call_id()
      {:ok, pid} = CallSession.start_link(call_id, "business_1", "device_1", :voice)
      CallSession.set_caller_pid(call_id, self())
      # Transition to :ringing with callee_pid: nil, bypassing the public API
      # default, to exercise the nil-guard in notify_timeout/1.
      GenServer.call(pid, {:transition, :ringing, %{callee_id: "device_2", callee_pid: nil}})

      assert_receive {:send_message, "call:timeout", %{"callAttemptId" => ^call_id}}, 6_000
    end
  end
end
