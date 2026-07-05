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
  Returns a credentials map ready to JSON-encode.

  Precedence: static provider credentials (Metered-style long-lived
  username/credential) → coturn HMAC shared-secret → empty (STUN fallback).
  """
  def generate do
    urls = Config.turn_servers() |> Enum.flat_map(&Map.get(&1, :urls, []))
    static_username = Config.turn_static_username()
    static_credential = Config.turn_static_credential()
    secret = Config.turn_secret()

    cond do
      urls == [] ->
        empty()

      is_binary(static_username) and is_binary(static_credential) ->
        %{ttl: @ttl_seconds, urls: urls, username: static_username, credential: static_credential}

      is_binary(secret) ->
        username = generate_username()
        %{ttl: @ttl_seconds, urls: urls, username: username, credential: generate_credential(username, secret)}

      true ->
        empty()
    end
  end

  defp empty, do: %{ttl: @ttl_seconds, urls: [], username: nil, credential: nil}

  defp generate_username do
    expiry = System.system_time(:second) + @ttl_seconds
    "#{expiry}:#{Config.turn_username()}"
  end

  defp generate_credential(username, secret) do
    :crypto.mac(:hmac, :sha256, secret, username)
    |> Base.encode64()
  end
end
