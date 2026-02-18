defmodule CallsafeSignaling.E2E.TestClient do
  @moduledoc """
  Reusable WebSocket client for E2E tests.

  Opens a real TCP/WebSocket connection to the running server, performs the
  HTTP upgrade handshake, and routes incoming frames to per-client message
  queues.  Multiple independent instances can run concurrently — each is an
  isolated GenServer with its own mailbox.

  Helpers
    connect/1           – open connection, returns {:ok, pid}
    authenticate/4      – send device:connect + assert device:connected
    send_message/2      – encode and send a JSON map
    receive_next/2      – pop next queued message (blocks up to timeout)
    assert_receive_type/3 – receive_next + assert on "type" field
    drain/1             – flush queue non-blocking, return list
    disconnect/1        – close connection
  """

  use GenServer
  import Bitwise

  require Logger

  alias CallsafeSignaling.Auth.JWT

  @default_port 4001
  @ws_path "/ws"
  @connect_timeout 5_000
  @default_receive_timeout 5_000

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  def connect(opts \\ []) do
    port = Keyword.get(opts, :port, @default_port)
    host = Keyword.get(opts, :host, ~c"localhost")
    GenServer.start_link(__MODULE__, {host, port})
  end

  def authenticate(client, device_id, business_id, opts \\ []) do
    device_type = Keyword.get(opts, :device_type, "web")
    secret = Keyword.get(opts, :secret, jwt_secret())
    token = JWT.generate(device_id, business_id, secret)

    :ok =
      send_message(client, %{
        "type" => "device:connect",
        "deviceId" => device_id,
        "deviceType" => device_type,
        "token" => token,
        "protocolVersion" => "1.0.0"
      })

    assert_receive_type(client, "device:connected")
  end

  def send_message(client, message) when is_map(message) do
    GenServer.call(client, {:send, message})
  end

  def receive_next(client, timeout \\ @default_receive_timeout) do
    try do
      GenServer.call(client, {:receive_next, timeout}, timeout + 1_000)
    catch
      :exit, {:timeout, _} -> {:error, :timeout}
    end
  end

  def assert_receive_type(client, expected_type, timeout \\ @default_receive_timeout) do
    case receive_next(client, timeout) do
      {:ok, %{"type" => ^expected_type} = msg} ->
        msg

      {:ok, msg} ->
        raise ExUnit.AssertionError,
          message: "Expected message type \"#{expected_type}\", got: #{inspect(msg)}"

      {:error, :timeout} ->
        raise ExUnit.AssertionError,
          message: "Timeout (#{timeout}ms) waiting for message type \"#{expected_type}\""
    end
  end

  def drain(client) do
    GenServer.call(client, :drain)
  end

  def disconnect(client) do
    GenServer.stop(client, :normal)
  end

  # ---------------------------------------------------------------------------
  # GenServer callbacks
  # ---------------------------------------------------------------------------

  @impl GenServer
  def init({host, port}) do
    case do_connect(host, port) do
      {:ok, socket} ->
        {:ok,
         %{
           socket: socket,
           buffer: <<>>,
           queue: :queue.new(),
           waiters: []
         }}

      {:error, reason} ->
        {:stop, {:connect_failed, reason}}
    end
  end

  @impl GenServer
  def handle_call({:send, message}, _from, state) do
    json = Jason.encode!(message)
    result = :gen_tcp.send(state.socket, encode_text_frame(json))
    {:reply, result, state}
  end

  def handle_call({:receive_next, timeout}, from, state) do
    case :queue.out(state.queue) do
      {{:value, msg}, new_queue} ->
        {:reply, {:ok, msg}, %{state | queue: new_queue}}

      {:empty, _} ->
        timer = Process.send_after(self(), {:receive_timeout, from}, timeout)
        {:noreply, %{state | waiters: state.waiters ++ [{from, timer}]}}
    end
  end

  def handle_call(:drain, _from, state) do
    {:reply, :queue.to_list(state.queue), %{state | queue: :queue.new()}}
  end

  @impl GenServer
  def handle_info({:receive_timeout, from}, state) do
    # Waiter may already have been served; only reply if still present.
    new_waiters = List.keydelete(state.waiters, from, 0)

    if length(new_waiters) < length(state.waiters) do
      GenServer.reply(from, {:error, :timeout})
    end

    {:noreply, %{state | waiters: new_waiters}}
  end

  def handle_info({:tcp, socket, data}, %{socket: socket} = state) do
    {messages, remaining} = parse_ws_frames(state.buffer <> data)
    new_state = Enum.reduce(messages, %{state | buffer: remaining}, &deliver/2)
    {:noreply, new_state}
  end

  def handle_info({:tcp_closed, _socket}, state) do
    Enum.each(state.waiters, fn {from, timer} ->
      Process.cancel_timer(timer)
      GenServer.reply(from, {:error, :closed})
    end)

    {:stop, :normal, %{state | waiters: []}}
  end

  def handle_info({:tcp_error, _socket, reason}, state) do
    Enum.each(state.waiters, fn {from, timer} ->
      Process.cancel_timer(timer)
      GenServer.reply(from, {:error, {:tcp_error, reason}})
    end)

    {:stop, {:tcp_error, reason}, %{state | waiters: []}}
  end

  def handle_info(msg, state) do
    Logger.debug("TestClient unexpected message: #{inspect(msg)}")
    {:noreply, state}
  end

  # ---------------------------------------------------------------------------
  # Connection setup
  # ---------------------------------------------------------------------------

  defp do_connect(host, port) do
    tcp_opts = [:binary, active: true, packet: :raw, nodelay: true]

    with {:ok, socket} <- :gen_tcp.connect(host, port, tcp_opts, @connect_timeout),
         :ok <- send_http_upgrade(socket, host, port),
         :ok <- await_101(socket) do
      {:ok, socket}
    end
  end

  defp send_http_upgrade(socket, host, port) do
    key = Base.encode64(:crypto.strong_rand_bytes(16))
    host_str = if is_list(host), do: List.to_string(host), else: to_string(host)

    request =
      "GET #{@ws_path} HTTP/1.1\r\n" <>
        "Host: #{host_str}:#{port}\r\n" <>
        "Upgrade: websocket\r\n" <>
        "Connection: Upgrade\r\n" <>
        "Sec-WebSocket-Key: #{key}\r\n" <>
        "Sec-WebSocket-Version: 13\r\n" <>
        "\r\n"

    :gen_tcp.send(socket, request)
  end

  defp await_101(socket) do
    receive do
      {:tcp, ^socket, data} ->
        if String.contains?(data, "101 Switching Protocols") do
          :ok
        else
          {:error, {:unexpected_http_response, data}}
        end
    after
      @connect_timeout -> {:error, :http_upgrade_timeout}
    end
  end

  # ---------------------------------------------------------------------------
  # WebSocket frame encoding  (client → server, RFC 6455: must be masked)
  # ---------------------------------------------------------------------------

  defp encode_text_frame(payload) when is_binary(payload) do
    len = byte_size(payload)
    mask_key = :crypto.strong_rand_bytes(4)
    masked = xor_mask(payload, mask_key)

    # MASK bit (0x80) must be set in the length-indicator byte for all frame sizes.
    len_bytes =
      cond do
        len <= 125 -> <<0x80 ||| len>>
        len <= 0xFFFF -> <<0x80 ||| 126, len::unsigned-big-16>>
        true -> <<0x80 ||| 127, len::unsigned-big-64>>
      end

    <<0x81, len_bytes::binary, mask_key::binary, masked::binary>>
  end

  defp xor_mask(data, <<m0, m1, m2, m3>>) do
    data
    |> :binary.bin_to_list()
    |> Enum.with_index()
    |> Enum.map(fn {b, i} ->
      mask_byte =
        case rem(i, 4) do
          0 -> m0
          1 -> m1
          2 -> m2
          3 -> m3
        end

      Bitwise.bxor(b, mask_byte)
    end)
    |> :binary.list_to_bin()
  end

  # ---------------------------------------------------------------------------
  # WebSocket frame decoding  (server → client, no masking)
  # ---------------------------------------------------------------------------

  defp parse_ws_frames(buffer), do: parse_ws_frames(buffer, [])

  # Need at least 2 header bytes to begin parsing.
  defp parse_ws_frames(buffer, acc) when byte_size(buffer) < 2 do
    {Enum.reverse(acc), buffer}
  end

  defp parse_ws_frames(<<fin_op, mask_len, rest::binary>> = buffer, acc) do
    opcode = fin_op &&& 0x0F
    is_masked = (mask_len &&& 0x80) != 0
    raw_len = mask_len &&& 0x7F

    case extract_length(raw_len, rest) do
      {:ok, payload_len, payload_rest} ->
        extra = if is_masked, do: 4, else: 0

        if byte_size(payload_rest) >= extra + payload_len do
          {payload, after_frame} =
            if is_masked do
              <<mask::binary-size(4), p::binary-size(payload_len), tail::binary>> = payload_rest
              {xor_mask(p, mask), tail}
            else
              <<p::binary-size(payload_len), tail::binary>> = payload_rest
              {p, tail}
            end

          case decode_frame(opcode, payload) do
            {:message, msg} -> parse_ws_frames(after_frame, [msg | acc])
            :skip -> parse_ws_frames(after_frame, acc)
            :close -> {Enum.reverse(acc), after_frame}
          end
        else
          # Incomplete payload — keep buffer intact for next TCP segment.
          {Enum.reverse(acc), buffer}
        end

      :incomplete ->
        {Enum.reverse(acc), buffer}
    end
  end

  defp extract_length(len, rest) when len <= 125, do: {:ok, len, rest}

  defp extract_length(126, rest) do
    case rest do
      <<len::unsigned-big-16, rest2::binary>> -> {:ok, len, rest2}
      _ -> :incomplete
    end
  end

  defp extract_length(127, rest) do
    case rest do
      <<len::unsigned-big-64, rest2::binary>> -> {:ok, len, rest2}
      _ -> :incomplete
    end
  end

  # Text frame → decode JSON
  defp decode_frame(0x1, payload) do
    case Jason.decode(payload) do
      {:ok, msg} -> {:message, msg}
      _ -> :skip
    end
  end

  # Connection close
  defp decode_frame(0x8, _), do: :close

  # Ping / pong / continuation — ignore
  defp decode_frame(_, _), do: :skip

  # ---------------------------------------------------------------------------
  # Message delivery: waiter-first, then queue
  # ---------------------------------------------------------------------------

  defp deliver(msg, state) do
    case state.waiters do
      [{from, timer} | rest] ->
        Process.cancel_timer(timer)
        GenServer.reply(from, {:ok, msg})
        %{state | waiters: rest}

      [] ->
        %{state | queue: :queue.in(msg, state.queue)}
    end
  end

  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  defp jwt_secret do
    Application.get_env(:callsafe_signaling, :jwt_secret, "test_secret_for_e2e")
  end
end
