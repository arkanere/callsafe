defmodule CallsafeSignaling.Auth.JWTTest do
  use ExUnit.Case, async: true

  alias CallsafeSignaling.Auth.JWT

  @secret "test_secret_key_for_jwt"
  @device_id "device_123"
  @business_id "business_456"

  describe "generate/3" do
    test "generates valid JWT token" do
      token = JWT.generate(@device_id, @business_id, @secret)

      assert is_binary(token)
      assert String.contains?(token, ".")
      assert length(String.split(token, ".")) == 3
    end
  end

  describe "verify/1" do
    test "verifies valid token successfully" do
      token = JWT.generate(@device_id, @business_id, @secret)

      # Mock Config to return test secret
      with_config(@secret, fn ->
        assert {:ok, claims} = JWT.verify(token)
        assert claims.device_id == @device_id
        assert claims.business_id == @business_id
        assert is_integer(claims.exp)
        assert is_integer(claims.iat)
      end)
    end

    test "rejects token with invalid signature" do
      token = JWT.generate(@device_id, @business_id, @secret)
      tampered_token = token <> "tampered"

      with_config(@secret, fn ->
        assert {:error, :invalid_signature} = JWT.verify(tampered_token)
      end)
    end

    test "rejects expired token" do
      # Create token that expires immediately
      now = System.system_time(:second)
      header = %{"alg" => "HS256", "typ" => "JWT"}

      payload = %{
        "device_id" => @device_id,
        "business_id" => @business_id,
        "iat" => now - 7200,
        "exp" => now - 3600
      }

      header_b64 = encode_json(header)
      payload_b64 = encode_json(payload)
      signature = sign(header_b64, payload_b64, @secret)
      token = "#{header_b64}.#{payload_b64}.#{signature}"

      with_config(@secret, fn ->
        assert {:error, :expired} = JWT.verify(token)
      end)
    end

    test "rejects token with missing device_id" do
      now = System.system_time(:second)
      header = %{"alg" => "HS256", "typ" => "JWT"}
      payload = %{"business_id" => @business_id, "iat" => now, "exp" => now + 3600}

      header_b64 = encode_json(header)
      payload_b64 = encode_json(payload)
      signature = sign(header_b64, payload_b64, @secret)
      token = "#{header_b64}.#{payload_b64}.#{signature}"

      with_config(@secret, fn ->
        assert {:error, :invalid_token} = JWT.verify(token)
      end)
    end

    test "rejects token with missing business_id" do
      now = System.system_time(:second)
      header = %{"alg" => "HS256", "typ" => "JWT"}
      payload = %{"device_id" => @device_id, "iat" => now, "exp" => now + 3600}

      header_b64 = encode_json(header)
      payload_b64 = encode_json(payload)
      signature = sign(header_b64, payload_b64, @secret)
      token = "#{header_b64}.#{payload_b64}.#{signature}"

      with_config(@secret, fn ->
        assert {:error, :invalid_token} = JWT.verify(token)
      end)
    end

    test "rejects malformed token" do
      with_config(@secret, fn ->
        assert {:error, :invalid_token} = JWT.verify("invalid.token")
        assert {:error, :invalid_token} = JWT.verify("not a token")
        assert {:error, :invalid_token} = JWT.verify("")
      end)
    end

    test "rejects non-string input" do
      with_config(@secret, fn ->
        assert {:error, :invalid_token} = JWT.verify(123)
        assert {:error, :invalid_token} = JWT.verify(nil)
      end)
    end

    test "returns error when secret is missing" do
      with_config(nil, fn ->
        token = JWT.generate(@device_id, @business_id, @secret)
        assert {:error, :missing_secret} = JWT.verify(token)
      end)
    end
  end

  describe "decode/2" do
    test "decodes valid token" do
      token = JWT.generate(@device_id, @business_id, @secret)
      assert {:ok, payload} = JWT.decode(token, @secret)
      assert payload["device_id"] == @device_id
      assert payload["business_id"] == @business_id
    end

    test "rejects token with invalid signature" do
      token = JWT.generate(@device_id, @business_id, @secret)
      [header, payload, _sig] = String.split(token, ".")
      bad_token = "#{header}.#{payload}.invalidsignature"

      assert {:error, :invalid_signature} = JWT.decode(bad_token, @secret)
    end

    test "rejects token with wrong secret" do
      token = JWT.generate(@device_id, @business_id, @secret)
      assert {:error, :invalid_signature} = JWT.decode(token, "wrong_secret")
    end
  end

  # Helpers

  defp with_config(secret, fun) do
    # Save original config
    original = Application.get_env(:callsafe_signaling, :jwt_secret)

    try do
      Application.put_env(:callsafe_signaling, :jwt_secret, secret)
      fun.()
    after
      # Restore original config
      if original do
        Application.put_env(:callsafe_signaling, :jwt_secret, original)
      else
        Application.delete_env(:callsafe_signaling, :jwt_secret)
      end
    end
  end

  defp encode_json(data) do
    data
    |> Jason.encode!()
    |> Base.url_encode64(padding: false)
  end

  defp sign(header_b64, payload_b64, secret) do
    message = "#{header_b64}.#{payload_b64}"

    :crypto.mac(:hmac, :sha256, secret, message)
    |> Base.url_encode64(padding: false)
  end
end
