defmodule CallsafeSignaling.Auth.RateLimiter do
  @moduledoc """
  Rate limiting using ETS counters as pure data transformations.
  Tracks requests per device_id and per IP address.
  No mutation - rate limit state as transformations.
  """

  use GenServer
  require Logger

  alias CallsafeSignaling.Config

  @type device_id :: String.t()
  @type ip_address :: String.t()
  @type rate_limit_result :: :ok | {:error, :rate_limit_exceeded}

  # Client API

  @doc """
  Start the RateLimiter GenServer.
  """
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Check rate limit for a device_id.
  Returns :ok or {:error, :rate_limit_exceeded}.
  Pure function from caller perspective - returns result as data.
  """
  @spec check_device(device_id) :: rate_limit_result
  def check_device(device_id) when is_binary(device_id) do
    config = Config.rate_limits()
    key = {:device, device_id}
    check_limit(key, config.max_requests_per_device, config.window_seconds)
  end

  def check_device(_), do: {:error, :rate_limit_exceeded}

  @doc """
  Check rate limit for an IP address.
  Returns :ok or {:error, :rate_limit_exceeded}.
  Pure function from caller perspective - returns result as data.
  """
  @spec check_ip(ip_address) :: rate_limit_result
  def check_ip(ip_address) when is_binary(ip_address) do
    config = Config.rate_limits()
    key = {:ip, ip_address}
    check_limit(key, config.max_requests_per_ip, config.window_seconds)
  end

  def check_ip(_), do: {:error, :rate_limit_exceeded}

  @doc """
  Check rate limit for both device_id and IP address.
  Returns :ok only if both pass.
  Composition of device and IP checks.
  """
  @spec check(device_id, ip_address) :: rate_limit_result
  def check(device_id, ip_address) do
    with :ok <- check_device(device_id),
         :ok <- check_ip(ip_address) do
      :ok
    end
  end

  @doc """
  Reset rate limit counters for a device_id.
  For testing and administrative purposes.
  """
  @spec reset_device(device_id) :: :ok
  def reset_device(device_id) do
    :ets.delete(:rate_limiter, {:device, device_id})
    :ok
  end

  @doc """
  Reset rate limit counters for an IP address.
  For testing and administrative purposes.
  """
  @spec reset_ip(ip_address) :: :ok
  def reset_ip(ip_address) do
    :ets.delete(:rate_limiter, {:ip, ip_address})
    :ok
  end

  @doc """
  Get current count for a device_id.
  Returns count or 0 if not found.
  """
  @spec get_device_count(device_id) :: non_neg_integer()
  def get_device_count(device_id) do
    case :ets.lookup(:rate_limiter, {:device, device_id}) do
      [{_key, count, _timestamp}] -> count
      [] -> 0
    end
  end

  @doc """
  Get current count for an IP address.
  Returns count or 0 if not found.
  """
  @spec get_ip_count(ip_address) :: non_neg_integer()
  def get_ip_count(ip_address) do
    case :ets.lookup(:rate_limiter, {:ip, ip_address}) do
      [{_key, count, _timestamp}] -> count
      [] -> 0
    end
  end

  # Private helpers

  defp check_limit(key, max_requests, window_seconds) do
    now = System.system_time(:second)
    window_start = now - window_seconds

    case :ets.lookup(:rate_limiter, key) do
      [] ->
        # First request in window - insert and allow
        :ets.insert(:rate_limiter, {key, 1, now})
        :ok

      [{^key, _count, timestamp}] when timestamp < window_start ->
        # Old window expired - reset counter and allow
        :ets.insert(:rate_limiter, {key, 1, now})
        :ok

      [{^key, count, _timestamp}] when count < max_requests ->
        # Within limit - increment and allow
        :ets.update_counter(:rate_limiter, key, {2, 1})
        :ok

      [{^key, _count, _timestamp}] ->
        # Rate limit exceeded
        {:error, :rate_limit_exceeded}
    end
  end

  # Server callbacks

  @impl true
  def init(_opts) do
    # Create ETS table for rate limit counters
    # Structure: {key, count, timestamp}
    # key: {:device, device_id} or {:ip, ip_address}
    # count: number of requests in current window
    # timestamp: start of current window
    :ets.new(:rate_limiter, [
      :named_table,
      :set,
      :public,
      read_concurrency: true,
      write_concurrency: true
    ])

    # Schedule periodic cleanup of expired entries
    schedule_cleanup()

    Logger.info("RateLimiter started")
    {:ok, %{}}
  end

  @impl true
  def handle_info(:cleanup, state) do
    cleanup_expired_entries()
    schedule_cleanup()
    {:noreply, state}
  end

  defp schedule_cleanup do
    # Run cleanup every 5 minutes
    Process.send_after(self(), :cleanup, 5 * 60 * 1000)
  end

  defp cleanup_expired_entries do
    config = Config.rate_limits()
    now = System.system_time(:second)
    cutoff = now - config.window_seconds * 2

    # Delete entries older than 2x window to be safe
    :ets.select_delete(:rate_limiter, [
      {{:_, :_, :"$1"}, [{:<, :"$1", cutoff}], [true]}
    ])
  end
end
