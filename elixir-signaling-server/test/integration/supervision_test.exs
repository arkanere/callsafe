defmodule CallsafeSignaling.Integration.SupervisionTest do
  @moduledoc """
  Integration tests for GenServer supervision tree, crash recovery, and fault isolation.
  Tests the complete supervision behavior under failure scenarios.
  """

  use ExUnit.Case, async: false

  alias CallsafeSignaling.{CallSessionSupervisor, CallSession, DeviceRegistry}

  setup do
    # Start supervision tree components
    start_supervised!({Registry, keys: :unique, name: CallsafeSignaling.CallRegistry})
    start_supervised!(CallSessionSupervisor)
    start_supervised!(DeviceRegistry)

    :ok
  end

  describe "supervision tree resilience" do
    test "supervisor remains functional after child crash" do
      call_id = "crash_test_#{:rand.uniform(100000)}"

      # Start a call session
      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      assert Process.alive?(pid)

      # Kill the call session process
      ref = Process.monitor(pid)
      Process.exit(pid, :kill)

      # Wait for process to die
      assert_receive {:DOWN, ^ref, :process, ^pid, :killed}, 1_000

      # Supervisor should still be alive and functional
      new_call_id = "new_call_#{:rand.uniform(100000)}"
      {:ok, new_pid} = CallSessionSupervisor.start_call(new_call_id, "business_1", "device_2", :voice)
      assert Process.alive?(new_pid)
    end

    test "multiple concurrent crashes do not affect supervisor" do
      # Start multiple call sessions
      call_pids =
        for i <- 1..5 do
          call_id = "concurrent_crash_#{i}_#{:rand.uniform(100000)}"
          {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_#{i}", :voice)
          {call_id, pid}
        end

      # Kill all processes simultaneously
      refs =
        Enum.map(call_pids, fn {_call_id, pid} ->
          ref = Process.monitor(pid)
          Process.exit(pid, :kill)
          {pid, ref}
        end)

      # Wait for all to die
      Enum.each(refs, fn {pid, ref} ->
        assert_receive {:DOWN, ^ref, :process, ^pid, :killed}, 1_000
      end)

      # Supervisor should still be functional
      {:ok, _new_pid} = CallSessionSupervisor.start_call("post_crash_call", "business_1", "device_x", :voice)
      assert CallSessionSupervisor.count_calls() >= 1
    end

    test "crashed call sessions are not restarted" do
      call_id = "no_restart_#{:rand.uniform(100000)}"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      ref = Process.monitor(pid)

      # Crash the process
      Process.exit(pid, :crash_simulation)

      # Wait for process to die
      assert_receive {:DOWN, ^ref, :process, ^pid, :crash_simulation}, 1_000

      # Give supervisor time to potentially restart (it should not)
      Process.sleep(200)

      # Call session should not exist
      assert {:error, :not_found} = CallSession.get_state(call_id)
    end

    test "supervisor handles abnormal exits gracefully" do
      call_id = "abnormal_exit_#{:rand.uniform(100000)}"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)

      # Send invalid message that might cause crash
      send(pid, :invalid_message)

      # Process should handle it or crash gracefully
      Process.sleep(100)

      # Supervisor should still be functional
      new_call_id = "post_abnormal_#{:rand.uniform(100000)}"
      assert {:ok, _new_pid} = CallSessionSupervisor.start_call(new_call_id, "business_1", "device_2", :voice)
    end
  end

  describe "fault isolation between call sessions" do
    test "crash of one call does not affect other calls" do
      # Start multiple independent calls
      call_1_id = "isolated_1_#{:rand.uniform(100000)}"
      call_2_id = "isolated_2_#{:rand.uniform(100000)}"
      call_3_id = "isolated_3_#{:rand.uniform(100000)}"

      {:ok, pid1} = CallSessionSupervisor.start_call(call_1_id, "business_1", "device_1", :voice)
      {:ok, pid2} = CallSessionSupervisor.start_call(call_2_id, "business_1", "device_2", :voice)
      {:ok, pid3} = CallSessionSupervisor.start_call(call_3_id, "business_1", "device_3", :video)

      # Transition calls to different states
      CallSession.set_ringing(call_1_id, "device_x", self())
      CallSession.set_ringing(call_2_id, "device_y", self())
      CallSession.set_connecting(call_2_id)
      CallSession.set_ringing(call_3_id, "device_z", self())

      # Kill the middle call
      ref1 = Process.monitor(pid1)
      Process.exit(pid1, :kill)

      assert_receive {:DOWN, ^ref1, :process, ^pid1, :killed}, 1_000

      # Other calls should remain unaffected
      assert Process.alive?(pid2)
      assert Process.alive?(pid3)

      {:ok, state2} = CallSession.get_state(call_2_id)
      assert state2.state == :connecting

      {:ok, state3} = CallSession.get_state(call_3_id)
      assert state3.state == :ringing
    end

    test "state transitions in one call do not affect others" do
      call_1_id = "state_1_#{:rand.uniform(100000)}"
      call_2_id = "state_2_#{:rand.uniform(100000)}"

      {:ok, _pid1} = CallSessionSupervisor.start_call(call_1_id, "business_1", "device_1", :voice)
      {:ok, _pid2} = CallSessionSupervisor.start_call(call_2_id, "business_1", "device_2", :voice)

      # Transition first call through states
      {:ok, _} = CallSession.set_ringing(call_1_id, "device_x", self())
      {:ok, _} = CallSession.set_connecting(call_1_id)
      {:ok, _} = CallSession.set_connected(call_1_id)

      # Second call should remain in initial state
      {:ok, state2} = CallSession.get_state(call_2_id)
      assert state2.state == :initiated
    end
  end

  describe "automatic cleanup on termination" do
    test "call session terminates after reaching terminal state" do
      call_id = "auto_cleanup_#{:rand.uniform(100000)}"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      ref = Process.monitor(pid)

      # Transition through valid states to terminal state
      {:ok, _} = CallSession.set_ringing(call_id, "device_2", self())
      {:ok, _} = CallSession.set_connecting(call_id)
      {:ok, _} = CallSession.set_connected(call_id)
      {:ok, _} = CallSession.set_ended(call_id, :user_hangup)

      # Process should auto-stop after timeout (5 seconds in implementation)
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 6_000
    end

    test "cancelled call sessions are cleaned up" do
      call_id = "cancelled_cleanup_#{:rand.uniform(100000)}"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      ref = Process.monitor(pid)

      # Transition through ringing before cancelling
      {:ok, _} = CallSession.set_ringing(call_id, "device_2", self())
      {:ok, _} = CallSession.set_cancelled(call_id)

      # Should auto-stop
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 6_000
    end

    test "failed call sessions are cleaned up" do
      call_id = "failed_cleanup_#{:rand.uniform(100000)}"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      ref = Process.monitor(pid)

      # Transition through ringing before failing
      {:ok, _} = CallSession.set_ringing(call_id, "device_2", self())
      {:ok, _} = CallSession.set_connecting(call_id)
      {:ok, _} = CallSession.set_failed(call_id, "Connection lost")

      # Should auto-stop
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 6_000
    end
  end

  describe "registry integration" do
    test "call sessions are properly registered and deregistered" do
      call_id = "registry_test_#{:rand.uniform(100000)}"

      # Before starting, call should not be found
      assert {:error, :not_found} = CallSession.get_state(call_id)

      # Start call
      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      ref = Process.monitor(pid)

      # Call should be findable
      assert {:ok, state} = CallSession.get_state(call_id)
      assert state.call_id == call_id

      # Stop call
      CallSession.stop(call_id)
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 1_000

      # Call should no longer be found
      assert {:error, :not_found} = CallSession.get_state(call_id)
    end

    test "duplicate call IDs return existing process" do
      call_id = "duplicate_#{:rand.uniform(100000)}"

      {:ok, pid1} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      {:ok, pid2} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)

      # Should return the same PID
      assert pid1 == pid2
    end
  end

  describe "resource cleanup under load" do
    test "handles rapid creation and termination of call sessions" do
      initial_count = CallSessionSupervisor.count_calls()

      # Create many calls rapidly
      call_ids =
        for i <- 1..20 do
          call_id = "rapid_#{i}_#{:rand.uniform(100000)}"
          {:ok, _pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_#{i}", :voice)
          call_id
        end

      # Verify all created
      assert CallSessionSupervisor.count_calls() >= initial_count + 20

      # Terminate half of them with proper state transitions
      call_ids
      |> Enum.take(10)
      |> Enum.each(fn call_id ->
        CallSession.set_ringing(call_id, "device_x", self())
        CallSession.set_connecting(call_id)
        CallSession.set_connected(call_id)
        CallSession.set_ended(call_id, :user_hangup)
      end)

      # Give time for auto-cleanup
      Process.sleep(6_000)

      # Count should be reduced
      final_count = CallSessionSupervisor.count_calls()
      assert final_count < initial_count + 20
    end

    test "memory is released after call termination" do
      call_id = "memory_test_#{:rand.uniform(100000)}"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)

      # Add some data to the call
      large_metadata = %{data: String.duplicate("x", 10_000)}
      {:ok, _} = CallSession.update_media_capabilities(call_id, large_metadata)

      # Get process info
      process_info_before = Process.info(pid, :memory)

      # Stop the call
      ref = Process.monitor(pid)
      CallSession.stop(call_id)
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 1_000

      # Process should be gone and memory released
      assert Process.info(pid) == nil
      assert process_info_before != nil
    end
  end

  describe "supervision tree recovery" do
    test "supervisor recovers from multiple rapid child failures" do
      # Simulate stress scenario
      for i <- 1..10 do
        call_id = "stress_#{i}_#{:rand.uniform(100000)}"
        {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_#{i}", :voice)
        Process.exit(pid, :kill)
      end

      # Give supervisor time to process failures
      Process.sleep(500)

      # Supervisor should still be functional
      {:ok, _pid} = CallSessionSupervisor.start_call("post_stress", "business_1", "device_x", :voice)
      assert CallSessionSupervisor.count_calls() >= 1
    end

    test "device registry remains functional after call crashes" do
      # Register devices with proper parameters
      DeviceRegistry.register("device_1", "business_1", self(), :web)
      DeviceRegistry.register("device_2", "business_1", self(), :web)

      # Start and crash a call
      call_id = "registry_crash_test_#{:rand.uniform(100000)}"
      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      Process.exit(pid, :kill)

      Process.sleep(100)

      # Device registry should still work
      assert {:ok, _conn} = DeviceRegistry.lookup_by_device("device_1")
      assert {:ok, _conn} = DeviceRegistry.lookup_by_device("device_2")
    end
  end

  describe "concurrent operations" do
    test "handles concurrent call creation safely" do
      # Create multiple calls concurrently from different processes
      parent = self()

      tasks =
        for i <- 1..10 do
          Task.async(fn ->
            call_id = "concurrent_#{i}_#{:rand.uniform(100000)}"
            result = CallSessionSupervisor.start_call(call_id, "business_1", "device_#{i}", :voice)
            send(parent, {:created, call_id})
            result
          end)
        end

      # All should succeed
      results = Task.await_many(tasks)
      assert Enum.all?(results, fn {:ok, pid} -> Process.alive?(pid) end)

      # Should receive all creation messages
      for _i <- 1..10 do
        assert_receive {:created, _call_id}, 1_000
      end
    end

    test "handles concurrent state transitions safely" do
      call_id = "concurrent_transitions_#{:rand.uniform(100000)}"
      {:ok, _pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)

      # Try multiple state transitions concurrently
      tasks = [
        Task.async(fn -> CallSession.set_ringing(call_id, "device_x", self()) end),
        Task.async(fn -> CallSession.set_connecting(call_id) end),
        Task.async(fn -> CallSession.get_state(call_id) end)
      ]

      # All operations should complete without crashing
      results = Task.await_many(tasks)
      assert length(results) == 3
      assert Enum.any?(results, fn result -> match?({:ok, _}, result) end)
    end
  end
end
