defmodule CallsafeSignaling.Auth.RateLimiterTest do
  use ExUnit.Case, async: false

  alias CallsafeSignaling.Auth.RateLimiter

  setup do
    # Start RateLimiter for tests
    start_supervised!(RateLimiter)

    # Configure test rate limits
    Application.put_env(:callsafe_signaling, :max_requests_per_device, 5)
    Application.put_env(:callsafe_signaling, :max_requests_per_ip, 10)
    Application.put_env(:callsafe_signaling, :rate_limit_window_seconds, 60)

    :ok
  end

  describe "check_device/1" do
    test "allows requests within limit" do
      device_id = "device_#{:rand.uniform(1_000_000)}"

      # First 5 requests should succeed
      for _ <- 1..5 do
        assert :ok = RateLimiter.check_device(device_id)
      end

      assert RateLimiter.get_device_count(device_id) == 5
    end

    test "blocks requests exceeding limit" do
      device_id = "device_#{:rand.uniform(1_000_000)}"

      # First 5 requests succeed
      for _ <- 1..5 do
        assert :ok = RateLimiter.check_device(device_id)
      end

      # 6th request should fail
      assert {:error, :rate_limit_exceeded} = RateLimiter.check_device(device_id)
    end

    test "resets counter after window expires" do
      device_id = "device_#{:rand.uniform(1_000_000)}"

      # Use up the limit
      for _ <- 1..5 do
        assert :ok = RateLimiter.check_device(device_id)
      end

      # Manually expire the window by manipulating ETS
      # In real scenario, we'd wait for window_seconds
      :ets.delete(:rate_limiter, {:device, device_id})

      # Should work again
      assert :ok = RateLimiter.check_device(device_id)
    end

    test "tracks different devices independently" do
      device1 = "device_#{:rand.uniform(1_000_000)}"
      device2 = "device_#{:rand.uniform(1_000_000)}"

      for _ <- 1..5 do
        assert :ok = RateLimiter.check_device(device1)
      end

      # device2 should still have full quota
      assert :ok = RateLimiter.check_device(device2)
      assert RateLimiter.get_device_count(device2) == 1
    end

    test "rejects invalid input" do
      assert {:error, :rate_limit_exceeded} = RateLimiter.check_device(nil)
      assert {:error, :rate_limit_exceeded} = RateLimiter.check_device(123)
    end
  end

  describe "check_ip/1" do
    test "allows requests within limit" do
      ip = "192.168.1.#{:rand.uniform(255)}"

      # First 10 requests should succeed
      for _ <- 1..10 do
        assert :ok = RateLimiter.check_ip(ip)
      end

      assert RateLimiter.get_ip_count(ip) == 10
    end

    test "blocks requests exceeding limit" do
      ip = "192.168.1.#{:rand.uniform(255)}"

      # First 10 requests succeed
      for _ <- 1..10 do
        assert :ok = RateLimiter.check_ip(ip)
      end

      # 11th request should fail
      assert {:error, :rate_limit_exceeded} = RateLimiter.check_ip(ip)
    end

    test "tracks different IPs independently" do
      ip1 = "192.168.1.#{:rand.uniform(255)}"
      ip2 = "192.168.2.#{:rand.uniform(255)}"

      for _ <- 1..10 do
        assert :ok = RateLimiter.check_ip(ip1)
      end

      # ip2 should still have full quota
      assert :ok = RateLimiter.check_ip(ip2)
      assert RateLimiter.get_ip_count(ip2) == 1
    end
  end

  describe "check/2" do
    test "allows requests when both device and IP are within limits" do
      device_id = "device_#{:rand.uniform(1_000_000)}"
      ip = "192.168.1.#{:rand.uniform(255)}"

      assert :ok = RateLimiter.check(device_id, ip)
    end

    test "blocks when device limit exceeded" do
      device_id = "device_#{:rand.uniform(1_000_000)}"
      ip = "192.168.1.#{:rand.uniform(255)}"

      # Use up device quota
      for _ <- 1..5 do
        assert :ok = RateLimiter.check_device(device_id)
      end

      # Combined check should fail due to device limit
      assert {:error, :rate_limit_exceeded} = RateLimiter.check(device_id, ip)
    end

    test "blocks when IP limit exceeded" do
      device_id = "device_#{:rand.uniform(1_000_000)}"
      ip = "192.168.1.#{:rand.uniform(255)}"

      # Use up IP quota
      for _ <- 1..10 do
        assert :ok = RateLimiter.check_ip(ip)
      end

      # Combined check should fail due to IP limit
      assert {:error, :rate_limit_exceeded} = RateLimiter.check(device_id, ip)
    end
  end

  describe "reset_device/1 and reset_ip/1" do
    test "reset_device clears device counter" do
      device_id = "device_#{:rand.uniform(1_000_000)}"

      for _ <- 1..5 do
        assert :ok = RateLimiter.check_device(device_id)
      end

      assert {:error, :rate_limit_exceeded} = RateLimiter.check_device(device_id)

      RateLimiter.reset_device(device_id)
      assert :ok = RateLimiter.check_device(device_id)
    end

    test "reset_ip clears IP counter" do
      ip = "192.168.1.#{:rand.uniform(255)}"

      for _ <- 1..10 do
        assert :ok = RateLimiter.check_ip(ip)
      end

      assert {:error, :rate_limit_exceeded} = RateLimiter.check_ip(ip)

      RateLimiter.reset_ip(ip)
      assert :ok = RateLimiter.check_ip(ip)
    end
  end

  describe "get_device_count/1 and get_ip_count/1" do
    test "returns correct count for device" do
      device_id = "device_#{:rand.uniform(1_000_000)}"

      assert RateLimiter.get_device_count(device_id) == 0

      RateLimiter.check_device(device_id)
      assert RateLimiter.get_device_count(device_id) == 1

      RateLimiter.check_device(device_id)
      assert RateLimiter.get_device_count(device_id) == 2
    end

    test "returns correct count for IP" do
      ip = "192.168.1.#{:rand.uniform(255)}"

      assert RateLimiter.get_ip_count(ip) == 0

      RateLimiter.check_ip(ip)
      assert RateLimiter.get_ip_count(ip) == 1

      RateLimiter.check_ip(ip)
      assert RateLimiter.get_ip_count(ip) == 2
    end
  end
end
