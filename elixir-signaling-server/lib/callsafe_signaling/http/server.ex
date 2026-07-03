defmodule CallsafeSignaling.HTTP.Server do
  @moduledoc """
  Cowboy HTTP server with split routing:
  - /ws -> WebSocket handler
  - everything else -> Plug router
  """

  require Logger

  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]},
      type: :worker,
      restart: :permanent
    }
  end

  def start_link(opts \\ []) do
    port = Keyword.get(opts, :port, 4000)

    dispatch = build_dispatch()

    cowboy_opts = [port: port, reuseaddr: true]

    Logger.info("Starting HTTP server on port #{port}")

    case :cowboy.start_clear(:http_listener, cowboy_opts, %{
           env: %{dispatch: dispatch}
         }) do
      {:ok, pid} ->
        Logger.info("HTTP server started successfully on port #{port}")
        {:ok, pid}

      {:error, reason} ->
        Logger.error("Failed to start HTTP server: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp build_dispatch do
    :cowboy_router.compile([
      {:_,
       [
         # WebSocket route for normal clients
         {"/ws", CallsafeSignaling.WebSocket.Handler, []},
         # All other routes go to Plug router
         {:_, Plug.Cowboy.Handler, {CallsafeSignaling.HTTP.Router, []}}
       ]}
    ])
  end
end
