# Clean stop: remove the Cowboy listener from Ranch first, then stop the app.
# Without this, Ranch tries to restart the listener after app shutdown, hits
# eaddrinuse, crashes, and leaves ranch_sup dead — breaking subsequent starts.
# Wrapped in catch because Ranch may not be running on a clean startup.
try do
  :cowboy.stop_listener(:http_listener)
catch
  :exit, _ -> :ok
end

Application.stop(:callsafe_signaling)

ExUnit.start()
