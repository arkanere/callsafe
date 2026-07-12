# CallSafe Signaling Server

Elixir/OTP server that powers real-time call signaling for
[CallSafe](../README.md): raw WebSockets over Cowboy/Plug (no Phoenix, no
database), a server-authoritative state machine with one supervised process
per call, ETS-backed presence, ephemeral TURN credentials, and FCM push for
waking offline devices.

Design and failure-mode discussion: [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
Wire protocol: [`../protocol/README.md`](../protocol/README.md).
Production runbook: [`../DEPLOY.md`](../DEPLOY.md).

## Requirements

- Erlang/OTP 27.3+ and Elixir 1.19
- The sibling [`../protocol/`](../protocol/) directory — `protocol.json` is
  read **at compile time** for message schemas, routing metadata, and the
  state machine, so build from a full repo checkout.

## Development

```sh
mix deps.get
mix test          # full suite (~250 tests)
iex -S mix        # run locally; HTTP + WebSocket on :4000
```

Health check: `curl http://localhost:4000/health`. The WebSocket endpoint is
`ws://localhost:4000/ws`.

## Configuration

Runtime configuration comes from environment variables (see the table in
[`../DEPLOY.md`](../DEPLOY.md)) — notably `JWT_SECRET`, which must match the
frontend that signs socket tokens, and the optional `TURN_*` variables.
Authentication and rate-limiting details:
[`lib/callsafe_signaling/auth/README.md`](lib/callsafe_signaling/auth/README.md).

## Code map

| Path (under `lib/callsafe_signaling/`) | Role |
|---|---|
| `application.ex` | Supervision tree |
| `call_session.ex` | Per-call GenServer: state machine, timers, socket monitoring |
| `message_router.ex` | Validation/auth/role gating derived from `protocol.json` |
| `call_handler.ex`, `webrtc_handler.ex` | Call lifecycle + verbatim SDP/ICE relay |
| `device_registry.ex` | ETS presence, O(1) lookup by device and business |
| `fcm/` | FCM HTTP v1 push + OAuth2 token cache |
| `turn/credentials.ex` | Ephemeral TURN credentials (coturn REST) |
| `protocol/` | Compile-time consumption of `protocol.json` |
| `http/` | Cowboy server, HTTP API, middleware (auth, CORS, rate limit) |
