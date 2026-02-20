defmodule CallsafeSignaling.E2E.RestApiTest do
  @moduledoc """
  E2E tests for REST endpoints: public (Phase 1) and authenticated (Phase 2).

  Phase 1 — GET /, GET /health, GET /stats: no auth required.
  Phase 2 — POST /api/v1/turn/credentials, POST /api/v1/fcm/register,
             GET /api/v1/fcm/status/:device_id: JWT required, error cases.
  """

  use ExUnit.Case, async: false

  alias CallsafeSignaling.E2E.{HttpClient, TestClient, MockFCMServer, CallFixtures}
  alias CallsafeSignaling.Auth.JWT

  @secret "test_secret_for_e2e"

  setup_all do
    Application.put_env(:callsafe_signaling, :jwt_secret, @secret)
    Application.put_env(:callsafe_signaling, :http_port, 4001)
    :ok = CallsafeSignaling.E2E.AppLifecycle.start()
    on_exit(fn -> CallsafeSignaling.E2E.AppLifecycle.stop() end)
    :ok
  end

  # ---------------------------------------------------------------------------
  # GET /
  # ---------------------------------------------------------------------------

  describe "GET /" do
    test "returns 200 with service info" do
      {status, body} = HttpClient.get("/")

      assert status == 200
      assert body["service"] == "CallSafe Signaling Server"
      assert body["version"] == "0.1.0"
      assert body["status"] == "running"
    end
  end

  # ---------------------------------------------------------------------------
  # GET /health
  # ---------------------------------------------------------------------------

  describe "GET /health" do
    test "returns 200 with ok status and timestamp" do
      {status, body} = HttpClient.get("/health")

      assert status == 200
      assert body["status"] == "ok"
      assert is_binary(body["timestamp"])
      assert is_integer(body["uptime_seconds"])
    end

    test "health reports positive process count and memory" do
      {200, body} = HttpClient.get("/health")

      system = body["system"]
      assert is_integer(system["total_memory"]) and system["total_memory"] > 0
      assert is_integer(system["process_count"]) and system["process_count"] > 0
      assert is_integer(system["port_count"])
      assert is_integer(system["atom_count"])
    end

    test "health reports active connection count" do
      {200, body} = HttpClient.get("/health")

      connections = body["connections"]
      assert is_integer(connections["active"])
    end
  end

  # ---------------------------------------------------------------------------
  # GET /stats
  # ---------------------------------------------------------------------------

  describe "GET /stats" do
    test "returns 200 with full statistics structure" do
      {status, body} = HttpClient.get("/stats")

      assert status == 200

      assert is_map(body["connections"])
      assert Map.has_key?(body["connections"], "total")
      assert Map.has_key?(body["connections"], "active")

      assert is_map(body["messages"])
      assert Map.has_key?(body["messages"], "received")
      assert Map.has_key?(body["messages"], "sent")

      assert is_map(body["calls"])

      for key <- ~w(initiated accepted connected ended failed rejected) do
        assert Map.has_key?(body["calls"], key), "missing calls.#{key}"
      end

      assert is_map(body["fcm"])
      assert Map.has_key?(body["fcm"], "sent")
      assert Map.has_key?(body["fcm"], "failed")
    end

    test "stats counter values are non-negative integers" do
      {200, body} = HttpClient.get("/stats")

      assert body["connections"]["total"] >= 0
      assert body["connections"]["active"] >= 0
      assert body["messages"]["received"] >= 0
      assert body["calls"]["initiated"] >= 0
      assert body["fcm"]["sent"] >= 0
    end
  end

  # ---------------------------------------------------------------------------
  # Phase 2: POST /api/v1/turn/credentials
  # ---------------------------------------------------------------------------

  describe "POST /api/v1/turn/credentials" do
    test "valid JWT returns TURN credentials with required fields" do
      token = JWT.generate("turn_p2_01", "biz_turn", @secret)
      {status, body} = HttpClient.post("/api/v1/turn/credentials", %{}, token: token)

      assert status == 200
      assert is_list(body["uris"])
      assert is_binary(body["username"])
      assert is_binary(body["password"])
      assert body["ttl"] == 86400
    end

    test "username encodes future expiry timestamp" do
      token = JWT.generate("turn_p2_02", "biz_turn", @secret)
      {200, body} = HttpClient.post("/api/v1/turn/credentials", %{}, token: token)

      # Username format is "{expiry_unix}:callsafe"
      [expiry_str, suffix] = String.split(body["username"], ":")
      assert suffix == "callsafe"
      expiry = String.to_integer(expiry_str)
      assert expiry > System.system_time(:second)
    end

    test "missing Authorization header returns 401" do
      {status, body} = HttpClient.post("/api/v1/turn/credentials", %{})

      assert status == 401
      assert is_binary(body["error"]) or is_map(body)
    end

    test "expired token returns 401" do
      token = build_expired_token("turn_p2_03", "biz_turn", @secret)
      {status, _body} = HttpClient.post("/api/v1/turn/credentials", %{}, token: token)

      assert status == 401
    end
  end

  # ---------------------------------------------------------------------------
  # Phase 2: POST /api/v1/fcm/register
  # ---------------------------------------------------------------------------

  describe "POST /api/v1/fcm/register" do
    test "connected device registers push token successfully" do
      {:ok, client} = TestClient.connect()
      TestClient.authenticate(client, "fcm_reg_p2_01", "biz_fcm", device_type: "mobile")
      token = JWT.generate("fcm_reg_p2_01", "biz_fcm", @secret)

      {status, body} =
        HttpClient.post("/api/v1/fcm/register", %{push_token: "tok_device_01"}, token: token)

      assert status == 200
      assert body["success"] == true

      TestClient.disconnect(client)
    end

    test "missing push_token body field returns 400" do
      {:ok, client} = TestClient.connect()
      TestClient.authenticate(client, "fcm_reg_p2_02", "biz_fcm", device_type: "mobile")
      token = JWT.generate("fcm_reg_p2_02", "biz_fcm", @secret)

      {status, body} = HttpClient.post("/api/v1/fcm/register", %{}, token: token)

      assert status == 400
      assert body["error"] == "bad_request"

      TestClient.disconnect(client)
    end

    test "device not in registry returns 404" do
      token = JWT.generate("fcm_reg_p2_unknown", "biz_fcm", @secret)

      {status, body} =
        HttpClient.post("/api/v1/fcm/register", %{push_token: "tok_xyz"}, token: token)

      assert status == 404
      assert body["error"] == "device_not_found"
    end

    test "missing Authorization header returns 401" do
      {status, _body} = HttpClient.post("/api/v1/fcm/register", %{push_token: "tok_xyz"})

      assert status == 401
    end
  end

  # ---------------------------------------------------------------------------
  # Phase 2: GET /api/v1/fcm/status/:device_id
  # ---------------------------------------------------------------------------

  describe "GET /api/v1/fcm/status/:device_id" do
    test "connected device without push token reports has_push_token: false" do
      {:ok, client} = TestClient.connect()
      TestClient.authenticate(client, "fcm_st_p2_01", "biz_fcm_st", device_type: "mobile")
      token = JWT.generate("fcm_st_p2_01", "biz_fcm_st", @secret)

      {status, body} = HttpClient.get("/api/v1/fcm/status/fcm_st_p2_01", token: token)

      assert status == 200
      assert body["device_id"] == "fcm_st_p2_01"
      assert body["has_push_token"] == false

      TestClient.disconnect(client)
    end

    test "has_push_token becomes true after FCM registration" do
      {:ok, client} = TestClient.connect()
      TestClient.authenticate(client, "fcm_st_p2_02", "biz_fcm_st", device_type: "mobile")
      token = JWT.generate("fcm_st_p2_02", "biz_fcm_st", @secret)

      HttpClient.post("/api/v1/fcm/register", %{push_token: "tok_status_02"}, token: token)

      {status, body} = HttpClient.get("/api/v1/fcm/status/fcm_st_p2_02", token: token)

      assert status == 200
      assert body["has_push_token"] == true

      TestClient.disconnect(client)
    end

    test "status response includes device_id and connected_at" do
      {:ok, client} = TestClient.connect()
      TestClient.authenticate(client, "fcm_st_p2_03", "biz_fcm_st", device_type: "mobile")
      token = JWT.generate("fcm_st_p2_03", "biz_fcm_st", @secret)

      {200, body} = HttpClient.get("/api/v1/fcm/status/fcm_st_p2_03", token: token)

      assert body["device_id"] == "fcm_st_p2_03"
      assert is_integer(body["connected_at"])

      TestClient.disconnect(client)
    end

    test "querying another device's status returns 403" do
      {:ok, client_a} = TestClient.connect()
      {:ok, client_b} = TestClient.connect()
      TestClient.authenticate(client_a, "fcm_st_p2_04a", "biz_fcm_st")
      TestClient.authenticate(client_b, "fcm_st_p2_04b", "biz_fcm_st")

      token_a = JWT.generate("fcm_st_p2_04a", "biz_fcm_st", @secret)
      {status, body} = HttpClient.get("/api/v1/fcm/status/fcm_st_p2_04b", token: token_a)

      assert status == 403
      assert body["error"] == "forbidden"

      TestClient.disconnect(client_a)
      TestClient.disconnect(client_b)
    end

    test "unknown device_id returns 404" do
      token = JWT.generate("fcm_st_p2_unknown", "biz_fcm_st", @secret)
      {status, body} = HttpClient.get("/api/v1/fcm/status/fcm_st_p2_unknown", token: token)

      assert status == 404
      assert body["error"] == "device_not_found"
    end

    test "missing Authorization header returns 401" do
      {status, _body} = HttpClient.get("/api/v1/fcm/status/some_device")

      assert status == 401
    end
  end

  # ---------------------------------------------------------------------------
  # Phase 3: FCM Push Dispatch Verification
  # ---------------------------------------------------------------------------

  describe "FCM push dispatch on incoming call" do
    setup do
      {:ok, port} = MockFCMServer.start()

      Application.put_env(
        :callsafe_signaling,
        :fcm_endpoint,
        "http://localhost:#{port}/fcm/send"
      )

      Application.put_env(:callsafe_signaling, :fcm_server_key, "test_server_key")

      on_exit(fn ->
        MockFCMServer.stop()
        Application.delete_env(:callsafe_signaling, :fcm_endpoint)
        Application.delete_env(:callsafe_signaling, :fcm_server_key)
      end)

      {:ok, mock_port: port}
    end

    test "offline mobile agent with push token receives FCM push on incoming call" do
      biz = CallFixtures.uid("fcm3_biz")
      agent_id = CallFixtures.uid("fcm3_agent")
      caller_id = CallFixtures.uid("fcm3_caller")
      push_token = "tok_fcm3_#{:rand.uniform(1_000_000)}"

      # Connect mobile agent, register push token, then disconnect
      {:ok, agent} = TestClient.connect()
      TestClient.authenticate(agent, agent_id, biz, device_type: "mobile")
      token = JWT.generate(agent_id, biz, @secret)
      {200, _} = HttpClient.post("/api/v1/fcm/register", %{push_token: push_token}, token: token)
      TestClient.disconnect(agent)
      # Allow registry to process :DOWN and clear connection_pid
      Process.sleep(100)

      # Read fcm_sent counter before the call
      {200, stats_before} = HttpClient.get("/stats")
      fcm_sent_before = stats_before["fcm"]["sent"]

      # Caller initiates call to the same business
      {:ok, caller} = TestClient.connect()
      TestClient.authenticate(caller, caller_id, biz)
      call_id = CallFixtures.call_uuid()
      :ok = TestClient.send_message(caller, CallFixtures.call_initiate(call_id))
      # call:incoming is the response to call:initiate when devices are found;
      # FCM dispatch is synchronous inside the handler so by the time this
      # response arrives the push has already been sent.
      TestClient.assert_receive_type(caller, "call:incoming")

      # Assert mock FCM server captured the push request
      assert {:ok, fcm_req} = MockFCMServer.await_request()

      assert fcm_req["to"] == push_token
      assert fcm_req["priority"] == "high"

      data = fcm_req["data"]
      assert data["call_id"] == call_id
      assert data["caller_id"] == caller_id
      assert data["call_type"] == "voice"
      assert is_integer(data["timestamp"])

      # Verify fcm_sent stat incremented
      {200, stats_after} = HttpClient.get("/stats")
      assert stats_after["fcm"]["sent"] == fcm_sent_before + 1

      TestClient.disconnect(caller)
    end

    test "FCM request includes notification block with call type in title" do
      biz = CallFixtures.uid("fcm3b_biz")
      agent_id = CallFixtures.uid("fcm3b_agent")
      caller_id = CallFixtures.uid("fcm3b_caller")
      push_token = "tok_fcm3b_#{:rand.uniform(1_000_000)}"

      {:ok, agent} = TestClient.connect()
      TestClient.authenticate(agent, agent_id, biz, device_type: "mobile")
      token = JWT.generate(agent_id, biz, @secret)
      {200, _} = HttpClient.post("/api/v1/fcm/register", %{push_token: push_token}, token: token)
      TestClient.disconnect(agent)
      Process.sleep(100)

      {:ok, caller} = TestClient.connect()
      TestClient.authenticate(caller, caller_id, biz)
      call_id = CallFixtures.call_uuid()
      :ok = TestClient.send_message(caller, CallFixtures.call_initiate(call_id))
      TestClient.assert_receive_type(caller, "call:incoming")

      assert {:ok, fcm_req} = MockFCMServer.await_request()

      notification = fcm_req["notification"]
      assert is_map(notification)
      assert notification["title"] =~ "voice"
      assert is_binary(notification["body"])

      TestClient.disconnect(caller)
    end

    test "device without push token does not trigger FCM dispatch" do
      biz = CallFixtures.uid("fcm3c_biz")
      agent_id = CallFixtures.uid("fcm3c_agent")
      caller_id = CallFixtures.uid("fcm3c_caller")

      # Connect mobile agent but do NOT register a push token
      {:ok, agent} = TestClient.connect()
      TestClient.authenticate(agent, agent_id, biz, device_type: "mobile")
      TestClient.disconnect(agent)
      Process.sleep(100)

      {200, stats_before} = HttpClient.get("/stats")
      fcm_sent_before = stats_before["fcm"]["sent"]

      {:ok, caller} = TestClient.connect()
      TestClient.authenticate(caller, caller_id, biz)
      call_id = CallFixtures.call_uuid()
      :ok = TestClient.send_message(caller, CallFixtures.call_initiate(call_id))
      TestClient.assert_receive_type(caller, "call:incoming")

      # No FCM request should have been sent
      assert {:error, :timeout} = MockFCMServer.await_request(300)

      {200, stats_after} = HttpClient.get("/stats")
      assert stats_after["fcm"]["sent"] == fcm_sent_before

      TestClient.disconnect(caller)
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # Builds a syntactically valid JWT signed with the correct secret but with
  # an expiry timestamp set one hour in the past, triggering :expired validation.
  defp build_expired_token(device_id, business_id, secret) do
    now = System.system_time(:second)

    header = %{"alg" => "HS256", "typ" => "JWT"}

    payload = %{
      "device_id" => device_id,
      "business_id" => business_id,
      "iat" => now - 7200,
      "exp" => now - 3600
    }

    header_b64 = Base.url_encode64(Jason.encode!(header), padding: false)
    payload_b64 = Base.url_encode64(Jason.encode!(payload), padding: false)
    message = "#{header_b64}.#{payload_b64}"
    signature = Base.url_encode64(:crypto.mac(:hmac, :sha256, secret, message), padding: false)

    "#{header_b64}.#{payload_b64}.#{signature}"
  end
end
