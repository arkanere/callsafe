defmodule CallsafeSignaling.DeviceRegistry do
  @moduledoc """
  ETS-based device connection registry.
  Provides O(1) lookups by device_id and business_id.
  Implemented as a GenServer managing an ETS table.
  """

  use GenServer
  require Logger

  alias CallsafeSignaling.Protocol.Enums

  @type device_id :: String.t()
  @type business_id :: String.t()
  @type connection_pid :: pid()
  @type device_type :: Enums.device_type()
  @type device_status :: Enums.device_status()

  @type device_entry :: %{
          device_id: device_id,
          business_id: business_id,
          connection_pid: connection_pid | nil,
          device_type: device_type,
          status: device_status,
          connected_at: integer(),
          push_token: String.t() | nil
        }

  # Client API

  @doc """
  Start the DeviceRegistry GenServer.
  """
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Register a device connection.
  Returns {:ok, device_entry} or {:error, :already_registered}.
  """
  @spec register(
          device_id,
          business_id,
          connection_pid | nil,
          device_type,
          device_status,
          String.t() | nil
        ) ::
          {:ok, device_entry} | {:error, :already_registered}
  def register(
        device_id,
        business_id,
        connection_pid,
        device_type,
        status \\ :available,
        push_token \\ nil
      ) do
    GenServer.call(
      __MODULE__,
      {:register, device_id, business_id, connection_pid, device_type, status, push_token}
    )
  end

  @doc """
  Unregister a device by device_id.
  Returns :ok.
  """
  @spec unregister(device_id) :: :ok
  def unregister(device_id) do
    GenServer.call(__MODULE__, {:unregister, device_id})
  end

  @doc """
  Lookup device by device_id.
  Returns {:ok, device_entry} or {:error, :not_found}.
  """
  @spec lookup_by_device(device_id) :: {:ok, device_entry} | {:error, :not_found}
  def lookup_by_device(device_id) do
    case :ets.lookup(:device_registry, {:device, device_id}) do
      [{_key, entry}] -> {:ok, entry}
      [] -> {:error, :not_found}
    end
  end

  @doc """
  List all devices for a business_id.
  Returns list of device_entry.
  """
  @spec list_by_business(business_id) :: [device_entry]
  def list_by_business(business_id) do
    :ets.match_object(:device_registry, {{:business, business_id, :_}, :_})
    |> Enum.map(fn {_key, entry} -> entry end)
  end

  @doc """
  Update device status.
  Returns {:ok, device_entry} or {:error, :not_found}.
  """
  @spec update_status(device_id, device_status) :: {:ok, device_entry} | {:error, :not_found}
  def update_status(device_id, status) do
    GenServer.call(__MODULE__, {:update_status, device_id, status})
  end

  @doc """
  Get count of connected devices.
  """
  @spec count() :: non_neg_integer()
  def count do
    # Match on device entries only (not business index entries)
    match_spec = [{{{:device, :_}, :_}, [], [true]}]
    :ets.select_count(:device_registry, match_spec)
  end

  @doc """
  Get count of connected devices for a business.
  """
  @spec count_by_business(business_id) :: non_neg_integer()
  def count_by_business(business_id) do
    length(list_by_business(business_id))
  end

  @doc """
  Update device push token.
  Returns {:ok, device_entry} or {:error, :not_found}.
  """
  @spec update_push_token(device_id, String.t() | nil) ::
          {:ok, device_entry} | {:error, :not_found}
  def update_push_token(device_id, push_token) do
    GenServer.call(__MODULE__, {:update_push_token, device_id, push_token})
  end

  @doc """
  Update device connection PID (for reconnections).
  Returns {:ok, device_entry} or {:error, :not_found}.
  """
  @spec update_connection_pid(device_id, connection_pid | nil) ::
          {:ok, device_entry} | {:error, :not_found}
  def update_connection_pid(device_id, connection_pid) do
    GenServer.call(__MODULE__, {:update_connection_pid, device_id, connection_pid})
  end

  # Server callbacks

  @impl true
  def init(_opts) do
    # Create ETS table with duplicate_bag to allow multiple entries per business_id
    # Use public read access for performance, writes go through GenServer
    :ets.new(:device_registry, [
      :named_table,
      :set,
      :public,
      read_concurrency: true,
      write_concurrency: false
    ])

    Logger.info("DeviceRegistry started")
    # monitors: %{reference() => device_id} — used to identify which device a :DOWN belongs to.
    # Keying on the monitor ref (not the PID) avoids false matches when PIDs are reused by
    # the BEAM after short-lived test connections exhaust the 15-bit PID counter range.
    {:ok, %{monitors: %{}}}
  end

  @impl true
  def handle_call(
        {:register, device_id, business_id, connection_pid, device_type, status, push_token},
        _from,
        state
      ) do
    # Check if device already registered
    case :ets.lookup(:device_registry, {:device, device_id}) do
      [] ->
        entry = %{
          device_id: device_id,
          business_id: business_id,
          connection_pid: connection_pid,
          device_type: device_type,
          status: status,
          connected_at: System.system_time(:millisecond),
          push_token: push_token
        }

        # Insert both device and business index entries
        :ets.insert(:device_registry, {{:device, device_id}, entry})
        :ets.insert(:device_registry, {{:business, business_id, device_id}, entry})

        # Monitor the connection process and remember the ref so the :DOWN handler
        # can identify the device without a PID scan.
        new_monitors =
          if connection_pid != nil do
            ref = Process.monitor(connection_pid)
            Map.put(state.monitors, ref, device_id)
          else
            state.monitors
          end

        Logger.debug("Device registered: #{device_id} for business: #{business_id}")
        {:reply, {:ok, entry}, %{state | monitors: new_monitors}}

      [{_key, _existing_entry}] ->
        {:reply, {:error, :already_registered}, state}
    end
  end

  @impl true
  def handle_call({:unregister, device_id}, _from, state) do
    case :ets.lookup(:device_registry, {:device, device_id}) do
      [{_key, entry}] ->
        business_id = entry.business_id
        :ets.delete(:device_registry, {:device, device_id})
        :ets.delete(:device_registry, {:business, business_id, device_id})

        # Cancel outstanding monitor so no stale :DOWN arrives later.
        new_monitors = cancel_monitor_for_device(device_id, state.monitors)

        Logger.debug("Device unregistered: #{device_id}")
        {:reply, :ok, %{state | monitors: new_monitors}}

      [] ->
        {:reply, :ok, state}
    end
  end

  @impl true
  def handle_call({:update_status, device_id, status}, _from, state) do
    case :ets.lookup(:device_registry, {:device, device_id}) do
      [{_key, entry}] ->
        updated_entry = %{entry | status: status}
        business_id = entry.business_id

        :ets.insert(:device_registry, {{:device, device_id}, updated_entry})
        :ets.insert(:device_registry, {{:business, business_id, device_id}, updated_entry})

        Logger.debug("Device status updated: #{device_id} -> #{status}")
        {:reply, {:ok, updated_entry}, state}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:update_push_token, device_id, push_token}, _from, state) do
    case :ets.lookup(:device_registry, {:device, device_id}) do
      [{_key, entry}] ->
        updated_entry = %{entry | push_token: push_token}
        business_id = entry.business_id

        :ets.insert(:device_registry, {{:device, device_id}, updated_entry})
        :ets.insert(:device_registry, {{:business, business_id, device_id}, updated_entry})

        Logger.debug("Device push_token updated: #{device_id}")
        {:reply, {:ok, updated_entry}, state}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:update_connection_pid, device_id, connection_pid}, _from, state) do
    case :ets.lookup(:device_registry, {:device, device_id}) do
      [{_key, entry}] ->
        updated_entry = %{entry | connection_pid: connection_pid}
        business_id = entry.business_id

        :ets.insert(:device_registry, {{:device, device_id}, updated_entry})
        :ets.insert(:device_registry, {{:business, business_id, device_id}, updated_entry})

        # Cancel old monitor, set up new one.
        monitors = cancel_monitor_for_device(device_id, state.monitors)

        new_monitors =
          if connection_pid != nil do
            ref = Process.monitor(connection_pid)
            Map.put(monitors, ref, device_id)
          else
            monitors
          end

        Logger.debug("Device connection_pid updated: #{device_id}")
        {:reply, {:ok, updated_entry}, %{state | monitors: new_monitors}}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_info({:DOWN, ref, :process, _pid, _reason}, state) do
    # Use the monitor ref (not the PID) to identify the device.  Keying on the
    # ref prevents false matches when the BEAM reuses a PID for a new connection
    # before the stale :DOWN message is processed.
    case Map.pop(state.monitors, ref) do
      {nil, _monitors} ->
        # Unknown monitor — already cancelled or from a reconnect race; ignore.
        {:noreply, state}

      {device_id, new_monitors} ->
        case :ets.lookup(:device_registry, {:device, device_id}) do
          [{_key, entry}] ->
            business_id = entry.business_id

            case entry.device_type do
              :mobile ->
                # Mobile devices persist — just clear connection_pid.
                updated_entry = %{entry | connection_pid: nil}
                :ets.insert(:device_registry, {{:device, device_id}, updated_entry})
                :ets.insert(:device_registry, {{:business, business_id, device_id}, updated_entry})
                Logger.debug("Mobile device connection DOWN, persisting device: #{device_id}")

              :web ->
                # Web devices are removed completely.
                :ets.delete(:device_registry, {:device, device_id})
                :ets.delete(:device_registry, {:business, business_id, device_id})
                Logger.debug("Web device connection DOWN, auto-unregistered: #{device_id}")
            end

          [] ->
            :ok
        end

        {:noreply, %{state | monitors: new_monitors}}
    end
  end

  # Cancel the monitor associated with device_id (if any) and return the updated map.
  defp cancel_monitor_for_device(device_id, monitors) do
    case Enum.find(monitors, fn {_ref, id} -> id == device_id end) do
      {ref, _id} ->
        Process.demonitor(ref, [:flush])
        Map.delete(monitors, ref)

      nil ->
        monitors
    end
  end
end
