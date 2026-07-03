defmodule CallsafeSignaling.Auth.JWT do
  @moduledoc """
  JWT authentication as pure data transformations.
  No mutation - validates tokens and returns results as data.
  """

  import Bitwise
  alias CallsafeSignaling.Config

  @type token :: String.t()
  @type claims :: %{
          device_id: String.t(),
          business_id: String.t(),
          role: String.t(),
          exp: integer(),
          iat: integer()
        }
  @type auth_result :: {:ok, claims} | {:error, :invalid_token | :expired | :missing_secret}

  @doc """
  Validate JWT token and extract claims.
  Returns {:ok, claims} or {:error, reason}.
  Pure function - no side effects.
  """
  @spec verify(token) :: auth_result
  def verify(token) when is_binary(token) do
    case Config.jwt_secret() do
      nil ->
        {:error, :missing_secret}

      secret ->
        token
        |> decode(secret)
        |> validate_claims()
    end
  end

  def verify(_), do: {:error, :invalid_token}

  @doc """
  Decode JWT token using HS256 algorithm.
  Returns {:ok, claims} or {:error, reason}.
  """
  @spec decode(token, String.t()) :: {:ok, map()} | {:error, atom()}
  def decode(token, secret) do
    case String.split(token, ".") do
      [header_b64, payload_b64, signature_b64] ->
        with {:ok, _header} <- decode_base64_json(header_b64),
             {:ok, payload} <- decode_base64_json(payload_b64),
             true <- verify_signature(header_b64, payload_b64, signature_b64, secret) do
          {:ok, payload}
        else
          {:error, reason} -> {:error, reason}
          false -> {:error, :invalid_signature}
        end

      _ ->
        {:error, :invalid_token}
    end
  end

  @doc """
  Validate claims structure and expiration.
  Returns {:ok, claims} or {:error, reason}.
  """
  @spec validate_claims({:ok, map()} | {:error, atom()}) :: auth_result
  def validate_claims({:error, reason}), do: {:error, reason}

  def validate_claims({:ok, claims}) do
    with {:ok, device_id} <- extract_string(claims, "device_id"),
         {:ok, business_id} <- extract_string(claims, "business_id"),
         {:ok, role} <- extract_role(claims),
         {:ok, exp} <- extract_integer(claims, "exp"),
         {:ok, iat} <- extract_integer(claims, "iat"),
         :ok <- check_expiration(exp) do
      {:ok,
       %{
         device_id: device_id,
         business_id: business_id,
         role: role,
         exp: exp,
         iat: iat
       }}
    else
      {:error, reason} -> {:error, reason}
    end
  end

  @doc """
  Generate a JWT token with the v2 claim set (device_id, business_id, role,
  iat, exp). Used by the guest-token endpoint and tests.

  Options: `:ttl` — validity in seconds (default 3600).
  """
  @spec generate(String.t(), String.t(), String.t(), String.t(), keyword()) :: token
  def generate(device_id, business_id, role, secret, opts \\ []) do
    now = System.system_time(:second)
    exp = now + Keyword.get(opts, :ttl, 3600)

    header = %{"alg" => "HS256", "typ" => "JWT"}

    payload = %{
      "device_id" => device_id,
      "business_id" => business_id,
      "role" => role,
      "iat" => now,
      "exp" => exp
    }

    header_b64 = encode_base64_json(header)
    payload_b64 = encode_base64_json(payload)
    signature = generate_signature(header_b64, payload_b64, secret)

    "#{header_b64}.#{payload_b64}.#{signature}"
  end

  # Private helpers

  defp decode_base64_json(b64) do
    with {:ok, json} <- Base.url_decode64(b64, padding: false),
         {:ok, data} <- Jason.decode(json) do
      {:ok, data}
    else
      _ -> {:error, :invalid_token}
    end
  end

  defp encode_base64_json(data) do
    data
    |> Jason.encode!()
    |> Base.url_encode64(padding: false)
  end

  defp verify_signature(header_b64, payload_b64, signature_b64, secret) do
    expected = generate_signature(header_b64, payload_b64, secret)
    secure_compare(signature_b64, expected)
  end

  defp generate_signature(header_b64, payload_b64, secret) do
    message = "#{header_b64}.#{payload_b64}"

    :crypto.mac(:hmac, :sha256, secret, message)
    |> Base.url_encode64(padding: false)
  end

  defp secure_compare(a, b) when byte_size(a) != byte_size(b), do: false

  defp secure_compare(a, b) do
    # Constant-time comparison to prevent timing attacks
    a_bytes = :binary.bin_to_list(a)
    b_bytes = :binary.bin_to_list(b)

    Enum.zip(a_bytes, b_bytes)
    |> Enum.reduce(0, fn {x, y}, acc -> acc ||| Bitwise.bxor(x, y) end)
    |> Kernel.==(0)
  end

  defp extract_string(claims, key) do
    case Map.get(claims, key) do
      value when is_binary(value) -> {:ok, value}
      _ -> {:error, :invalid_token}
    end
  end

  defp extract_role(claims) do
    case Map.get(claims, "role") do
      role when role in ["customer", "business"] -> {:ok, role}
      _ -> {:error, :invalid_token}
    end
  end

  defp extract_integer(claims, key) do
    case Map.get(claims, key) do
      value when is_integer(value) -> {:ok, value}
      _ -> {:error, :invalid_token}
    end
  end

  defp check_expiration(exp) do
    now = System.system_time(:second)

    if exp > now do
      :ok
    else
      {:error, :expired}
    end
  end
end
