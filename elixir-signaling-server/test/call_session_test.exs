defmodule CallsafeSignaling.CallSessionTest do
  use ExUnit.Case, async: false

  alias CallsafeSignaling.CallSession

  setup do
    # Start Registry for call sessions
    start_supervised!({Registry, keys: :unique, name: CallsafeSignaling.CallRegistry})
    :ok
  end

  defp start_call(call_type \\ :voice) do
    call_id = "call_#{System.unique_integer([:positive])}"
    {:ok, pid} = CallSession.start_link(call_id, "business_1", "device_1", call_type)
    {call_id, pid}
  end

  # Drive a call to :connected with self() as callee socket.
  defp connect_call(call_id) do
    {:ok, _} = CallSession.set_ringing(call_id)
    {:ok, _} = CallSession.set_connecting(call_id, "device_2", self())
    {:ok, _} = CallSession.set_connected(call_id)
    :ok
  end

  describe "start_link/5" do
    test "starts a new call session" do
      {call_id, pid} = start_call()
      assert Process.alive?(pid)

      {:ok, state} = CallSession.get_state(call_id)
      assert state.call_id == call_id
      assert state.business_id == "business_1"
      assert state.caller_id == "device_1"
      assert state.call_type == :voice
      assert state.state == :initiated
    end

    test "starts video call session" do
      {call_id, _pid} = start_call(:video)
      {:ok, state} = CallSession.get_state(call_id)
      assert state.call_type == :video
    end
  end

  describe "state transitions" do
    test "initiated -> ringing (devices notified)" do
      {call_id, _pid} = start_call()

      assert {:ok, state} = CallSession.set_ringing(call_id)
      assert state.state == :ringing
      assert is_nil(state.callee_id)
    end

    test "ringing -> connecting binds the accepting device" do
      {call_id, _pid} = start_call()
      {:ok, _} = CallSession.set_ringing(call_id)

      caps = %{"canSend" => ["audio"], "canReceive" => ["audio"]}
      assert {:ok, state} = CallSession.set_connecting(call_id, "device_2", self(), caps)
      assert state.state == :connecting
      assert state.callee_id == "device_2"
      assert state.callee_pid == self()
      assert state.callee_media_capabilities == caps
    end

    test "connecting -> connected" do
      {call_id, _pid} = start_call()
      {:ok, _} = CallSession.set_ringing(call_id)
      {:ok, _} = CallSession.set_connecting(call_id, "device_2", self())

      assert {:ok, state} = CallSession.set_connected(call_id)
      assert state.state == :connected
      assert is_integer(state.connected_at)
    end

    test "connected -> ended records reason and endedBy" do
      {call_id, _pid} = start_call()
      connect_call(call_id)

      assert {:ok, state} = CallSession.set_ended(call_id, :customer_hangup, :customer)
      assert state.state == :ended
      assert state.end_reason == :customer_hangup
      assert state.ended_by == :customer
      assert is_integer(state.ended_at)
    end

    test "v2: hang-up allowed while still connecting" do
      {call_id, _pid} = start_call()
      {:ok, _} = CallSession.set_ringing(call_id)
      {:ok, _} = CallSession.set_connecting(call_id, "device_2", self())

      assert {:ok, state} = CallSession.set_ended(call_id, :business_hangup, :business)
      assert state.state == :ended
    end

    test "caller cancel from initiated and ringing" do
      {call_id, _pid} = start_call()
      assert {:ok, %{state: :cancelled}} = CallSession.set_cancelled(call_id)

      {call_id2, _pid2} = start_call()
      {:ok, _} = CallSession.set_ringing(call_id2)
      assert {:ok, %{state: :cancelled}} = CallSession.set_cancelled(call_id2)
    end

    test "invalid transition returns error" do
      {call_id, _pid} = start_call()

      # Try to go from initiated directly to connected (invalid)
      assert {:error, :invalid_transition} = CallSession.set_connected(call_id)

      # State should remain unchanged
      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :initiated
    end
  end

  describe "reject tracking" do
    test "unavailable only after every notified device rejected" do
      {call_id, _pid} = start_call()
      {:ok, _} = CallSession.add_notified_devices(call_id, ["dev_a", "dev_b"])
      {:ok, _} = CallSession.set_ringing(call_id)

      assert {:ok, :pending, _state} = CallSession.record_reject(call_id, "dev_a")
      assert {:ok, :all_rejected, state} = CallSession.record_reject(call_id, "dev_b")
      assert state.state == :unavailable
    end

    test "rejects from devices that were never notified are refused" do
      {call_id, _pid} = start_call()
      {:ok, _} = CallSession.add_notified_devices(call_id, ["dev_a"])
      {:ok, _} = CallSession.set_ringing(call_id)

      assert {:error, :not_notified} = CallSession.record_reject(call_id, "dev_x")
    end
  end

  describe "escalation" do
    test "connected -> escalation_pending records the requester" do
      {call_id, _pid} = start_call()
      connect_call(call_id)

      caps = %{"canSend" => ["audio", "video"], "canReceive" => ["audio", "video"]}
      assert {:ok, state} = CallSession.set_escalation_pending(call_id, :customer, caps)
      assert state.state == :escalation_pending
      assert state.escalation_requested_by == :customer
    end

    test "accepted escalation upgrades call type and sets the offerer" do
      {call_id, _pid} = start_call()
      connect_call(call_id)

      caps = %{"canSend" => ["audio", "video"], "canReceive" => ["audio", "video"]}
      {:ok, _} = CallSession.set_escalation_pending(call_id, :customer, caps)

      assert {:ok, state} = CallSession.resolve_escalation(call_id, :accepted)
      assert state.state == :connected
      assert state.call_type == :video
      assert state.renegotiation_offerer == :customer
    end

    test "rejected escalation keeps the call voice" do
      {call_id, _pid} = start_call()
      connect_call(call_id)

      caps = %{"canSend" => ["audio", "video"], "canReceive" => ["audio", "video"]}
      {:ok, _} = CallSession.set_escalation_pending(call_id, :business, caps)

      assert {:ok, state} = CallSession.resolve_escalation(call_id, :rejected)
      assert state.state == :connected
      assert state.call_type == :voice
    end
  end

  describe "downgrade" do
    test "downgrades a connected video call to voice" do
      {call_id, _pid} = start_call(:video)
      connect_call(call_id)

      assert {:ok, state} = CallSession.downgrade(call_id, :business)
      assert state.call_type == :voice
      assert state.renegotiation_offerer == :business
    end

    test "cannot downgrade a voice call" do
      {call_id, _pid} = start_call(:voice)
      connect_call(call_id)

      assert {:error, :invalid_transition} = CallSession.downgrade(call_id, :customer)
    end
  end

  describe "reconnect" do
    test "re-binds a participant pid while in-call" do
      {call_id, _pid} = start_call()
      connect_call(call_id)

      new_socket = spawn(fn -> Process.sleep(:infinity) end)
      assert {:ok, state} = CallSession.reconnect(call_id, "device_1", new_socket)
      assert state.caller_pid == new_socket
    end

    test "rejects reconnect from non-participants and wrong states" do
      {call_id, _pid} = start_call()
      connect_call(call_id)
      assert {:error, :not_participant} = CallSession.reconnect(call_id, "stranger", self())

      {call_id2, _pid2} = start_call()
      assert {:error, :invalid_transition} = CallSession.reconnect(call_id2, "device_1", self())
    end
  end

  describe "media capabilities" do
    test "updates media capabilities" do
      {call_id, _pid} = start_call(:video)

      capabilities = %{"canSend" => ["audio", "video"], "canReceive" => ["audio", "video"]}

      assert {:ok, state} = CallSession.update_media_capabilities(call_id, capabilities)
      assert state.media_capabilities == capabilities
    end
  end

  describe "message sending" do
    test "sends message to caller" do
      {call_id, _pid} = start_call()

      {:ok, _state} = CallSession.set_caller_pid(call_id, self())

      assert :ok = CallSession.send_to_caller(call_id, "test:message", %{data: "test"})

      assert_receive {:send_message, "test:message", %{data: "test"}}
    end

    test "returns error when caller not connected" do
      {call_id, _pid} = start_call()

      assert {:error, :caller_not_connected} =
               CallSession.send_to_caller(call_id, "test:message", %{})
    end
  end

  describe "terminal state auto-stop" do
    test "process stops after terminal_retention" do
      {call_id, pid} = start_call()
      connect_call(call_id)
      CallSession.set_ended(call_id, :normal, :customer)

      # Monitor the process
      ref = Process.monitor(pid)

      # terminal_retention is 5_000 in test config
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 7_000
    end
  end

  describe "get_state/1" do
    test "returns error for non-existent call" do
      assert {:error, :not_found} = CallSession.get_state("nonexistent")
    end
  end
end
