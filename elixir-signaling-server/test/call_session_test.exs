defmodule CallsafeSignaling.CallSessionTest do
  use ExUnit.Case, async: false

  alias CallsafeSignaling.CallSession

  setup do
    # Start Registry for call sessions
    start_supervised!({Registry, keys: :unique, name: CallsafeSignaling.CallRegistry})
    :ok
  end

  describe "start_link/5" do
    test "starts a new call session" do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      call_type = :voice

      assert {:ok, pid} = CallSession.start_link(call_id, business_id, caller_id, call_type)
      assert Process.alive?(pid)

      {:ok, state} = CallSession.get_state(call_id)
      assert state.call_id == call_id
      assert state.business_id == business_id
      assert state.caller_id == caller_id
      assert state.call_type == call_type
      assert state.state == :initiated
    end

    test "starts video call session" do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      call_type = :video

      assert {:ok, _pid} = CallSession.start_link(call_id, business_id, caller_id, call_type)
      {:ok, state} = CallSession.get_state(call_id)
      assert state.call_type == :video
    end
  end

  describe "state transitions" do
    setup do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      {:ok, pid} = CallSession.start_link(call_id, business_id, caller_id, :voice)
      %{call_id: call_id, pid: pid}
    end

    test "initiated -> ringing", %{call_id: call_id} do
      callee_id = "device_2"
      callee_pid = self()

      assert {:ok, state} = CallSession.set_ringing(call_id, callee_id, callee_pid)
      assert state.state == :ringing
      assert state.callee_id == callee_id
      assert state.callee_pid == callee_pid
    end

    test "ringing -> connecting", %{call_id: call_id} do
      CallSession.set_ringing(call_id, "device_2", self())
      assert {:ok, state} = CallSession.set_connecting(call_id)
      assert state.state == :connecting
    end

    test "connecting -> connected", %{call_id: call_id} do
      CallSession.set_ringing(call_id, "device_2", self())
      CallSession.set_connecting(call_id)
      assert {:ok, state} = CallSession.set_connected(call_id)
      assert state.state == :connected
      assert is_integer(state.connected_at)
    end

    test "connected -> ended", %{call_id: call_id} do
      CallSession.set_ringing(call_id, "device_2", self())
      CallSession.set_connecting(call_id)
      CallSession.set_connected(call_id)
      assert {:ok, state} = CallSession.set_ended(call_id, :normal)
      assert state.state == :ended
      assert is_integer(state.ended_at)
    end

    test "invalid transition returns error", %{call_id: call_id} do
      # Try to go from initiated directly to connected (invalid)
      assert {:error, :invalid_transition} = CallSession.set_connected(call_id)

      # State should remain unchanged
      {:ok, state} = CallSession.get_state(call_id)
      assert state.state == :initiated
    end
  end

  describe "video-specific state transitions" do
    setup do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      {:ok, pid} = CallSession.start_link(call_id, business_id, caller_id, :video)

      # Setup to connected state
      CallSession.set_ringing(call_id, "device_2", self())
      CallSession.set_connecting(call_id)
      CallSession.set_connected(call_id)

      %{call_id: call_id, pid: pid}
    end

    test "connected -> escalation_pending", %{call_id: call_id} do
      assert {:ok, state} = CallSession.set_escalation_pending(call_id)
      assert state.state == :escalation_pending
    end

    test "escalation_pending -> connected", %{call_id: call_id} do
      CallSession.set_escalation_pending(call_id)
      assert {:ok, state} = CallSession.set_connected(call_id)
      assert state.state == :connected
    end

    test "connected -> video_paused_by_user", %{call_id: call_id} do
      assert {:ok, state} = CallSession.set_video_paused_user(call_id)
      assert state.state == :video_paused_by_user
    end

    test "connected -> video_paused_bandwidth", %{call_id: call_id} do
      assert {:ok, state} = CallSession.set_video_paused_bandwidth(call_id)
      assert state.state == :video_paused_bandwidth
    end

    test "connecting -> camera_permission_denied", %{call_id: _call_id} do
      call_id2 = "call_#{:rand.uniform(1000)}"
      {:ok, _} = CallSession.start_link(call_id2, "business_1", "device_1", :video)
      CallSession.set_ringing(call_id2, "device_2", self())
      CallSession.set_connecting(call_id2)

      assert {:ok, state} = CallSession.set_camera_permission_denied(call_id2)
      assert state.state == :camera_permission_denied
    end
  end

  describe "media capabilities" do
    setup do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      {:ok, pid} = CallSession.start_link(call_id, business_id, caller_id, :video)
      %{call_id: call_id, pid: pid}
    end

    test "updates media capabilities", %{call_id: call_id} do
      capabilities = %{
        audio: %{send: true, receive: true},
        video: %{send: true, receive: true}
      }

      assert {:ok, state} = CallSession.update_media_capabilities(call_id, capabilities)
      assert state.media_capabilities == capabilities
    end
  end

  describe "message sending" do
    setup do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"

      {:ok, pid} = CallSession.start_link(call_id, business_id, caller_id, :voice)

      callee_pid = spawn(fn -> Process.sleep(:infinity) end)

      CallSession.set_ringing(call_id, "device_2", callee_pid)

      %{call_id: call_id, pid: pid, caller_pid: self(), callee_pid: callee_pid}
    end

    test "sends message to caller", %{call_id: call_id} do
      # Set caller PID to receive messages
      {:ok, _state} = CallSession.set_caller_pid(call_id, self())

      assert :ok = CallSession.send_to_caller(call_id, "test:message", %{data: "test"})

      assert_receive {:send_message, "test:message", %{data: "test"}}
    end

    test "returns error when caller not connected", %{call_id: _call_id} do
      call_id2 = "call_#{:rand.uniform(1000)}"
      {:ok, _} = CallSession.start_link(call_id2, "business_1", "device_1", :voice)

      assert {:error, :caller_not_connected} = CallSession.send_to_caller(call_id2, "test:message", %{})
    end
  end

  describe "terminal state auto-stop" do
    test "process stops after terminal state" do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      {:ok, pid} = CallSession.start_link(call_id, business_id, caller_id, :voice)

      # Transition to terminal state
      CallSession.set_ringing(call_id, "device_2", self())
      CallSession.set_connecting(call_id)
      CallSession.set_connected(call_id)
      CallSession.set_ended(call_id, :normal)

      # Monitor the process
      ref = Process.monitor(pid)

      # Process should stop automatically after 5 seconds
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 6_000
    end
  end

  describe "get_state/1" do
    test "returns error for non-existent call" do
      assert {:error, :not_found} = CallSession.get_state("nonexistent")
    end
  end
end
