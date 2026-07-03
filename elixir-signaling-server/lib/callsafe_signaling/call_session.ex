defmodule CallsafeSignaling.CallSession do
  @moduledoc """
  GenServer managing a single call session (protocol v2).

  Server-authoritative state machine keyed by callAttemptId. Owns all
  call-scoped timers (ringing, connecting, escalation, reconnect grace,
  terminal retention) and participant socket monitoring for the mid-call
  reconnect flow.
  """

  use GenServer
  require Logger

  alias CallsafeSignaling.Protocol.{Enums, StateMachine}
  alias CallsafeSignaling.{DecisionCapture, DeviceRegistry, Telemetry}

  @type call_id :: String.t()
  @type device_id :: String.t()
  @type business_id :: String.t()

  @type call_state :: %{
          call_id: call_id,
          business_id: business_id,
          caller_id: device_id,
          callee_id: device_id | nil,
          call_type: Enums.call_type(),
          state: Enums.call_state(),
          initiated_at: integer(),
          connected_at: integer() | nil,
          ended_at: integer() | nil,
          caller_pid: pid() | nil,
          callee_pid: pid() | nil,
          media_capabilities: map() | nil,
          callee_media_capabilities: map() | nil,
          notified_device_ids: MapSet.t(device_id),
          rejected_device_ids: MapSet.t(device_id),
          escalation_requested_by: Enums.role() | nil,
          renegotiation_offerer: Enums.role() | nil,
          end_reason: Enums.call_end_reason() | nil,
          ended_by: Enums.role() | nil,
          fail_reason: atom() | nil,
          metadata: map(),
          ringing_timer: reference() | nil,
          connecting_timer: reference() | nil,
          escalation_timer: reference() | nil,
          reconnect_timers: %{customer: reference() | nil, business: reference() | nil},
          monitors: %{reference() => Enums.role()}
        }

  # Timeout values read from application config at runtime so tests can override them.
  defp ringing_timeout, do: Application.get_env(:callsafe_signaling, :timeout_ringing, 30_000)

  defp connecting_timeout,
    do: Application.get_env(:callsafe_signaling, :timeout_connecting, 30_000)

  defp escalation_timeout,
    do: Application.get_env(:callsafe_signaling, :timeout_escalation, 30_000)

  defp reconnect_grace,
    do: Application.get_env(:callsafe_signaling, :timeout_reconnect_grace, 30_000)

  defp terminal_retention,
    do: Application.get_env(:callsafe_signaling, :terminal_retention, 60_000)

  # Client API

  @doc """
  Start a new call session.
  Returns {:ok, pid} or {:error, reason}.
  """
  @spec start_link(call_id, business_id, device_id, Enums.call_type(), map()) ::
          {:ok, pid()} | {:error, any()}
  def start_link(call_id, business_id, caller_id, call_type, opts \\ %{}) do
    initial_state = %{
      call_id: call_id,
      business_id: business_id,
      caller_id: caller_id,
      callee_id: nil,
      call_type: call_type,
      state: StateMachine.initial_state(),
      initiated_at: System.system_time(:millisecond),
      connected_at: nil,
      ended_at: nil,
      caller_pid: nil,
      callee_pid: nil,
      media_capabilities: Map.get(opts, :media_capabilities),
      callee_media_capabilities: nil,
      notified_device_ids: MapSet.new(),
      rejected_device_ids: MapSet.new(),
      escalation_requested_by: nil,
      renegotiation_offerer: nil,
      end_reason: nil,
      ended_by: nil,
      fail_reason: nil,
      metadata: Map.get(opts, :metadata, %{}),
      ringing_timer: nil,
      connecting_timer: nil,
      escalation_timer: nil,
      reconnect_timers: %{customer: nil, business: nil},
      monitors: %{}
    }

    GenServer.start_link(__MODULE__, initial_state, name: via_tuple(call_id))
  end

  @doc """
  Get current call state.
  """
  @spec get_state(call_id) :: {:ok, call_state} | {:error, :not_found}
  def get_state(call_id) do
    case whereis(call_id) do
      nil -> {:error, :not_found}
      pid -> {:ok, GenServer.call(pid, :get_state)}
    end
  end

  @doc """
  Transition to ringing state (devices have been notified).
  """
  @spec set_ringing(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_ringing(call_id) do
    call_genserver(call_id, {:transition, :ringing, %{}})
  end

  @doc """
  Transition to connecting state, binding the accepting device.
  """
  @spec set_connecting(call_id, device_id, pid(), map() | nil) ::
          {:ok, call_state} | {:error, atom()}
  def set_connecting(call_id, callee_id, callee_pid, callee_media_capabilities \\ nil) do
    call_genserver(
      call_id,
      {:transition, :connecting,
       %{
         callee_id: callee_id,
         callee_pid: callee_pid,
         callee_media_capabilities: callee_media_capabilities
       }}
    )
  end

  @doc """
  Transition to connected state.
  """
  @spec set_connected(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_connected(call_id) do
    call_genserver(
      call_id,
      {:transition, :connected, %{connected_at: System.system_time(:millisecond)}}
    )
  end

  @doc """
  Transition to ended state.
  """
  @spec set_ended(call_id, Enums.call_end_reason(), Enums.role()) ::
          {:ok, call_state} | {:error, atom()}
  def set_ended(call_id, reason, ended_by) do
    call_genserver(
      call_id,
      {:transition, :ended,
       %{ended_at: System.system_time(:millisecond), end_reason: reason, ended_by: ended_by}}
    )
  end

  @doc """
  Transition to failed state. Reason is a CallFailReason atom.
  """
  @spec set_failed(call_id, atom()) :: {:ok, call_state} | {:error, atom()}
  def set_failed(call_id, fail_reason) do
    call_genserver(
      call_id,
      {:transition, :failed,
       %{ended_at: System.system_time(:millisecond), fail_reason: fail_reason}}
    )
  end

  @doc """
  Transition to cancelled state.
  """
  @spec set_cancelled(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_cancelled(call_id) do
    call_genserver(
      call_id,
      {:transition, :cancelled, %{ended_at: System.system_time(:millisecond)}}
    )
  end

  @doc """
  Transition to busy state.
  """
  @spec set_busy(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_busy(call_id) do
    call_genserver(call_id, {:transition, :busy, %{ended_at: System.system_time(:millisecond)}})
  end

  @doc """
  Transition to unavailable state.
  """
  @spec set_unavailable(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_unavailable(call_id) do
    call_genserver(
      call_id,
      {:transition, :unavailable, %{ended_at: System.system_time(:millisecond)}}
    )
  end

  @doc """
  Transition to escalation_pending, recording the requesting role and its
  updated capabilities. Starts the escalation timer.
  """
  @spec set_escalation_pending(call_id, Enums.role(), map()) ::
          {:ok, call_state} | {:error, atom()}
  def set_escalation_pending(call_id, requested_by, media_capabilities) do
    call_genserver(
      call_id,
      {:transition, :escalation_pending,
       %{escalation_requested_by: requested_by, escalation_capabilities: media_capabilities}}
    )
  end

  @doc """
  Resolve a pending escalation: :accepted upgrades the call to video and marks
  the original requester as the renegotiation offerer; :rejected reverts to a
  plain connected voice call. Returns the requesting role along with the state.
  """
  @spec resolve_escalation(call_id, :accepted | :rejected) ::
          {:ok, call_state} | {:error, atom()}
  def resolve_escalation(call_id, resolution) do
    call_genserver(call_id, {:resolve_escalation, resolution})
  end

  @doc """
  Downgrade a connected video call to voice. The requester becomes the
  renegotiation offerer. No state transition (stays connected).
  """
  @spec downgrade(call_id, Enums.role()) :: {:ok, call_state} | {:error, atom()}
  def downgrade(call_id, requested_by) do
    call_genserver(call_id, {:downgrade, requested_by})
  end

  @doc """
  Record devices that were notified with call:incoming.
  """
  @spec add_notified_devices(call_id, [device_id]) :: {:ok, call_state} | {:error, atom()}
  def add_notified_devices(call_id, device_ids) do
    call_genserver(call_id, {:add_notified_devices, device_ids})
  end

  @doc """
  Record a call:reject from a device. When every notified device has rejected,
  the call transitions to unavailable and :all_rejected is returned.
  """
  @spec record_reject(call_id, device_id) ::
          {:ok, :all_rejected | :pending, call_state} | {:error, atom()}
  def record_reject(call_id, device_id) do
    call_genserver(call_id, {:record_reject, device_id})
  end

  @doc """
  Re-bind a participant to a new connection after a mid-call reconnect.
  Cancels the reconnect-grace timer for that participant.
  """
  @spec reconnect(call_id, device_id, pid()) :: {:ok, call_state} | {:error, atom()}
  def reconnect(call_id, device_id, pid) do
    call_genserver(call_id, {:reconnect, device_id, pid})
  end

  @doc """
  Update caller media capabilities.
  """
  @spec update_media_capabilities(call_id, map()) :: {:ok, call_state} | {:error, atom()}
  def update_media_capabilities(call_id, capabilities) do
    call_genserver(call_id, {:update_media, capabilities})
  end

  @doc """
  Set caller connection PID (monitored for reconnect grace).
  """
  @spec set_caller_pid(call_id, pid()) :: {:ok, call_state} | {:error, atom()}
  def set_caller_pid(call_id, pid) do
    call_genserver(call_id, {:set_caller_pid, pid})
  end

  @doc """
  Send message to caller.
  """
  @spec send_to_caller(call_id, String.t(), map()) :: :ok | {:error, atom()}
  def send_to_caller(call_id, message_type, payload) do
    case get_state(call_id) do
      {:ok, state} when not is_nil(state.caller_pid) ->
        notifier().notify(state.caller_pid, message_type, payload)

      {:ok, _state} ->
        {:error, :caller_not_connected}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Send message to callee.
  """
  @spec send_to_callee(call_id, String.t(), map()) :: :ok | {:error, atom()}
  def send_to_callee(call_id, message_type, payload) do
    case get_state(call_id) do
      {:ok, state} when not is_nil(state.callee_pid) ->
        notifier().notify(state.callee_pid, message_type, payload)

      {:ok, _state} ->
        {:error, :callee_not_connected}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Send message to both peers.
  """
  @spec broadcast(call_id, String.t(), map()) :: :ok | {:error, atom()}
  def broadcast(call_id, message_type, payload) do
    with :ok <- send_to_caller(call_id, message_type, payload),
         :ok <- send_to_callee(call_id, message_type, payload) do
      :ok
    end
  end

  @doc """
  List active (non-terminal) sessions for a business.
  """
  @spec list_for_business(business_id) :: [call_state]
  def list_for_business(business_id) do
    Registry.select(CallsafeSignaling.CallRegistry, [
      {{:"$1", :"$2", :_}, [], [{{:"$1", :"$2"}}]}
    ])
    |> Enum.flat_map(fn {_call_id, pid} ->
      try do
        state = GenServer.call(pid, :get_state, 1000)
        if state.business_id == business_id, do: [state], else: []
      catch
        :exit, _ -> []
      end
    end)
  end

  @doc """
  Stop the call session.
  """
  @spec stop(call_id) :: :ok
  def stop(call_id) do
    case whereis(call_id) do
      nil -> :ok
      pid -> GenServer.stop(pid, :normal)
    end
  end

  # Private helpers

  defp notifier,
    do: Application.get_env(:callsafe_signaling, :notifier, CallsafeSignaling.Notifier.Default)

  defp via_tuple(call_id) do
    {:via, Registry, {CallsafeSignaling.CallRegistry, call_id}}
  end

  defp whereis(call_id) do
    case Registry.lookup(CallsafeSignaling.CallRegistry, call_id) do
      [{pid, _}] -> pid
      [] -> nil
    end
  end

  defp call_genserver(call_id, message) do
    case whereis(call_id) do
      nil -> {:error, :not_found}
      pid -> GenServer.call(pid, message)
    end
  end

  # Server callbacks

  @impl true
  def init(initial_state) do
    Logger.info("Call session started: #{initial_state.call_id} (#{initial_state.call_type})")

    Telemetry.emit_call_started(
      initial_state.call_id,
      initial_state.business_id,
      initial_state.call_type
    )

    {:ok, initial_state}
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, state, state}
  end

  @impl true
  def handle_call({:transition, new_state, updates}, _from, state) do
    case do_transition(state, new_state, updates) do
      {:ok, updated_state} -> {:reply, {:ok, updated_state}, updated_state}
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call({:resolve_escalation, resolution}, _from, state) do
    updates =
      case resolution do
        :accepted ->
          %{call_type: :video, renegotiation_offerer: state.escalation_requested_by}

        :rejected ->
          %{}
      end

    case do_transition(state, :connected, updates) do
      {:ok, updated_state} -> {:reply, {:ok, updated_state}, updated_state}
      {:error, reason} -> {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_call({:downgrade, requested_by}, _from, state) do
    if state.state == :connected and state.call_type == :video do
      updated_state = %{state | call_type: :voice, renegotiation_offerer: requested_by}
      Logger.info("Call #{state.call_id} downgraded to voice by #{requested_by}")
      {:reply, {:ok, updated_state}, updated_state}
    else
      {:reply, {:error, :invalid_transition}, state}
    end
  end

  @impl true
  def handle_call({:add_notified_devices, device_ids}, _from, state) do
    updated_state = %{
      state
      | notified_device_ids: MapSet.union(state.notified_device_ids, MapSet.new(device_ids))
    }

    {:reply, {:ok, updated_state}, updated_state}
  end

  @impl true
  def handle_call({:record_reject, device_id}, _from, state) do
    cond do
      state.state != :ringing ->
        {:reply, {:error, :invalid_transition}, state}

      not MapSet.member?(state.notified_device_ids, device_id) ->
        {:reply, {:error, :not_notified}, state}

      true ->
        rejected = MapSet.put(state.rejected_device_ids, device_id)
        state = %{state | rejected_device_ids: rejected}

        if MapSet.subset?(state.notified_device_ids, rejected) do
          case do_transition(state, :unavailable, %{
                 ended_at: System.system_time(:millisecond)
               }) do
            {:ok, updated_state} -> {:reply, {:ok, :all_rejected, updated_state}, updated_state}
            {:error, reason} -> {:reply, {:error, reason}, state}
          end
        else
          {:reply, {:ok, :pending, state}, state}
        end
    end
  end

  @impl true
  def handle_call({:reconnect, device_id, pid}, _from, state) do
    cond do
      state.state not in [:connecting, :connected, :escalation_pending] ->
        {:reply, {:error, :invalid_transition}, state}

      device_id == state.caller_id ->
        state = rebind_participant(state, :customer, :caller_pid, pid)
        {:reply, {:ok, state}, state}

      device_id == state.callee_id ->
        state = rebind_participant(state, :business, :callee_pid, pid)
        {:reply, {:ok, state}, state}

      true ->
        {:reply, {:error, :not_participant}, state}
    end
  end

  @impl true
  def handle_call({:update_media, capabilities}, _from, state) do
    updated_state = Map.put(state, :media_capabilities, capabilities)
    Logger.debug("Media capabilities updated for call #{state.call_id}")
    {:reply, {:ok, updated_state}, updated_state}
  end

  @impl true
  def handle_call({:set_caller_pid, pid}, _from, state) do
    updated_state =
      state
      |> Map.put(:caller_pid, pid)
      |> monitor_participant(:customer, pid)

    Logger.debug("Caller PID set for call #{state.call_id}")
    {:reply, {:ok, updated_state}, updated_state}
  end

  # Core transition logic shared by handle_call clauses and timer handlers.
  defp do_transition(state, new_state, updates) do
    case StateMachine.transition(state.state, new_state) do
      {:ok, validated_state} ->
        # Capture state transition decision
        DecisionCapture.emit_state_transition(
          state.call_id,
          nil,
          state.state,
          validated_state,
          %{
            business_id: state.business_id,
            call_type: state.call_type,
            updates: Map.keys(updates)
          }
        )

        {escalation_caps, updates} = Map.pop(updates, :escalation_capabilities)

        updated_state =
          state
          |> cancel_lifecycle_timers()
          |> Map.merge(updates)
          |> Map.put(:state, validated_state)
          |> maybe_store_escalation_caps(escalation_caps)
          |> maybe_monitor_callee(updates)
          |> schedule_timeout_for_state(validated_state)

        Logger.debug("Call #{state.call_id} transitioned: #{state.state} -> #{validated_state}")

        # Emit telemetry events for specific transitions
        emit_transition_telemetry(validated_state, updated_state, state)

        updated_state =
          if StateMachine.terminal?(validated_state) do
            # Retain the session for late-message handling (invalid_state
            # while retained, call_not_found after cleanup), then stop.
            Process.send_after(self(), :auto_stop, terminal_retention())
            cancel_reconnect_timers(updated_state)
          else
            updated_state
          end

        {:ok, updated_state}

      {:error, :invalid_transition} ->
        Logger.warning(
          "Invalid transition for call #{state.call_id}: #{state.state} -> #{new_state}"
        )

        # Capture error decision
        DecisionCapture.emit_error_returned(
          state.call_id,
          nil,
          :invalid_transition,
          "Cannot transition from #{state.state} to #{new_state}",
          %{current_state: state.state, requested_state: new_state}
        )

        {:error, :invalid_transition}
    end
  end

  defp maybe_store_escalation_caps(state, nil), do: state

  defp maybe_store_escalation_caps(state, caps) do
    # Requester's updated capabilities during escalation
    case state.escalation_requested_by do
      :customer -> %{state | media_capabilities: caps}
      :business -> %{state | callee_media_capabilities: caps}
      _ -> state
    end
  end

  # Monitor the callee socket when it gets bound by set_connecting.
  defp maybe_monitor_callee(state, %{callee_pid: pid}) when is_pid(pid) do
    monitor_participant(state, :business, pid)
  end

  defp maybe_monitor_callee(state, _updates), do: state

  defp monitor_participant(state, role, pid) do
    # Drop any previous monitor for this role (reconnect/supersede).
    monitors =
      state.monitors
      |> Enum.reject(fn {ref, r} ->
        if r == role do
          Process.demonitor(ref, [:flush])
          true
        else
          false
        end
      end)
      |> Map.new()

    ref = Process.monitor(pid)
    %{state | monitors: Map.put(monitors, ref, role)}
  end

  defp rebind_participant(state, role, pid_key, pid) do
    state
    |> Map.put(pid_key, pid)
    |> cancel_reconnect_timer(role)
    |> monitor_participant(role, pid)
  end

  @impl true
  def handle_info(:auto_stop, state) do
    Logger.info("Call session auto-stopping: #{state.call_id} (terminal state: #{state.state})")
    {:stop, :normal, state}
  end

  @impl true
  def handle_info(:ringing_timeout, state) do
    handle_phase_timeout(state, :ringing, ringing_timeout())
  end

  @impl true
  def handle_info(:connecting_timeout, state) do
    handle_phase_timeout(state, :connecting, connecting_timeout())
  end

  @impl true
  def handle_info(:escalation_timeout, state) do
    if state.state == :escalation_pending do
      DecisionCapture.emit_timeout_triggered(
        state.call_id,
        :escalation,
        state.state,
        %{timeout_duration: escalation_timeout()}
      )

      case do_transition(%{state | escalation_timer: nil}, :connected, %{}) do
        {:ok, updated_state} ->
          notify_requester(updated_state, "escalation:rejected", %{
            "callAttemptId" => state.call_id,
            "reason" => "timeout",
            "timestamp" => System.system_time(:millisecond)
          })

          {:noreply, %{updated_state | escalation_requested_by: nil}}

        {:error, _} ->
          {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:reconnect_grace_expired, role}, state) do
    if state.reconnect_timers[role] do
      Logger.warning("Call #{state.call_id}: #{role} did not reconnect within grace period")

      state = %{state | reconnect_timers: Map.put(state.reconnect_timers, role, nil)}

      case do_transition(state, :failed, %{
             ended_at: System.system_time(:millisecond),
             fail_reason: :peer_disconnected
           }) do
        {:ok, updated_state} ->
          notify_peer_disconnected(updated_state, role)
          {:noreply, updated_state}

        {:error, _} ->
          {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  @impl true
  def handle_info({:DOWN, ref, :process, _pid, _reason}, state) do
    case Map.pop(state.monitors, ref) do
      {nil, _monitors} ->
        {:noreply, state}

      {role, monitors} ->
        state = %{state | monitors: monitors}
        {:noreply, handle_participant_down(state, role)}
    end
  end

  @impl true
  def terminate(reason, state) do
    Logger.info("Call session terminated: #{state.call_id}, reason: #{inspect(reason)}")

    # Emit telemetry for call ending
    if state.connected_at do
      duration = System.system_time(:millisecond) - state.connected_at
      Telemetry.emit_call_ended(state.call_id, duration, reason)
    end

    :ok
  end

  # A participant socket dropped. During ringing (caller) and the in-call
  # states we hold the call for reconnect_grace awaiting call:reconnect.
  defp handle_participant_down(state, role) do
    reconnectable =
      (role == :customer and state.state == :ringing) or
        state.state in [:connecting, :connected, :escalation_pending]

    if reconnectable do
      Logger.info(
        "Call #{state.call_id}: #{role} socket down, holding for reconnect (#{reconnect_grace()}ms)"
      )

      pid_key = if role == :customer, do: :caller_pid, else: :callee_pid
      timer = Process.send_after(self(), {:reconnect_grace_expired, role}, reconnect_grace())

      state
      |> Map.put(pid_key, nil)
      |> Map.put(:reconnect_timers, Map.put(state.reconnect_timers, role, timer))
    else
      state
    end
  end

  # Reconnect grace expired: the call failed. Tell whoever is still there.
  defp notify_peer_disconnected(state, disconnected_role) do
    payload = %{
      "callAttemptId" => state.call_id,
      "reason" => "peer_disconnected",
      "timestamp" => System.system_time(:millisecond)
    }

    survivor_pid = if disconnected_role == :customer, do: state.callee_pid, else: state.caller_pid

    if survivor_pid do
      notifier().notify(survivor_pid, "call:failed", payload)
    end

    # Caller lost during ringing: tell the ringing devices to stand down.
    if disconnected_role == :customer and is_nil(state.callee_id) do
      cancel_payload = %{
        "callAttemptId" => state.call_id,
        "reason" => "cancelled_by_caller",
        "timestamp" => System.system_time(:millisecond)
      }

      send_to_ringing_devices(state, "call:cancelled", cancel_payload)
    end

    :ok
  end

  defp handle_phase_timeout(state, phase, duration) do
    Logger.warning("Call #{state.call_id} timed out in #{phase} (#{duration}ms)")

    DecisionCapture.emit_timeout_triggered(
      state.call_id,
      phase,
      state.state,
      %{timeout_duration: duration}
    )

    timer_key = if phase == :ringing, do: :ringing_timer, else: :connecting_timer

    case do_transition(Map.put(state, timer_key, nil), :timeout, %{
           ended_at: System.system_time(:millisecond)
         }) do
      {:ok, updated_state} ->
        notify_timeout(updated_state, phase, duration)
        {:noreply, updated_state}

      {:error, :invalid_transition} ->
        Logger.debug("Cannot timeout from state: #{state.state}")
        {:noreply, state}
    end
  end

  # Helper for emitting telemetry on state transitions
  defp emit_transition_telemetry(:connected, updated_state, old_state) do
    # Escalation resolution also lands on :connected; only the first
    # connect (from connecting) is a call-setup event.
    if old_state.state == :connecting do
      setup_duration = updated_state.connected_at - old_state.initiated_at
      Telemetry.emit_call_connected(updated_state.call_id, setup_duration)
    else
      :ok
    end
  end

  defp emit_transition_telemetry(:failed, updated_state, _old_state) do
    Telemetry.emit_call_failed(updated_state.call_id, updated_state.fail_reason || "unknown")
  end

  defp emit_transition_telemetry(_state, _updated_state, _old_state), do: :ok

  # Timer management helpers

  defp cancel_lifecycle_timers(state) do
    Enum.reduce([:ringing_timer, :connecting_timer, :escalation_timer], state, fn key, acc ->
      if acc[key] do
        Process.cancel_timer(acc[key])
        Map.put(acc, key, nil)
      else
        acc
      end
    end)
  end

  defp cancel_reconnect_timers(state) do
    Enum.reduce([:customer, :business], state, fn role, acc ->
      cancel_reconnect_timer(acc, role)
    end)
  end

  defp cancel_reconnect_timer(state, role) do
    case state.reconnect_timers[role] do
      nil ->
        state

      timer ->
        Process.cancel_timer(timer)
        %{state | reconnect_timers: Map.put(state.reconnect_timers, role, nil)}
    end
  end

  defp schedule_timeout_for_state(state, :ringing) do
    timeout = ringing_timeout()

    DecisionCapture.emit_timeout_set(state.call_id, nil, :ringing, timeout, %{state: :ringing})

    timer_ref = Process.send_after(self(), :ringing_timeout, timeout)
    Map.put(state, :ringing_timer, timer_ref)
  end

  defp schedule_timeout_for_state(state, :connecting) do
    timeout = connecting_timeout()

    DecisionCapture.emit_timeout_set(
      state.call_id,
      nil,
      :connecting,
      timeout,
      %{state: :connecting}
    )

    timer_ref = Process.send_after(self(), :connecting_timeout, timeout)
    Map.put(state, :connecting_timer, timer_ref)
  end

  defp schedule_timeout_for_state(state, :escalation_pending) do
    timeout = escalation_timeout()

    DecisionCapture.emit_timeout_set(
      state.call_id,
      nil,
      :escalation,
      timeout,
      %{state: :escalation_pending}
    )

    timer_ref = Process.send_after(self(), :escalation_timeout, timeout)
    Map.put(state, :escalation_timer, timer_ref)
  end

  defp schedule_timeout_for_state(state, _other_state), do: state

  defp notify_timeout(state, phase, duration) do
    payload = %{
      "callAttemptId" => state.call_id,
      "phase" => Atom.to_string(phase),
      "timeoutDuration" => duration,
      "timestamp" => System.system_time(:millisecond)
    }

    if state.caller_pid do
      notifier().notify(state.caller_pid, "call:timeout", payload)
    end

    case phase do
      # phase=ringing: caller and all ringing devices
      :ringing ->
        send_to_ringing_devices(state, "call:timeout", payload)

      # phase=connecting: both participants
      :connecting ->
        if state.callee_pid, do: notifier().notify(state.callee_pid, "call:timeout", payload)
    end

    :ok
  end

  # Send to every notified device that is still ringing (not rejected),
  # via its registry connection pid.
  defp send_to_ringing_devices(state, message_type, payload) do
    state.notified_device_ids
    |> MapSet.difference(state.rejected_device_ids)
    |> Enum.each(fn device_id ->
      case DeviceRegistry.lookup_by_device(device_id) do
        {:ok, %{connection_pid: pid}} when is_pid(pid) ->
          notifier().notify(pid, message_type, payload)

        _ ->
          :ok
      end
    end)
  end

  defp notify_requester(state, message_type, payload) do
    requester_pid =
      case state.escalation_requested_by do
        :customer -> state.caller_pid
        :business -> state.callee_pid
        _ -> nil
      end

    if requester_pid do
      notifier().notify(requester_pid, message_type, payload)
    end

    :ok
  end
end
