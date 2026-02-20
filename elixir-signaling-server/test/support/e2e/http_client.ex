defmodule CallsafeSignaling.E2E.HttpClient do
  @moduledoc """
  Req-based HTTP test helper for E2E REST API tests.

  Issues requests against the running E2E server on port 4001.
  Supports optional JWT bearer token injection for authenticated endpoints.

  Returns {status_code, decoded_body} tuples. Body is decoded JSON (map) when
  the server responds with application/json, raw binary otherwise.

  Usage:
    {200, body} = HttpClient.get("/health")
    {200, body} = HttpClient.post("/api/v1/fcm/register", %{push_token: "t"}, token: jwt)
  """

  @base_url "http://localhost:4001"

  def get(path, opts \\ []) do
    do_request(:get, path, nil, opts)
  end

  def post(path, body, opts \\ []) do
    do_request(:post, path, body, opts)
  end

  # ---------------------------------------------------------------------------
  # Private
  # ---------------------------------------------------------------------------

  defp do_request(method, path, body, opts) do
    token = Keyword.get(opts, :token)
    headers = if token, do: %{"authorization" => "Bearer #{token}"}, else: %{}

    req_opts =
      [
        method: method,
        url: @base_url <> path,
        headers: headers
      ]
      |> maybe_put_body(body)

    case Req.request(req_opts) do
      {:ok, response} -> {response.status, decode_body(response.body)}
      {:error, reason} -> raise "HTTP request failed: #{inspect(reason)}"
    end
  end

  defp maybe_put_body(opts, nil), do: opts
  defp maybe_put_body(opts, body), do: Keyword.put(opts, :json, body)

  # The router uses send_resp/3 without an explicit Content-Type, so Req does
  # not auto-decode. Decode manually: return map on valid JSON, raw binary otherwise.
  defp decode_body(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} -> decoded
      _ -> body
    end
  end

  defp decode_body(body), do: body
end
