defmodule CallsafeSignaling.E2E.AppLifecycle do
  @moduledoc false

  @max_retries 10
  @retry_delay_ms 200

  @doc """
  Start the application, retrying if port is still bound from a previous module's teardown.
  """
  def start(retries \\ @max_retries) do
    case Application.ensure_all_started(:callsafe_signaling) do
      {:ok, _apps} ->
        Process.sleep(50)
        # Unit tests (rate_limiter_test, pipeline_test) call Application.put_env
        # with low limits (10/5) without on_exit cleanup.  Override to E2E-safe
        # values and clear accumulated ETS counts so module ordering doesn't cause
        # rate_limit_exceeded failures.
        Application.put_env(:callsafe_signaling, :max_requests_per_ip, 10_000)
        Application.put_env(:callsafe_signaling, :max_requests_per_device, 10_000)
        :ets.delete_all_objects(:rate_limiter)
        :ok

      {:error, {:callsafe_signaling, {{:shutdown, {:failed_to_start_child, _, :eaddrinuse}}, _}}}
      when retries > 0 ->
        Process.sleep(@retry_delay_ms)
        start(retries - 1)

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Clean stop: remove the Cowboy listener from Ranch before stopping the OTP app.
  Without this, Ranch tries to restart the listener after app shutdown.
  """
  def stop do
    try do
      :cowboy.stop_listener(:http_listener)
    catch
      :exit, _ -> :ok
    end

    Application.stop(:callsafe_signaling)
  end
end
