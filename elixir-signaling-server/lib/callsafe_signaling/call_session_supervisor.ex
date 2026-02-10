defmodule CallsafeSignaling.CallSessionSupervisor do
  @moduledoc """
  DynamicSupervisor for CallSession processes.
  Provides automatic fault isolation and cleanup.
  Each call is a separate supervised process.
  """

  use DynamicSupervisor
  require Logger

  alias CallsafeSignaling.CallSession
  alias CallsafeSignaling.Protocol.Enums

  @type call_id :: String.t()
  @type business_id :: String.t()
  @type device_id :: String.t()

  # Client API

  @doc """
  Start the CallSessionSupervisor.
  """
  def start_link(init_arg) do
    DynamicSupervisor.start_link(__MODULE__, init_arg, name: __MODULE__)
  end

  @doc """
  Start a new call session under supervision.
  Returns {:ok, pid} or {:error, reason}.
  """
  @spec start_call(call_id, business_id, device_id, Enums.call_type(), map()) ::
          {:ok, pid()} | {:error, any()}
  def start_call(call_id, business_id, caller_id, call_type, opts \\ %{}) do
    # Check if call already exists
    case Registry.lookup(CallsafeSignaling.CallRegistry, call_id) do
      [] ->
        child_spec = %{
          id: CallSession,
          start: {CallSession, :start_link, [call_id, business_id, caller_id, call_type, opts]},
          restart: :temporary
        }

        case DynamicSupervisor.start_child(__MODULE__, child_spec) do
          {:ok, pid} ->
            Logger.info("Call session supervised: #{call_id}")
            {:ok, pid}

          {:error, {:already_started, pid}} ->
            Logger.warning("Call session already exists: #{call_id}")
            {:ok, pid}

          {:error, reason} ->
            Logger.error("Failed to start call session #{call_id}: #{inspect(reason)}")
            {:error, reason}
        end

      [{pid, _}] ->
        Logger.warning("Call session already exists: #{call_id}")
        {:ok, pid}
    end
  end

  @doc """
  Terminate a call session.
  Returns :ok.
  """
  @spec terminate_call(call_id) :: :ok
  def terminate_call(call_id) do
    case Registry.lookup(CallsafeSignaling.CallRegistry, call_id) do
      [{pid, _}] ->
        DynamicSupervisor.terminate_child(__MODULE__, pid)
        Logger.info("Call session terminated: #{call_id}")
        :ok

      [] ->
        Logger.debug("Call session not found for termination: #{call_id}")
        :ok
    end
  end

  @doc """
  Get count of active call sessions.
  """
  @spec count_calls() :: non_neg_integer()
  def count_calls do
    DynamicSupervisor.count_children(__MODULE__).active
  end

  @doc """
  List all active call IDs.
  """
  @spec list_calls() :: [call_id]
  def list_calls do
    Registry.select(CallsafeSignaling.CallRegistry, [{{:"$1", :_, :_}, [], [:"$1"]}])
  end

  # Server callbacks

  @impl true
  def init(_init_arg) do
    Logger.info("CallSessionSupervisor started")
    DynamicSupervisor.init(strategy: :one_for_one, max_restarts: 3, max_seconds: 5)
  end
end
