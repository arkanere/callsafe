defmodule CallsafeSignaling.CallSession do
  @moduledoc """
  GenServer managing a single call session.
  Implements call lifecycle with pure functional state transitions.
  Each call is an isolated process with automatic cleanup.
  """

  use GenServer
  require Logger

  alias CallsafeSignaling.Protocol.{StateMachine, Enums}
  alias CallsafeSignaling.Telemetry

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
          metadata: map()
        }

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
      metadata: Map.get(opts, :metadata, %{})
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
  Transition to ringing state.
  """
  @spec set_ringing(call_id, device_id, pid()) :: {:ok, call_state} | {:error, atom()}
  def set_ringing(call_id, callee_id, callee_pid) do
    call_genserver(call_id, {:transition, :ringing, %{callee_id: callee_id, callee_pid: callee_pid}})
  end

  @doc """
  Transition to connecting state.
  """
  @spec set_connecting(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_connecting(call_id) do
    call_genserver(call_id, {:transition, :connecting, %{}})
  end

  @doc """
  Transition to connected state.
  """
  @spec set_connected(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_connected(call_id) do
    call_genserver(call_id, {:transition, :connected, %{connected_at: System.system_time(:millisecond)}})
  end

  @doc """
  Transition to ended state.
  """
  @spec set_ended(call_id, Enums.call_end_reason()) :: {:ok, call_state} | {:error, atom()}
  def set_ended(call_id, reason) do
    call_genserver(call_id, {:transition, :ended, %{ended_at: System.system_time(:millisecond), end_reason: reason}})
  end

  @doc """
  Transition to failed state.
  """
  @spec set_failed(call_id, String.t()) :: {:ok, call_state} | {:error, atom()}
  def set_failed(call_id, error_message) do
    call_genserver(call_id, {:transition, :failed, %{ended_at: System.system_time(:millisecond), error: error_message}})
  end

  @doc """
  Transition to cancelled state.
  """
  @spec set_cancelled(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_cancelled(call_id) do
    call_genserver(call_id, {:transition, :cancelled, %{ended_at: System.system_time(:millisecond)}})
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
    call_genserver(call_id, {:transition, :unavailable, %{ended_at: System.system_time(:millisecond)}})
  end

  @doc """
  Transition to timeout state.
  """
  @spec set_timeout(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_timeout(call_id) do
    call_genserver(call_id, {:transition, :timeout, %{ended_at: System.system_time(:millisecond)}})
  end

  @doc """
  Transition to escalation_pending state.
  """
  @spec set_escalation_pending(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_escalation_pending(call_id) do
    call_genserver(call_id, {:transition, :escalation_pending, %{}})
  end

  @doc """
  Transition to video_paused_by_user state.
  """
  @spec set_video_paused_user(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_video_paused_user(call_id) do
    call_genserver(call_id, {:transition, :video_paused_by_user, %{}})
  end

  @doc """
  Transition to video_paused_bandwidth state.
  """
  @spec set_video_paused_bandwidth(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_video_paused_bandwidth(call_id) do
    call_genserver(call_id, {:transition, :video_paused_bandwidth, %{}})
  end

  @doc """
  Transition to camera_permission_denied state.
  """
  @spec set_camera_permission_denied(call_id) :: {:ok, call_state} | {:error, atom()}
  def set_camera_permission_denied(call_id) do
    call_genserver(call_id, {:transition, :camera_permission_denied, %{}})
  end

  @doc """
  Update media capabilities.
  """
  @spec update_media_capabilities(call_id, map()) :: {:ok, call_state} | {:error, atom()}
  def update_media_capabilities(call_id, capabilities) do
    call_genserver(call_id, {:update_media, capabilities})
  end

  @doc """
  Set caller connection PID.
  """
  @spec set_caller_pid(call_id, pid()) :: {:ok, call_state} | {:error, atom()}
  def set_caller_pid(call_id, pid) do
    call_genserver(call_id, {:set_caller_pid, pid})
  end

  @doc """
  Set callee connection PID.
  """
  @spec set_callee_pid(call_id, pid()) :: {:ok, call_state} | {:error, atom()}
  def set_callee_pid(call_id, pid) do
    call_genserver(call_id, {:set_callee_pid, pid})
  end

  @doc """
  Send message to caller.
  """
  @spec send_to_caller(call_id, String.t(), map()) :: :ok | {:error, atom()}
  def send_to_caller(call_id, message_type, payload) do
    case get_state(call_id) do
      {:ok, state} when not is_nil(state.caller_pid) ->
        send(state.caller_pid, {:send_message, message_type, payload})
        :ok

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
        send(state.callee_pid, {:send_message, message_type, payload})
        :ok

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
    Telemetry.emit_call_started(initial_state.call_id, initial_state.business_id, initial_state.call_type)
    {:ok, initial_state}
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, state, state}
  end

  @impl true
  def handle_call({:transition, new_state, updates}, _from, state) do
    case StateMachine.transition(state.state, new_state) do
      {:ok, validated_state} ->
        updated_state = Map.merge(state, updates) |> Map.put(:state, validated_state)
        Logger.debug("Call #{state.call_id} transitioned: #{state.state} -> #{validated_state}")

        # Emit telemetry events for specific transitions
        emit_transition_telemetry(validated_state, updated_state, state)

        # Auto-stop if terminal state reached
        if StateMachine.terminal?(validated_state) do
          # Schedule stop after allowing time for final messages
          Process.send_after(self(), :auto_stop, 5_000)
        end

        {:reply, {:ok, updated_state}, updated_state}

      {:error, :invalid_transition} ->
        Logger.warning("Invalid transition for call #{state.call_id}: #{state.state} -> #{new_state}")
        {:reply, {:error, :invalid_transition}, state}
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
    updated_state = Map.put(state, :caller_pid, pid)
    Logger.debug("Caller PID set for call #{state.call_id}")
    {:reply, {:ok, updated_state}, updated_state}
  end

  @impl true
  def handle_call({:set_callee_pid, pid}, _from, state) do
    updated_state = Map.put(state, :callee_pid, pid)
    Logger.debug("Callee PID set for call #{state.call_id}")
    {:reply, {:ok, updated_state}, updated_state}
  end

  @impl true
  def handle_info(:auto_stop, state) do
    Logger.info("Call session auto-stopping: #{state.call_id} (terminal state: #{state.state})")
    {:stop, :normal, state}
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

  # Helper for emitting telemetry on state transitions
  defp emit_transition_telemetry(:connected, updated_state, old_state) do
    setup_duration = updated_state.connected_at - old_state.initiated_at
    Telemetry.emit_call_connected(updated_state.call_id, setup_duration)
  end

  defp emit_transition_telemetry(:failed, updated_state, _old_state) do
    error = Map.get(updated_state.metadata, :error, "unknown")
    Telemetry.emit_call_failed(updated_state.call_id, error)
  end

  defp emit_transition_telemetry(_state, _updated_state, _old_state), do: :ok
end
