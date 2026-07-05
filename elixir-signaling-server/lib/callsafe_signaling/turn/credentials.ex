defmodule CallsafeSignaling.Turn.Credentials do
  @moduledoc """
  Generates ephemeral, time-limited TURN credentials (coturn REST / RFC 8656).

  The shared TURN secret never leaves the server; clients receive only the
  derived HMAC credential and a matching, expiring username. Shared by the
  public embed endpoint (GET /api/turn-credentials) and the authenticated
  app/mobile endpoint (POST /api/v1/turn/credentials).
  """

  alias CallsafeSignaling.Config

  @ttl_seconds 86_400

  @doc """
  Returns a credentials map ready to JSON-encode. When TURN is not configured
  (no servers or secret), returns empty urls so callers fall back to STUN.
  """
  def generate do
    turn_servers = Config.turn_servers()
    turn_secret = Config.turn_secret()

    if turn_servers == [] or is_nil(turn_secret) do
      %{ttl: @ttl_seconds, urls: [], username: nil, credential: nil}
    else
      username = generate_username()

      %{
        ttl: @ttl_seconds,
        urls: Enum.flat_map(turn_servers, &Map.get(&1, :urls, [])),
        username: username,
        credential: generate_credential(username, turn_secret)
      }
    end
  end

  defp generate_username do
    expiry = System.system_time(:second) + @ttl_seconds
    "#{expiry}:#{Config.turn_username()}"
  end

  defp generate_credential(username, secret) do
    :crypto.mac(:hmac, :sha256, secret, username)
    |> Base.encode64()
  end
end
