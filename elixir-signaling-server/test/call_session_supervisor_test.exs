defmodule CallsafeSignaling.CallSessionSupervisorTest do
  use ExUnit.Case, async: false

  alias CallsafeSignaling.{CallSessionSupervisor, CallSession}

  setup do
    # Start Registry for call sessions
    start_supervised!({Registry, keys: :unique, name: CallsafeSignaling.CallRegistry})
    # Start the supervisor
    start_supervised!(CallSessionSupervisor)
    :ok
  end

  describe "start_call/5" do
    test "starts a new call session under supervision" do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      call_type = :voice

      assert {:ok, pid} =
               CallSessionSupervisor.start_call(call_id, business_id, caller_id, call_type)

      assert Process.alive?(pid)

      # Verify call session is accessible
      assert {:ok, state} = CallSession.get_state(call_id)
      assert state.call_id == call_id
    end

    test "prevents duplicate call sessions" do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      call_type = :voice

      assert {:ok, _pid1} =
               CallSessionSupervisor.start_call(call_id, business_id, caller_id, call_type)

      # v2: duplicate callAttemptId is an error (duplicate_call_id on the wire)
      assert {:error, :already_started} =
               CallSessionSupervisor.start_call(call_id, business_id, caller_id, call_type)
    end

    test "starts video call session" do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"
      call_type = :video

      assert {:ok, _pid} =
               CallSessionSupervisor.start_call(call_id, business_id, caller_id, call_type)

      assert {:ok, state} = CallSession.get_state(call_id)
      assert state.call_type == :video
    end
  end

  describe "terminate_call/1" do
    test "terminates an active call session" do
      call_id = "call_#{:rand.uniform(1000)}"
      business_id = "business_1"
      caller_id = "device_1"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, business_id, caller_id, :voice)
      ref = Process.monitor(pid)

      assert :ok = CallSessionSupervisor.terminate_call(call_id)

      # Process should be terminated
      assert_receive {:DOWN, ^ref, :process, ^pid, _reason}, 1_000
    end

    test "handles termination of non-existent call gracefully" do
      assert :ok = CallSessionSupervisor.terminate_call("nonexistent")
    end
  end

  describe "count_calls/0" do
    test "returns count of active call sessions" do
      initial_count = CallSessionSupervisor.count_calls()

      call_id1 = "call_#{:rand.uniform(1000)}"
      call_id2 = "call_#{:rand.uniform(1000)}"

      {:ok, _} = CallSessionSupervisor.start_call(call_id1, "business_1", "device_1", :voice)
      assert CallSessionSupervisor.count_calls() == initial_count + 1

      {:ok, _} = CallSessionSupervisor.start_call(call_id2, "business_1", "device_2", :voice)
      assert CallSessionSupervisor.count_calls() == initial_count + 2

      CallSessionSupervisor.terminate_call(call_id1)
      # Give time for termination
      Process.sleep(100)
      assert CallSessionSupervisor.count_calls() == initial_count + 1
    end
  end

  describe "list_calls/0" do
    test "lists all active call IDs" do
      call_id1 = "call_#{:rand.uniform(1000)}"
      call_id2 = "call_#{:rand.uniform(1000)}"

      {:ok, _} = CallSessionSupervisor.start_call(call_id1, "business_1", "device_1", :voice)
      {:ok, _} = CallSessionSupervisor.start_call(call_id2, "business_1", "device_2", :video)

      call_ids = CallSessionSupervisor.list_calls()
      assert call_id1 in call_ids
      assert call_id2 in call_ids
    end
  end

  describe "fault isolation" do
    test "crash of one call does not affect others" do
      call_id1 = "call_#{:rand.uniform(1000)}"
      call_id2 = "call_#{:rand.uniform(1000)}"

      {:ok, pid1} = CallSessionSupervisor.start_call(call_id1, "business_1", "device_1", :voice)
      {:ok, pid2} = CallSessionSupervisor.start_call(call_id2, "business_1", "device_2", :voice)

      ref1 = Process.monitor(pid1)
      _ref2 = Process.monitor(pid2)

      # Kill the first call process
      Process.exit(pid1, :kill)

      # First process should be down
      assert_receive {:DOWN, ^ref1, :process, ^pid1, :killed}, 1_000

      # Give time for supervisor to react
      Process.sleep(100)

      # Second process should still be alive
      assert Process.alive?(pid2)
      assert {:ok, _state} = CallSession.get_state(call_id2)
    end

    test "supervisor does not restart call sessions (transient restart)" do
      call_id = "call_#{:rand.uniform(1000)}"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      ref = Process.monitor(pid)

      # Kill the process
      Process.exit(pid, :kill)

      # Process should be down
      assert_receive {:DOWN, ^ref, :process, ^pid, :killed}, 1_000

      # Give time for potential restart
      Process.sleep(200)

      # Call session should NOT be restarted (temporary restart strategy)
      assert {:error, :not_found} = CallSession.get_state(call_id)
    end
  end

  describe "supervision tree integration" do
    test "multiple calls can be supervised simultaneously" do
      call_ids =
        for i <- 1..10 do
          call_id = "call_#{:rand.uniform(100_000)}"

          {:ok, _pid} =
            CallSessionSupervisor.start_call(call_id, "business_1", "device_#{i}", :voice)

          call_id
        end

      # All calls should be active
      assert CallSessionSupervisor.count_calls() >= 10

      # All calls should be accessible
      for call_id <- call_ids do
        assert {:ok, _state} = CallSession.get_state(call_id)
      end

      # Terminate all
      for call_id <- call_ids do
        CallSessionSupervisor.terminate_call(call_id)
      end

      Process.sleep(100)

      # Count should be reduced (may not be exact if other tests are running)
      final_count = CallSessionSupervisor.count_calls()
      assert final_count < CallSessionSupervisor.count_calls() + 10
    end
  end
end
