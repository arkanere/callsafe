defmodule CallsafeSignaling.E2E.WebsocketHarnessTest do
  @moduledoc """
  Phase 1 E2E tests: verify the TestClient harness works against the live server.

  These tests exercise the harness itself — connection, authentication, message
  delivery, independent queues, and timeout behaviour.  They are the foundation
  all subsequent call-lifecycle E2E tests build on.
  """

  use ExUnit.Case, async: false

  alias CallsafeSignaling.E2E.TestClient

  @business_id "biz_harness_test"

  # Start the full application once for all tests in this module, then stop it.
  setup_all do
    # Ensure config is set before the app boots (test.exs already sets these;
    # put_env here is an explicit runtime guard).
    Application.put_env(:callsafe_signaling, :jwt_secret, "test_secret_for_e2e")
    Application.put_env(:callsafe_signaling, :http_port, 4001)

    {:ok, _apps} = Application.ensure_all_started(:callsafe_signaling)
    # Give cowboy a moment to bind the port.
    Process.sleep(50)

    on_exit(fn -> Application.stop(:callsafe_signaling) end)
    :ok
  end

  # ---------------------------------------------------------------------------
  # Connection
  # ---------------------------------------------------------------------------

  describe "WebSocket connection" do
    test "connects to server and client process is alive" do
      {:ok, client} = TestClient.connect()
      assert Process.alive?(client)
      TestClient.disconnect(client)
    end

    test "disconnect terminates the client process" do
      {:ok, client} = TestClient.connect()
      ref = Process.monitor(client)
      TestClient.disconnect(client)
      assert_receive {:DOWN, ^ref, :process, ^client, _}, 1_000
    end
  end

  # ---------------------------------------------------------------------------
  # Authentication
  # ---------------------------------------------------------------------------

  describe "authentication" do
    test "valid JWT returns device:connected" do
      {:ok, client} = TestClient.connect()
      response = TestClient.authenticate(client, "harness_auth_01", @business_id)

      assert response["type"] == "device:connected"
      assert response["deviceId"] == "harness_auth_01"
      assert response["status"] == "connected"
      assert response["protocolVersion"] == "1.0.0"

      TestClient.disconnect(client)
    end

    test "invalid JWT token returns error" do
      {:ok, client} = TestClient.connect()

      :ok =
        TestClient.send_message(client, %{
          "type" => "device:connect",
          "deviceId" => "bad_auth_device",
          "deviceType" => "web",
          "token" => "not.a.valid.jwt",
          "protocolVersion" => "1.0.0"
        })

      response = TestClient.assert_receive_type(client, "error")
      assert response["error"] != nil

      TestClient.disconnect(client)
    end

    test "missing token returns error" do
      {:ok, client} = TestClient.connect()

      :ok =
        TestClient.send_message(client, %{
          "type" => "device:connect",
          "deviceId" => "no_token_device",
          "deviceType" => "web",
          "protocolVersion" => "1.0.0"
        })

      response = TestClient.assert_receive_type(client, "error")
      assert response["error"] != nil

      TestClient.disconnect(client)
    end
  end

  # ---------------------------------------------------------------------------
  # Send / receive helpers
  # ---------------------------------------------------------------------------

  describe "send and receive" do
    test "unknown message type returns error" do
      {:ok, client} = TestClient.connect()
      TestClient.authenticate(client, "harness_msg_01", @business_id)

      :ok = TestClient.send_message(client, %{"type" => "unknown:message_type"})
      response = TestClient.assert_receive_type(client, "error")
      assert response["error"] != nil

      TestClient.disconnect(client)
    end

    test "receive_next times out when no message arrives" do
      {:ok, client} = TestClient.connect()
      assert {:error, :timeout} = TestClient.receive_next(client, 200)
      TestClient.disconnect(client)
    end

    test "drain returns all queued messages and empties queue" do
      {:ok, client} = TestClient.connect()
      TestClient.authenticate(client, "harness_drain_01", @business_id)

      # Send two messages that produce error responses.
      :ok = TestClient.send_message(client, %{"type" => "bad:msg_1"})
      :ok = TestClient.send_message(client, %{"type" => "bad:msg_2"})

      # Give server time to respond.
      Process.sleep(100)

      messages = TestClient.drain(client)
      assert length(messages) == 2
      assert Enum.all?(messages, &(&1["type"] == "error"))

      # Queue should be empty now.
      assert [] = TestClient.drain(client)

      TestClient.disconnect(client)
    end
  end

  # ---------------------------------------------------------------------------
  # Multiple simultaneous clients / independent queues
  # ---------------------------------------------------------------------------

  describe "multiple simultaneous clients" do
    test "two clients connect independently" do
      {:ok, client1} = TestClient.connect()
      {:ok, client2} = TestClient.connect()

      assert Process.alive?(client1)
      assert Process.alive?(client2)
      assert client1 != client2

      TestClient.disconnect(client1)
      TestClient.disconnect(client2)
    end

    test "each client authenticates with its own device id" do
      {:ok, client1} = TestClient.connect()
      {:ok, client2} = TestClient.connect()

      resp1 = TestClient.authenticate(client1, "harness_multi_01", @business_id)
      resp2 = TestClient.authenticate(client2, "harness_multi_02", @business_id)

      assert resp1["deviceId"] == "harness_multi_01"
      assert resp2["deviceId"] == "harness_multi_02"

      TestClient.disconnect(client1)
      TestClient.disconnect(client2)
    end

    test "messages to one client do not appear in another client's queue" do
      {:ok, client1} = TestClient.connect()
      {:ok, client2} = TestClient.connect()

      TestClient.authenticate(client1, "harness_queue_01", @business_id)
      TestClient.authenticate(client2, "harness_queue_02", @business_id)

      # Trigger an error response only on client1.
      :ok = TestClient.send_message(client1, %{"type" => "spill_check"})

      Process.sleep(100)

      # client1 should have the error.
      assert [msg] = TestClient.drain(client1)
      assert msg["type"] == "error"

      # client2 queue should be empty.
      assert [] = TestClient.drain(client2)

      TestClient.disconnect(client1)
      TestClient.disconnect(client2)
    end

    test "ten concurrent clients all connect and authenticate" do
      clients =
        for i <- 1..10 do
          {:ok, client} = TestClient.connect()
          resp = TestClient.authenticate(client, "harness_concurrent_#{i}", @business_id)
          assert resp["type"] == "device:connected"
          client
        end

      assert length(clients) == 10
      Enum.each(clients, &TestClient.disconnect/1)
    end
  end
end
