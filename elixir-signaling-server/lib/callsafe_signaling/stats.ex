defmodule CallsafeSignaling.Stats do
  @moduledoc """
  Statistics tracking using :counters for performance.
  Provides O(1) increment and read operations for server metrics.
  """

  use GenServer
  require Logger

  # Counter indices
  @connections_total 0
  @connections_active 1
  @messages_received 2
  @messages_sent 3
  @calls_initiated 4
  @calls_accepted 5
  @calls_connected 6
  @calls_ended 7
  @calls_failed 8
  @calls_rejected 9
  @fcm_sent 10
  @fcm_failed 11

  # Client API

  @doc """
  Start the Stats GenServer.
  """
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  # Safe counter increment - returns :ok even if counters not initialized
  defp safe_increment(index) do
    try do
      case :persistent_term.get(:stats_counters, :not_found) do
        :not_found -> :ok
        ref -> :counters.add(ref, index + 1, 1)
      end
    rescue
      _ -> :ok
    end
  end

  defp safe_decrement(index) do
    try do
      case :persistent_term.get(:stats_counters, :not_found) do
        :not_found -> :ok
        ref -> :counters.sub(ref, index + 1, 1)
      end
    rescue
      _ -> :ok
    end
  end

  @doc """
  Increment connection total counter.
  """
  def increment_connections_total do
    safe_increment(@connections_total)
  end

  @doc """
  Increment active connections counter.
  """
  def increment_connections_active do
    safe_increment(@connections_active)
  end

  @doc """
  Decrement active connections counter.
  """
  def decrement_connections_active do
    safe_decrement(@connections_active)
  end

  @doc """
  Increment messages received counter.
  """
  def increment_messages_received do
    safe_increment(@messages_received)
  end

  @doc """
  Increment messages sent counter.
  """
  def increment_messages_sent do
    safe_increment(@messages_sent)
  end

  @doc """
  Increment calls initiated counter.
  """
  def increment_calls_initiated do
    safe_increment(@calls_initiated)
  end

  @doc """
  Increment calls accepted counter.
  """
  def increment_calls_accepted do
    safe_increment(@calls_accepted)
  end

  @doc """
  Increment calls connected counter.
  """
  def increment_calls_connected do
    safe_increment(@calls_connected)
  end

  @doc """
  Increment calls ended counter.
  """
  def increment_calls_ended do
    safe_increment(@calls_ended)
  end

  @doc """
  Increment calls failed counter.
  """
  def increment_calls_failed do
    safe_increment(@calls_failed)
  end

  @doc """
  Increment calls rejected counter.
  """
  def increment_calls_rejected do
    safe_increment(@calls_rejected)
  end

  @doc """
  Increment FCM notifications sent counter.
  """
  def increment_fcm_sent do
    safe_increment(@fcm_sent)
  end

  @doc """
  Increment FCM notifications failed counter.
  """
  def increment_fcm_failed do
    safe_increment(@fcm_failed)
  end

  @doc """
  Get all statistics as a map.
  Returns current counter values.
  """
  def get_all do
    case :persistent_term.get(:stats_counters, :not_found) do
      :not_found ->
        %{
          connections: %{total: 0, active: 0},
          messages: %{received: 0, sent: 0},
          calls: %{
            initiated: 0,
            accepted: 0,
            connected: 0,
            ended: 0,
            failed: 0,
            rejected: 0
          },
          fcm: %{sent: 0, failed: 0},
          devices: %{total: 0}
        }

      ref ->
        %{
          connections: %{
            total: :counters.get(ref, @connections_total + 1),
            active: :counters.get(ref, @connections_active + 1)
          },
          messages: %{
            received: :counters.get(ref, @messages_received + 1),
            sent: :counters.get(ref, @messages_sent + 1)
          },
          calls: %{
            initiated: :counters.get(ref, @calls_initiated + 1),
            accepted: :counters.get(ref, @calls_accepted + 1),
            connected: :counters.get(ref, @calls_connected + 1),
            ended: :counters.get(ref, @calls_ended + 1),
            failed: :counters.get(ref, @calls_failed + 1),
            rejected: :counters.get(ref, @calls_rejected + 1)
          },
          fcm: %{
            sent: :counters.get(ref, @fcm_sent + 1),
            failed: :counters.get(ref, @fcm_failed + 1)
          },
          devices: %{
            total: safe_device_count()
          }
        }
    end
  end

  defp safe_device_count do
    try do
      CallsafeSignaling.DeviceRegistry.count()
    rescue
      _ -> 0
    end
  end

  @doc """
  Reset all counters to zero.
  For testing and administrative purposes.
  """
  def reset_all do
    GenServer.call(__MODULE__, :reset_all)
  end

  # Server callbacks

  @impl true
  def init(_opts) do
    # Create atomics-based counters
    # 12 counters total (0-11 indices)
    ref = :counters.new(12, [:write_concurrency])
    :persistent_term.put(:stats_counters, ref)

    Logger.info("Stats tracking initialized with :counters")
    {:ok, %{}}
  end

  @impl true
  def handle_call(:reset_all, _from, state) do
    # Reset all counters to 0
    for i <- 0..11 do
      :counters.put(:stats_counters, i + 1, 0)
    end

    Logger.info("All stats counters reset")
    {:reply, :ok, state}
  end
end
