defmodule CallsafeSignaling.Notifier do
  @moduledoc """
  Behaviour for delivering messages to WebSocket connection processes.
  Decouples "when to notify" (CallSession) from "how to notify."

  Configure via:
    config :callsafe_signaling, :notifier, MyCustomNotifier

  Defaults to CallsafeSignaling.Notifier.Default (bare send/2).
  """

  @callback notify(pid(), String.t(), map()) :: :ok

  defmodule Default do
    @moduledoc "Production notifier: delivers messages via bare send/2."

    @behaviour CallsafeSignaling.Notifier

    @impl true
    def notify(pid, message_type, payload) do
      send(pid, {:send_message, message_type, payload})
      :ok
    end
  end
end
