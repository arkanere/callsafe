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
  @calls_connected 5
  @calls_ended 6
  @calls_failed 7
  @fcm_sent 8
  @fcm_failed 9

  # Client API

  @doc """
  Start the Stats GenServer.
  """
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Increment connection total counter.
  """
  def increment_connections_total do
    :counters.add(:stats_counters, @connections_total + 1, 1)
  end

  @doc """
  Increment active connections counter.
  """
  def increment_connections_active do
    :counters.add(:stats_counters, @connections_active + 1, 1)
  end

  @doc """
  Decrement active connections counter.
  """
  def decrement_connections_active do
    :counters.sub(:stats_counters, @connections_active + 1, 1)
  end

  @doc """
  Increment messages received counter.
  """
  def increment_messages_received do
    :counters.add(:stats_counters, @messages_received + 1, 1)
  end

  @doc """
  Increment messages sent counter.
  """
  def increment_messages_sent do
    :counters.add(:stats_counters, @messages_sent + 1, 1)
  end

  @doc """
  Increment calls initiated counter.
  """
  def increment_calls_initiated do
    :counters.add(:stats_counters, @calls_initiated + 1, 1)
  end

  @doc """
  Increment calls connected counter.
  """
  def increment_calls_connected do
    :counters.add(:stats_counters, @calls_connected + 1, 1)
  end

  @doc """
  Increment calls ended counter.
  """
  def increment_calls_ended do
    :counters.add(:stats_counters, @calls_ended + 1, 1)
  end

  @doc """
  Increment calls failed counter.
  """
  def increment_calls_failed do
    :counters.add(:stats_counters, @calls_failed + 1, 1)
  end

  @doc """
  Increment FCM notifications sent counter.
  """
  def increment_fcm_sent do
    :counters.add(:stats_counters, @fcm_sent + 1, 1)
  end

  @doc """
  Increment FCM notifications failed counter.
  """
  def increment_fcm_failed do
    :counters.add(:stats_counters, @fcm_failed + 1, 1)
  end

  @doc """
  Get all statistics as a map.
  Returns current counter values.
  """
  def get_all do
    %{
      connections: %{
        total: :counters.get(:stats_counters, @connections_total + 1),
        active: :counters.get(:stats_counters, @connections_active + 1)
      },
      messages: %{
        received: :counters.get(:stats_counters, @messages_received + 1),
        sent: :counters.get(:stats_counters, @messages_sent + 1)
      },
      calls: %{
        initiated: :counters.get(:stats_counters, @calls_initiated + 1),
        connected: :counters.get(:stats_counters, @calls_connected + 1),
        ended: :counters.get(:stats_counters, @calls_ended + 1),
        failed: :counters.get(:stats_counters, @calls_failed + 1)
      },
      fcm: %{
        sent: :counters.get(:stats_counters, @fcm_sent + 1),
        failed: :counters.get(:stats_counters, @fcm_failed + 1)
      },
      devices: %{
        total: CallsafeSignaling.DeviceRegistry.count()
      }
    }
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
    # 10 counters total (0-9 indices)
    ref = :counters.new(10, [:write_concurrency])
    :persistent_term.put(:stats_counters, ref)

    Logger.info("Stats tracking initialized with :counters")
    {:ok, %{}}
  end

  @impl true
  def handle_call(:reset_all, _from, state) do
    # Reset all counters to 0
    for i <- 0..9 do
      :counters.put(:stats_counters, i + 1, 0)
    end

    Logger.info("All stats counters reset")
    {:reply, :ok, state}
  end
end
