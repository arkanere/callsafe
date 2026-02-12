defmodule CallsafeSignaling.Middleware.PipelineTest do
  use ExUnit.Case, async: false

  alias CallsafeSignaling.Middleware.Pipeline
  alias CallsafeSignaling.Auth.{JWT, RateLimiter}

  @secret "test_secret_for_pipeline"
  @device_id "device_test_123"
  @business_id "business_test_456"
  @ip_address "192.168.1.100"

  setup do
    # Start RateLimiter
    start_supervised!(RateLimiter)

    # Configure test environment
    Application.put_env(:callsafe_signaling, :jwt_secret, @secret)
    Application.put_env(:callsafe_signaling, :max_requests_per_device, 5)
    Application.put_env(:callsafe_signaling, :max_requests_per_ip, 10)
    Application.put_env(:callsafe_signaling, :rate_limit_window_seconds, 60)

    :ok
  end

  describe "execute/2" do
    test "executes empty pipeline successfully" do
      context = %{value: 1}
      assert {:ok, ^context} = Pipeline.execute([], context)
    end

    test "executes single middleware successfully" do
      middleware = fn ctx -> {:ok, Map.put(ctx, :processed, true)} end
      context = %{value: 1}

      assert {:ok, result} = Pipeline.execute([middleware], context)
      assert result.processed == true
      assert result.value == 1
    end

    test "executes multiple middleware in order" do
      middleware1 = fn ctx -> {:ok, Map.put(ctx, :step1, true)} end
      middleware2 = fn ctx -> {:ok, Map.put(ctx, :step2, true)} end
      middleware3 = fn ctx -> {:ok, Map.put(ctx, :step3, true)} end

      context = %{}

      assert {:ok, result} = Pipeline.execute([middleware1, middleware2, middleware3], context)
      assert result.step1 == true
      assert result.step2 == true
      assert result.step3 == true
    end

    test "stops on first error" do
      middleware1 = fn ctx -> {:ok, Map.put(ctx, :step1, true)} end
      middleware2 = fn _ctx -> {:error, :failed} end
      middleware3 = fn ctx -> {:ok, Map.put(ctx, :step3, true)} end

      context = %{}

      assert {:error, :failed} = Pipeline.execute([middleware1, middleware2, middleware3], context)
    end
  end

  describe "compose/1" do
    test "composes middleware into single function" do
      middleware1 = fn ctx -> {:ok, Map.put(ctx, :a, 1)} end
      middleware2 = fn ctx -> {:ok, Map.put(ctx, :b, 2)} end

      composed = Pipeline.compose([middleware1, middleware2])

      assert is_function(composed, 1)
      assert {:ok, result} = composed.(%{})
      assert result.a == 1
      assert result.b == 2
    end
  end

  describe "authenticate_jwt/0" do
    test "authenticates valid token" do
      token = JWT.generate(@device_id, @business_id, @secret)
      context = Pipeline.build_context(token, @ip_address)

      middleware = Pipeline.authenticate_jwt()
      assert {:ok, result} = middleware.(context)
      assert result.device_id == @device_id
      assert result.business_id == @business_id
      assert is_map(result.claims)
    end

    test "rejects missing token" do
      context = Pipeline.build_context(nil, @ip_address)

      middleware = Pipeline.authenticate_jwt()
      assert {:error, :missing_token} = middleware.(context)
    end

    test "rejects invalid token" do
      context = Pipeline.build_context("invalid.token.here", @ip_address)

      middleware = Pipeline.authenticate_jwt()
      assert {:error, :invalid_token} = middleware.(context)
    end

    test "rejects expired token" do
      # Create expired token
      now = System.system_time(:second)
      header = %{"alg" => "HS256", "typ" => "JWT"}

      payload = %{
        "device_id" => @device_id,
        "business_id" => @business_id,
        "iat" => now - 7200,
        "exp" => now - 3600
      }

      token = build_token(header, payload, @secret)
      context = Pipeline.build_context(token, @ip_address)

      middleware = Pipeline.authenticate_jwt()
      assert {:error, :expired} = middleware.(context)
    end
  end

  describe "rate_limit_device/0" do
    test "allows requests within limit" do
      device_id = "device_#{:rand.uniform(1_000_000)}"
      context = %{device_id: device_id}

      middleware = Pipeline.rate_limit_device()

      for _ <- 1..5 do
        assert {:ok, _} = middleware.(context)
      end
    end

    test "blocks requests exceeding limit" do
      device_id = "device_#{:rand.uniform(1_000_000)}"
      context = %{device_id: device_id}

      middleware = Pipeline.rate_limit_device()

      for _ <- 1..5 do
        assert {:ok, _} = middleware.(context)
      end

      assert {:error, :rate_limit_exceeded} = middleware.(context)
    end

    test "requires device_id in context" do
      context = %{}
      middleware = Pipeline.rate_limit_device()
      assert {:error, :missing_device_id} = middleware.(context)
    end
  end

  describe "rate_limit_ip/0" do
    test "allows requests within limit" do
      ip = "192.168.1.#{:rand.uniform(255)}"
      context = %{ip_address: ip}

      middleware = Pipeline.rate_limit_ip()

      for _ <- 1..10 do
        assert {:ok, _} = middleware.(context)
      end
    end

    test "blocks requests exceeding limit" do
      ip = "192.168.1.#{:rand.uniform(255)}"
      context = %{ip_address: ip}

      middleware = Pipeline.rate_limit_ip()

      for _ <- 1..10 do
        assert {:ok, _} = middleware.(context)
      end

      assert {:error, :rate_limit_exceeded} = middleware.(context)
    end

    test "requires ip_address in context" do
      context = %{}
      middleware = Pipeline.rate_limit_ip()
      assert {:error, :missing_ip_address} = middleware.(context)
    end
  end

  describe "rate_limit/0" do
    test "checks both device and IP limits" do
      device_id = "device_#{:rand.uniform(1_000_000)}"
      ip = "192.168.1.#{:rand.uniform(255)}"
      context = %{device_id: device_id, ip_address: ip}

      middleware = Pipeline.rate_limit()
      assert {:ok, _} = middleware.(context)
    end

    test "requires both device_id and ip_address" do
      middleware = Pipeline.rate_limit()

      assert {:error, :missing_device_id} = middleware.(%{ip_address: @ip_address})
      assert {:error, :missing_ip_address} = middleware.(%{device_id: @device_id})
    end
  end

  describe "log/1" do
    test "logs and passes context through" do
      context = %{value: 123}
      middleware = Pipeline.log("Test message")

      assert {:ok, ^context} = middleware.(context)
    end
  end

  describe "enrich_metadata/1" do
    test "adds metadata to context" do
      context = %{}
      metadata = %{source: "test", version: "1.0"}
      middleware = Pipeline.enrich_metadata(metadata)

      assert {:ok, result} = middleware.(context)
      assert result.metadata == metadata
    end

    test "merges with existing metadata" do
      context = %{metadata: %{existing: "value"}}
      metadata = %{new: "data"}
      middleware = Pipeline.enrich_metadata(metadata)

      assert {:ok, result} = middleware.(context)
      assert result.metadata.existing == "value"
      assert result.metadata.new == "data"
    end
  end

  describe "standard_pipeline/0" do
    test "authenticates and rate limits" do
      token = JWT.generate(@device_id, @business_id, @secret)
      context = Pipeline.build_context(token, @ip_address)

      pipeline = Pipeline.standard_pipeline()
      assert {:ok, result} = Pipeline.execute(pipeline, context)
      assert result.device_id == @device_id
      assert result.business_id == @business_id
    end

    test "fails on invalid token" do
      context = Pipeline.build_context("invalid", @ip_address)

      pipeline = Pipeline.standard_pipeline()
      assert {:error, :invalid_token} = Pipeline.execute(pipeline, context)
    end

    test "fails when rate limited" do
      device_id = "device_#{:rand.uniform(1_000_000)}"
      ip = "192.168.1.#{:rand.uniform(255)}"

      # Use up device quota
      for _ <- 1..5 do
        RateLimiter.check_device(device_id)
      end

      token = JWT.generate(device_id, @business_id, @secret)
      context = Pipeline.build_context(token, ip)

      pipeline = Pipeline.standard_pipeline()
      assert {:error, :rate_limit_exceeded} = Pipeline.execute(pipeline, context)
    end
  end

  describe "auth_only_pipeline/0" do
    test "authenticates without rate limiting" do
      device_id = "device_#{:rand.uniform(1_000_000)}"
      token = JWT.generate(device_id, @business_id, @secret)

      # Use up quota
      for _ <- 1..5 do
        RateLimiter.check_device(device_id)
      end

      # Auth-only pipeline should still succeed
      context = Pipeline.build_context(token, @ip_address)
      pipeline = Pipeline.auth_only_pipeline()
      assert {:ok, result} = Pipeline.execute(pipeline, context)
      assert result.device_id == device_id
    end
  end

  describe "rate_limit_only_pipeline/0" do
    test "rate limits without authentication" do
      context = %{device_id: @device_id, ip_address: @ip_address}
      pipeline = Pipeline.rate_limit_only_pipeline()
      assert {:ok, _} = Pipeline.execute(pipeline, context)
    end
  end

  describe "build_context/3" do
    test "builds initial context with token and IP" do
      context = Pipeline.build_context("token", "192.168.1.1")

      assert context.token == "token"
      assert context.ip_address == "192.168.1.1"
      assert is_nil(context.device_id)
      assert is_nil(context.business_id)
      assert is_nil(context.claims)
      assert context.metadata == %{}
    end

    test "builds context with metadata" do
      metadata = %{source: "websocket"}
      context = Pipeline.build_context("token", "192.168.1.1", metadata)

      assert context.metadata == metadata
    end

    test "handles nil token and IP" do
      context = Pipeline.build_context(nil, nil)

      assert is_nil(context.token)
      assert is_nil(context.ip_address)
    end
  end

  # Helper

  defp build_token(header, payload, secret) do
    header_b64 = encode_json(header)
    payload_b64 = encode_json(payload)
    signature = sign(header_b64, payload_b64, secret)
    "#{header_b64}.#{payload_b64}.#{signature}"
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
