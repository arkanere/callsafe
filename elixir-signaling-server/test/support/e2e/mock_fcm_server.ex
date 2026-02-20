defmodule CallsafeSignaling.E2E.MockFCMServer do
  @moduledoc """
  Minimal Cowboy/Plug HTTP server that impersonates the FCM HTTP endpoint.
  Captures incoming push requests so E2E tests can assert on payload contents.

  Usage:
    {:ok, port} = MockFCMServer.start()
    Application.put_env(:callsafe_signaling, :fcm_endpoint, "http://localhost:\#{port}/fcm/send")
    Application.put_env(:callsafe_signaling, :fcm_server_key, "test_key")
    # ... trigger FCM dispatch via call flow ...
    {:ok, req} = MockFCMServer.await_request()
    MockFCMServer.stop()
  """

  @listener_ref :mock_fcm_listener

  @doc "Start the mock server on a free port. Returns {:ok, port}."
  def start do
    {:ok, socket} = :gen_tcp.listen(0, [])
    {:ok, port} = :inet.port(socket)
    :gen_tcp.close(socket)

    {:ok, _} = Agent.start_link(fn -> [] end, name: __MODULE__)

    dispatch =
      :cowboy_router.compile([
        {:_, [{:_, Plug.Cowboy.Handler, {__MODULE__.Handler, []}}]}
      ])

    {:ok, _} =
      :cowboy.start_clear(@listener_ref, [port: port], %{env: %{dispatch: dispatch}})

    {:ok, port}
  end

  @doc "Stop the mock server and clean up the capture agent."
  def stop do
    :cowboy.stop_listener(@listener_ref)
    if pid = Process.whereis(__MODULE__), do: Agent.stop(pid)
    :ok
  end

  @doc "Poll until a request arrives or timeout_ms elapses."
  def await_request(timeout_ms \\ 2_000) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms
    poll(deadline)
  end

  defp poll(deadline) do
    case Agent.get(__MODULE__, & &1) do
      [req | _] ->
        {:ok, req}

      [] ->
        if System.monotonic_time(:millisecond) < deadline do
          Process.sleep(20)
          poll(deadline)
        else
          {:error, :timeout}
        end
    end
  end

  defmodule Handler do
    @moduledoc false
    use Plug.Builder

    plug Plug.Parsers, parsers: [:json], json_decoder: Jason
    plug :capture

    def capture(conn, _opts) do
      Agent.update(CallsafeSignaling.E2E.MockFCMServer, fn reqs ->
        [conn.body_params | reqs]
      end)

      conn
      |> put_resp_content_type("application/json")
      |> send_resp(200, Jason.encode!(%{"success" => 1}))
    end
  end
end
