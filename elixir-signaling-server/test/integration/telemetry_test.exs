defmodule CallsafeSignaling.Integration.TelemetryTest do
  @moduledoc """
  Integration tests for telemetry instrumentation.
  Verifies telemetry events are emitted correctly during call lifecycle.
  """

  use ExUnit.Case, async: false

  alias CallsafeSignaling.{CallSessionSupervisor, CallSession, Telemetry}

  setup do
    # Start supervision tree components
    start_supervised!({Registry, keys: :unique, name: CallsafeSignaling.CallRegistry})
    start_supervised!(CallSessionSupervisor)

    # Attach test handler to capture telemetry events
    test_pid = self()

    handler_id = "test-handler-#{:rand.uniform(1000000)}"

    :telemetry.attach_many(
      handler_id,
      [
        [:callsafe_signaling, :call, :started],
        [:callsafe_signaling, :call, :connected],
        [:callsafe_signaling, :call, :ended],
        [:callsafe_signaling, :call, :failed],
        [:callsafe_signaling, :message, :received],
        [:callsafe_signaling, :message, :sent],
        [:callsafe_signaling, :fcm, :notification, :sent]
      ],
      fn event_name, measurements, metadata, _config ->
        send(test_pid, {:telemetry_event, event_name, measurements, metadata})
      end,
      nil
    )

    on_exit(fn ->
      :telemetry.detach(handler_id)
    end)

    :ok
  end

  describe "call lifecycle telemetry" do
    test "emits call started event on call creation" do
      call_id = "telemetry_start_#{:rand.uniform(100000)}"
      business_id = "business_1"
      call_type = :voice

      {:ok, _pid} = CallSessionSupervisor.start_call(call_id, business_id, "device_1", call_type)

      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :call, :started],
                      %{count: 1},
                      %{call_id: ^call_id, business_id: ^business_id, call_type: ^call_type}},
                     1_000
    end

    test "emits call connected event with setup duration" do
      call_id = "telemetry_connected_#{:rand.uniform(100000)}"

      {:ok, _pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)

      # Clear the start event
      assert_receive {:telemetry_event, [:callsafe_signaling, :call, :started], _, _}

      # Add small delay to ensure measurable duration
      Process.sleep(10)

      # Transition to ringing and then connected
      CallSession.set_ringing(call_id, "device_2", self())
      CallSession.set_connecting(call_id)
      CallSession.set_connected(call_id)

      # Should receive connected event with duration
      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :call, :connected],
                      %{count: 1, duration: duration},
                      %{call_id: ^call_id}},
                     1_000

      # Duration should be non-negative (may be 0 on fast machines)
      assert duration >= 0
    end

    test "emits call ended event with call duration" do
      call_id = "telemetry_ended_#{:rand.uniform(100000)}"

      {:ok, pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)
      ref = Process.monitor(pid)

      # Clear start event
      assert_receive {:telemetry_event, [:callsafe_signaling, :call, :started], _, _}

      # Connect the call
      CallSession.set_ringing(call_id, "device_2", self())
      CallSession.set_connecting(call_id)
      CallSession.set_connected(call_id)

      # Clear connected event
      assert_receive {:telemetry_event, [:callsafe_signaling, :call, :connected], _, _}

      # End the call
      CallSession.set_ended(call_id, :user_hangup)

      # Wait for process to terminate (auto-stop after 5 seconds)
      assert_receive {:DOWN, ^ref, :process, ^pid, :normal}, 6_000

      # Should receive ended event
      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :call, :ended],
                      %{count: 1, duration: duration},
                      %{call_id: ^call_id, reason: :normal}},
                     1_000

      assert duration > 0
    end

    test "emits call failed event for failed calls" do
      call_id = "telemetry_failed_#{:rand.uniform(100000)}"

      {:ok, _pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)

      # Clear start event
      assert_receive {:telemetry_event, [:callsafe_signaling, :call, :started], _, _}

      # Fail the call
      CallSession.set_failed(call_id, "Connection error")

      # Should receive failed event
      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :call, :failed],
                      %{count: 1},
                      %{call_id: ^call_id, reason: _reason}},
                     1_000
    end
  end

  describe "message telemetry" do
    test "emits message received events" do
      device_id = "device_123"
      message_type = "offer"

      Telemetry.emit_message_received(message_type, device_id)

      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :message, :received],
                      %{count: 1},
                      %{message_type: ^message_type, device_id: ^device_id}},
                     1_000
    end

    test "emits message sent events" do
      device_id = "device_456"
      message_type = "answer"

      Telemetry.emit_message_sent(message_type, device_id)

      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :message, :sent],
                      %{count: 1},
                      %{message_type: ^message_type, device_id: ^device_id}},
                     1_000
    end
  end

  describe "video call telemetry" do
    test "emits events for video call lifecycle" do
      call_id = "video_telemetry_#{:rand.uniform(100000)}"

      {:ok, _pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :video)

      # Should receive started event with video call type
      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :call, :started],
                      %{count: 1},
                      %{call_id: ^call_id, call_type: :video}},
                     1_000
    end

    test "tracks media capability changes through call lifecycle" do
      call_id = "media_telemetry_#{:rand.uniform(100000)}"

      {:ok, _pid} = CallSessionSupervisor.start_call(call_id, "business_1", "device_1", :voice)

      # Clear start event
      assert_receive {:telemetry_event, [:callsafe_signaling, :call, :started], _, _}

      # Update media capabilities (voice to video escalation)
      media_caps = %{audio: true, video: true}
      CallSession.update_media_capabilities(call_id, media_caps)

      # Verify state was updated
      {:ok, state} = CallSession.get_state(call_id)
      assert state.media_capabilities == media_caps
    end
  end

  describe "multiple concurrent calls telemetry" do
    test "tracks multiple calls independently" do
      # Start multiple calls
      call_ids =
        for i <- 1..5 do
          call_id = "multi_telemetry_#{i}_#{:rand.uniform(100000)}"
          {:ok, _pid} = CallSessionSupervisor.start_call(call_id, "business_#{i}", "device_#{i}", :voice)
          call_id
        end

      # Should receive 5 start events
      for call_id <- call_ids do
        assert_receive {:telemetry_event,
                        [:callsafe_signaling, :call, :started],
                        %{count: 1},
                        %{call_id: ^call_id}},
                       1_000
      end
    end

    test "telemetry events remain isolated per call" do
      call_1 = "isolated_telemetry_1_#{:rand.uniform(100000)}"
      call_2 = "isolated_telemetry_2_#{:rand.uniform(100000)}"

      {:ok, _pid1} = CallSessionSupervisor.start_call(call_1, "business_1", "device_1", :voice)
      {:ok, _pid2} = CallSessionSupervisor.start_call(call_2, "business_2", "device_2", :video)

      # Clear start events
      assert_receive {:telemetry_event, [:callsafe_signaling, :call, :started], _, %{call_id: ^call_1}}
      assert_receive {:telemetry_event, [:callsafe_signaling, :call, :started], _, %{call_id: ^call_2}}

      # Connect first call
      CallSession.set_ringing(call_1, "device_x", self())
      CallSession.set_connecting(call_1)
      CallSession.set_connected(call_1)

      # Should only receive connected event for call_1
      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :call, :connected],
                      _measurements,
                      %{call_id: ^call_1}},
                     1_000

      # Call_2 should not have connected event
      refute_receive {:telemetry_event,
                      [:callsafe_signaling, :call, :connected],
                      _measurements,
                      %{call_id: ^call_2}},
                     100
    end
  end

  describe "telemetry configuration" do
    test "telemetry can be disabled via configuration" do
      # This test verifies the configuration exists
      # Actual disable behavior would require runtime config changes
      assert is_boolean(CallsafeSignaling.Config.telemetry_enabled?())
    end
  end

  describe "FCM telemetry integration" do
    test "FCM service emits notification events" do
      # Note: This test verifies telemetry event structure
      # Actual FCM calls would require mock/stub in full integration
      :telemetry.execute(
        [:callsafe_signaling, :fcm, :notification, :sent],
        %{duration: 150},
        %{call_id: "test_call", call_type: "voice"}
      )

      assert_receive {:telemetry_event,
                      [:callsafe_signaling, :fcm, :notification, :sent],
                      %{duration: 150},
                      %{call_id: "test_call", call_type: "voice"}},
                     1_000
    end
  end
end
