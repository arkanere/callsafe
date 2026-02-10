defmodule CallsafeSignaling.Protocol.StateMachineTest do
  use ExUnit.Case, async: true

  alias CallsafeSignaling.Protocol.StateMachine

  describe "initial_state/0" do
    test "returns :initiated" do
      assert StateMachine.initial_state() == :initiated
    end
  end

  describe "transition/2" do
    test "allows valid transitions" do
      assert {:ok, :ringing} = StateMachine.transition(:initiated, :ringing)
      assert {:ok, :connecting} = StateMachine.transition(:ringing, :connecting)
      assert {:ok, :connected} = StateMachine.transition(:connecting, :connected)
      assert {:ok, :ended} = StateMachine.transition(:connected, :ended)
    end

    test "rejects invalid transitions" do
      assert {:error, :invalid_transition} = StateMachine.transition(:initiated, :connected)
      assert {:error, :invalid_transition} = StateMachine.transition(:ringing, :ended)
      assert {:error, :invalid_transition} = StateMachine.transition(:ended, :initiated)
    end

    test "allows escalation transitions" do
      assert {:ok, :escalation_pending} = StateMachine.transition(:connected, :escalation_pending)
      assert {:ok, :connected} = StateMachine.transition(:escalation_pending, :connected)
    end

    test "allows video pause transitions" do
      assert {:ok, :video_paused_by_user} = StateMachine.transition(:connected, :video_paused_by_user)
      assert {:ok, :connected} = StateMachine.transition(:video_paused_by_user, :connected)
    end
  end

  describe "valid_transition?/2" do
    test "checks transition validity" do
      assert StateMachine.valid_transition?(:initiated, :ringing)
      refute StateMachine.valid_transition?(:initiated, :connected)
      assert StateMachine.valid_transition?(:connecting, :camera_permission_denied)
    end
  end

  describe "next_states/1" do
    test "returns valid next states for initiated" do
      next = StateMachine.next_states(:initiated)
      assert :ringing in next
      assert :busy in next
      assert :unavailable in next
      assert :cancelled in next
      assert :failed in next
    end

    test "returns empty list for terminal states" do
      assert StateMachine.next_states(:ended) == []
      assert StateMachine.next_states(:failed) == []
      assert StateMachine.next_states(:cancelled) == []
    end
  end

  describe "terminal?/1" do
    test "identifies terminal states" do
      assert StateMachine.terminal?(:ended)
      assert StateMachine.terminal?(:failed)
      assert StateMachine.terminal?(:cancelled)
      assert StateMachine.terminal?(:busy)
      assert StateMachine.terminal?(:unavailable)
      assert StateMachine.terminal?(:timeout)
    end

    test "identifies non-terminal states" do
      refute StateMachine.terminal?(:initiated)
      refute StateMachine.terminal?(:ringing)
      refute StateMachine.terminal?(:connecting)
      refute StateMachine.terminal?(:connected)
    end
  end
end
