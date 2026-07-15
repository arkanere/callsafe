# Changelog

Notable changes to CallSafe. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioned releases
will begin once the first tag is cut. The wire protocol is versioned
independently in [`protocol/protocol.json`](protocol/protocol.json)
(currently **2.0.0**).

## [Unreleased]

### Added

- **Protocol v2.0.0** with `protocol.json` as the single canonical source:
  message schemas, enums, error codes, timeouts, and the call state machine,
  with generators for TypeScript, Kotlin, Dart, and Swift. The normative
  spec companion lives in [`protocol/README.md`](protocol/README.md).
- **Android FCM wake flow**: high-priority data-only push wakes a killed
  app; a full-screen intent notification rings like a native call and the
  client reconnects to pick up the pending call.
- **Mid-call reconnect**: call sessions monitor participant sockets and hold
  the call through a reconnect grace period; ICE restart on network change
  across all clients.
- **Video calling** end-to-end (web embed, dashboard, Flutter), including
  in-call voice→video escalation with peer consent and unilateral downgrade.
- **TURN support**: ephemeral coturn REST credentials (HMAC) and static
  provider credentials (e.g. Metered), served to both authenticated apps and
  anonymous embed guests; response aligned to the `RTCIceServer` spec.
- **Embeddable widget** split into a tiny loader stub plus a lazy-loaded
  call core, pointed at the active handle via a relative embed URL.
- Configurable CORS allowlist for the signaling server's HTTP API.
- Deployment runbook ([`DEPLOY.md`](DEPLOY.md)) for the DigitalOcean +
  Caddy + systemd setup, updated for git-based release builds.

### Changed

- Signaling server, web client, and Flutter client conformed to protocol
  v2.0.0 (server-authoritative state machine, app-level ping/pong heartbeat,
  transport events no longer pseudo-messages).
- FCM integration migrated to the HTTP v1 API with OAuth2 bearer tokens and
  a cached token server.
- Repository prepared for open-source: MIT license, secrets documentation,
  internal-only files removed.

### Fixed

- Flutter callee answering a video call: the peer connection is now created
  before `call:accept` is sent (the caller's offer/ICE used to race ahead of
  camera acquisition), remote ICE candidates are buffered until the remote
  description is set, and the callee no longer sends a spurious offer when
  the server acks its accept with `call:accepted`.
- Dart protocol enums now serialize with their canonical wire values
  (`@JsonValue` emitted by the generator); `call:ended` from a web peer no
  longer crashes the Flutter client on `customer_hangup`.
- Prod logger configuration crashing on boot under Elixir 1.19.
- All `svelte-check` errors in the frontend (40 → 0).
- Call video streams now bound through state so they survive re-renders.
- Autoplay failures surfaced to the user across all clients.
