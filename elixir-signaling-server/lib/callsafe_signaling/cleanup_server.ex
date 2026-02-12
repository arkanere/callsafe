defmodule CallsafeSignaling.CleanupServer do
  @moduledoc """
  Periodic cleanup server for stale call sessions.
  Runs every 5 minutes to clean up sessions in terminal states.
  Prevents unbounded memory growth from orphaned sessions.
  """

  use GenServer
  require Logger

  alias CallsafeSignaling.Protocol.StateMachine

  # Cleanup interval (5 minutes)
  @cleanup_interval 300_000

  # Grace period before cleaning up terminal sessions (1 minute)
  @terminal_grace_period 60_000

  # Client API

  @doc """
  Start the CleanupServer GenServer.
  """
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Trigger immediate cleanup (for testing).
  """
  def cleanup_now do
    GenServer.cast(__MODULE__, :cleanup)
  end

  # Server callbacks

  @impl true
  def init(_opts) do
    # Schedule first cleanup
    schedule_cleanup()
    Logger.info("CleanupServer started, cleanup interval: #{@cleanup_interval}ms")
    {:ok, %{last_cleanup: System.monotonic_time(:millisecond)}}
  end

  @impl true
  def handle_info(:cleanup, state) do
    start_time = System.monotonic_time(:millisecond)

    # Perform cleanup
    cleaned_count = cleanup_stale_sessions()

    duration = System.monotonic_time(:millisecond) - start_time

    Logger.info(
      "Cleanup completed: #{cleaned_count} sessions cleaned in #{duration}ms",
      cleaned: cleaned_count,
      duration_ms: duration
    )

    # Schedule next cleanup
    schedule_cleanup()

    {:noreply, %{state | last_cleanup: start_time}}
  end

  @impl true
  def handle_cast(:cleanup, state) do
    send(self(), :cleanup)
    {:noreply, state}
  end

  # Private functions

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup, @cleanup_interval)
  end

  defp cleanup_stale_sessions do
    # Get all call sessions from the registry
    Registry.select(CallsafeSignaling.CallRegistry, [{{:"$1", :"$2", :"$3"}, [], [{{:"$1", :"$2"}}]}])
    |> Enum.reduce(0, fn {call_id, pid}, count ->
      if should_cleanup_session?(pid) do
        cleanup_session(call_id, pid)
        count + 1
      else
        count
      end
    end)
  end

  defp should_cleanup_session?(pid) do
    # Get session state
    case GenServer.call(pid, :get_state, 1000) do
      state when is_map(state) ->
        # Check if session is in terminal state
        is_terminal = StateMachine.terminal?(state.state)

        # Check if session has been in terminal state long enough
        if is_terminal and state.ended_at do
          age = System.system_time(:millisecond) - state.ended_at
          age > @terminal_grace_period
        else
          false
        end

      _ ->
        false
    end
  rescue
    # If we can't get state (process died, timeout, etc.), don't clean it up
    # The supervisor will handle dead processes
    error ->
      Logger.debug("Error checking session state: #{inspect(error)}")
      false
  end

  defp cleanup_session(call_id, pid) do
    Logger.debug("Cleaning up stale session: #{call_id}")

    # Stop the session process
    GenServer.stop(pid, :normal)
  rescue
    error ->
      Logger.warning("Error cleaning up session #{call_id}: #{inspect(error)}")
  end
end
