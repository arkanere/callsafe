# CallSafe WebRTC Signaling Protocol

Version: **2.0.0**

This directory contains the specification for all WebSocket communication
between CallSafe clients (web embed, web dashboard, mobile apps) and the
signaling server.

The protocol is **normative**: the server and every client must conform to it.
[`protocol.json`](./protocol.json) is the machine-readable source of truth
(message schemas, enums, state machine); this README is its human-readable
companion (transport, auth, routing, flows).

## Canonical source & code generation

`protocol.json` is the **only hand-edited file**. Everything else is derived:

```
protocol.json  ──generate-ts.js──────▶  index.ts                 (TypeScript, @callsafe/protocol)
               ──generate-kotlin.js──▶  Protocol.kt              (Kotlin, flutter/android)
               ──generate-dart.js────▶  protocol_constants.dart
                                        + protocol_enums.dart    (Dart, flutter/lib)
               ──generate-swift.js───▶  Protocol.swift           (Swift, flutter/ios)
```

- **Never edit the generated files by hand** — they are overwritten by
  the generators.
- To change the protocol: edit `protocol.json`, then run `npm run generate`
  (or `generate-ts` / `generate-kotlin` / `generate-dart` / `generate-swift`
  individually).
- The Elixir signaling server consumes `protocol.json` directly for its
  validator, message metadata, and state-machine data.

## Transport & framing

- **Raw WebSocket**, text frames only. Each protocol message is a single frame
  containing one JSON object with a required string field `"type"`; all other
  payload fields are **flat siblings** of `type`:

  ```json
  {"type": "call:accept", "callAttemptId": "…", "timestamp": 1720000000000}
  ```

- **Heartbeat** is application-level: clients send `{"type":"ping"}` every
  **25 s**; the server replies `{"type":"pong"}` immediately. The server closes
  any connection that has produced no frames for **60 s**.
- **Timestamps** are milliseconds since the Unix epoch (UTC). **Durations**
  are milliseconds.
- WebSocket `open`/`close` are **transport events, not protocol messages**.
  (v1 listed `connect`/`disconnect` pseudo-messages — dropped in v2.)

## Authentication

Scheme: **JWT, HS256**, carried in the `token` field of `device:connect`.

### Claims

| Claim | Type | Meaning |
|---|---|---|
| `device_id` | string | MUST equal the `deviceId` sent in `device:connect` (mismatch ⇒ error `device_mismatch`) |
| `business_id` | string | The business this connection belongs to (for customers: the business being called, resolved from the widget handle at token issuance) |
| `role` | string | `customer` or `business` |
| `iat` | integer | Issued-at, seconds since epoch |
| `exp` | integer | Expiry, seconds since epoch |

### Token acquisition

- **Business devices**: an authenticated dashboard/mobile session exchanges its
  login session for a socket token over HTTPS (e.g. `GET /api/socket-token`).
- **Customers (embed widget)**: the widget fetches a short-lived **guest
  token** scoped to the business handle over HTTPS
  (e.g. `GET /api/v1/guest-token?handle=<handle>`). No login required;
  issuance is rate-limited per IP. The customer then performs the same
  `device:connect` handshake as business devices — one uniform connection
  lifecycle for all roles.

### Rules

1. `device:connect` MUST be the first protocol message on a connection
   (`ping` is also permitted pre-auth).
2. Any other message before a successful `device:connect` ⇒ error
   `not_authenticated`.
3. The server derives `deviceId`, `businessId` and `role` from the **verified
   token**, never from later message payloads. (This is why v2 removed
   identity fields like `deviceId`, `deviceType`, `initiator` and
   `requestedBy` from client-to-server payloads.)

## Connection lifecycle & reconnection

1. Client opens the WebSocket and sends `device:connect` with `deviceType`,
   `deviceId`, `token`, and `protocolVersion` (all required; mobile devices may
   add `pushToken` for FCM).
2. The server validates the token, checks `deviceId == token.device_id`, and
   checks the protocol **major version** matches (mismatch ⇒ error
   `protocol_incompatible`). On success it replies `device:connected` with the
   negotiated `protocolVersion` and the connection's `role`.
3. Devices register as **available** by default; business devices may change
   availability with `device:status` (confirmed via `device:status-updated`).
4. **Supersession**: a `device:connect` with a `deviceId` that already has a
   live connection supersedes the old connection — the old socket is replaced.
5. **Explicit unregister** (logout): the client sends `device:disconnect`
   (no fields; identity comes from the connection), the server confirms with
   `device:disconnected`, then the client may close the socket.
6. **Implicit disconnect** (socket loss): mobile devices persist in the
   registry so they remain reachable via FCM push; web devices are removed.
7. **Mid-call reconnection**: if a participant's socket drops while its call is
   in `connecting`/`connected`/`escalation_pending`, the server holds the call
   for `reconnect_grace` (30 s). The client re-authenticates with
   `device:connect`, then sends `call:reconnect`; the server re-binds signaling
   delivery to the new connection and replies `call:reconnected` with the
   current `callState` and `callType`. If the grace period expires, the call
   transitions to `failed` and the surviving participant receives
   `call:failed` (reason `peer_disconnected`).

## Message routing (server → client audiences)

Every server-to-client message has a defined audience (the `audience` field in
`protocol.json`):

| Message | Audience |
|---|---|
| `pong` | Sender of the ping |
| `error` | The connection whose message caused the error |
| `server:shutdown` | All connected devices (broadcast) |
| `device:connected` | Sender |
| `device:disconnected` | Sender |
| `device:status-updated` | Sender |
| `call:initiated` | Caller |
| `call:incoming` | Every available business device (WebSocket if connected; FCM data push for offline mobile devices). Mobile devices with a push token receive **both** the WebSocket delivery and the FCM data push — a backgrounded app's socket may be half-open without the server knowing. Also re-delivered to a business device that connects while the call is still ringing. |
| `call:cancelled` | reason `cancelled_by_caller`: all ringing devices and the caller (as ack); reason `answered_elsewhere`: every ringing device except the accepting one |
| `call:accepted` | Caller and accepting device |
| `call:unavailable` | Caller |
| `call:busy` | Caller |
| `call:ended` | Both participants (the ender receives it as ack) |
| `call:failed` | Both participants (or the caller, if the call had no callee yet) |
| `call:timeout` | phase `ringing`: caller and all ringing devices; phase `connecting`: both participants |
| `call:reconnected` | Sender |
| `webrtc:offer` | The other participant |
| `webrtc:answer` | The other participant |
| `webrtc:ice-candidate` | The other participant |
| `media:toggle` | The other participant |
| `escalation:requested` | The other participant |
| `escalation:accepted` | Both participants |
| `escalation:rejected` | The requester |
| `call:downgraded` | Both participants |

## Key semantics

- The server runs **one authoritative state machine per call**, keyed by the
  client-generated **UUIDv4 `callAttemptId`** (reuse ⇒ error
  `duplicate_call_id`). Clients never see states directly; they infer progress
  from messages.
- **The caller is the offerer.** Initial negotiation: the caller sends
  `webrtc:offer` after receiving `call:accepted`. Renegotiation
  (escalation/downgrade): only the participant whose request was granted
  offers. This rule prevents glare.
- Relaying the first `webrtc:answer` moves the call to `connected`.
- The server relays `offer`/`answer`/`candidate` payloads **verbatim** — they
  mirror the W3C `RTCSessionDescriptionInit` / `RTCIceCandidateInit` shapes,
  so clients pass their native objects through unchanged. An empty-string
  `candidate` signals end-of-candidates. Clients MUST buffer candidates that
  arrive before the remote description is set, and tolerate duplicates.
- **Clients MUST tolerate duplicate ring delivery**: the same `call:incoming`
  `callAttemptId` may arrive more than once (WebSocket + FCM dual-path, or
  re-delivery on reconnect). A device already handling that call ignores the
  duplicate.
- **First accept wins**: other ringing devices receive
  `call:cancelled` (reason `answered_elsewhere`). When every notified device
  has rejected, the caller receives `call:unavailable`
  (reason `all_devices_rejected`) — no per-reject message is sent to the caller.
- `media:toggle` is purely informational (mute, camera off, camera flip); it
  never changes call state. Setup failures are reported with
  `call:failed` (reason `media_permission_denied`).

## Call flows

Below, `C` is the customer (caller), `S` the server, `A`/`B` business devices.

### Happy voice call

```
C                          S                          A            B
|-- call:initiate -------->|
|<- call:initiated --------|-- call:incoming -------->|----------->|
|                          |<------------ call:accept |            |
|<- call:accepted ---------|-- call:accepted -------->|            |
|                          |-- call:cancelled ---------------------|  (answered_elsewhere)
|-- webrtc:offer --------->|-- webrtc:offer --------->|
|<- webrtc:answer ---------|<----------- webrtc:answer|     ⇒ connected
|<> webrtc:ice-candidate <>|<> webrtc:ice-candidate <>|  (either direction)
|        … media flows peer-to-peer …                 |
|-- call:end ------------->|
|<- call:ended ------------|-- call:ended ----------->|
```

### Multi-device accept (`answered_elsewhere`)

```
C                          S                          A            B
|-- call:initiate -------->|-- call:incoming -------->|----------->|
|                          |<------------ call:accept |            |
|<- call:accepted ---------|-- call:accepted -------->|            |
|                          |-- call:cancelled(answered_elsewhere) >|
```

### All devices reject → unavailable

```
C                          S                          A            B
|-- call:initiate -------->|-- call:incoming -------->|----------->|
|                          |<------------ call:reject |            |
|                          |<------------------------- call:reject |
|<- call:unavailable ------|   (reason=all_devices_rejected; terminal)
```

### Caller cancels while ringing

```
C                          S                          A            B
|-- call:initiate -------->|-- call:incoming -------->|----------->|
|-- call:cancel ---------->|
|<- call:cancelled --------|-- call:cancelled ------->|----------->|
       (reason=cancelled_by_caller; terminal)
```

### Ring timeout

```
C                          S                          A            B
|-- call:initiate -------->|-- call:incoming -------->|----------->|
|        … ringing_timeout (30 s) expires …           |            |
|<- call:timeout ----------|-- call:timeout --------->|----------->|
       (phase=ringing, timeoutDuration=30000; terminal)
```

### Escalation (voice → video) with renegotiation

Either participant may request; here the customer requests:

```
C                          S                          A
|-- call:escalate -------->|     ⇒ escalation_pending
|                          |-- escalation:requested ->|
|                          |<------- escalation:accept|
|<- escalation:accepted ---|-- escalation:accepted -->|     ⇒ connected, callType=video
|-- webrtc:offer --------->|-- webrtc:offer --------->|  (requester offers)
|<- webrtc:answer ---------|<---------- webrtc:answer |
```

On `escalation:reject` — or after `escalation_timeout` (30 s) — the call
reverts to `connected` as a voice call and the requester receives
`escalation:rejected` (reason `declined` / `timeout` / `unsupported`).

### Downgrade (video → voice)

Unilateral; no peer consent required. Here the business downgrades:

```
C                          S                          A
|                          |<----------- call:downgrade|
|<- call:downgraded -------|-- call:downgraded ------->|     callType=voice
|                          |<------------- webrtc:offer|  (requester offers)
|-- webrtc:answer -------->|-- webrtc:answer --------->|
```

### Mid-call reconnect

```
C                          S                          A
|        … call connected …                           |
|                          |  A's socket drops   ✕ ---|
|                          |  reconnect_grace (30 s) timer starts
|                          |<----------- device:connect|  (new socket)
|                          |-- device:connected ------>|
|                          |<----------- call:reconnect|
|                          |-- call:reconnected ------>|  (callState, callType)
|        … signaling re-bound; ICE restart if needed …
```

If the grace period expires first, the call becomes `failed` and the survivor
receives `call:failed` (reason `peer_disconnected`).

### FCM wake → connect → re-delivered `call:incoming`

Offline mobile business devices stay in the registry and are woken by an FCM
data push:

```
C                          S                          A (mobile, offline)
|-- call:initiate -------->|== FCM data push =========>|  (callAttemptId, sourceId, callType)
|<- call:initiated --------|                           |  app wakes, opens WebSocket
|                          |<------------ device:connect
|                          |-- device:connected ------>|
|                          |-- call:incoming --------->|  (re-delivered: call still ringing)
|                          |<------------- call:accept |
|<- call:accepted ---------|-- call:accepted --------->|
|        … offer/answer/ICE as in the happy path …
```

## State machine

Initial state: `initiated`. Terminal states: `ended`, `failed`, `cancelled`,
`busy`, `unavailable`, `timeout`.

| From | To | Trigger |
|---|---|---|
| `initiated` | `ringing` | `call:incoming` dispatched to at least one device |
| `initiated` | `unavailable` | No available devices for the business |
| `initiated` | `busy` | All available devices engaged in active calls |
| `initiated` | `cancelled` | `call:cancel` from caller |
| `initiated` | `failed` | Internal error |
| `ringing` | `connecting` | `call:accept` from a business device |
| `ringing` | `cancelled` | `call:cancel` from caller |
| `ringing` | `unavailable` | Every notified device sent `call:reject` |
| `ringing` | `timeout` | `ringing_timeout` expired |
| `ringing` | `failed` | Caller disconnected beyond `reconnect_grace`, or internal error |
| `connecting` | `connected` | `webrtc:answer` relayed to the caller |
| `connecting` | `ended` | `call:end` from either participant |
| `connecting` | `timeout` | `connecting_timeout` expired |
| `connecting` | `failed` | `call:failed` from a participant, or participant disconnected beyond `reconnect_grace` |
| `connected` | `ended` | `call:end` from either participant |
| `connected` | `escalation_pending` | `call:escalate` from a participant (voice calls only) |
| `connected` | `failed` | `call:failed` from a participant, or participant disconnected beyond `reconnect_grace` |
| `escalation_pending` | `connected` | `escalation:accept`, `escalation:reject`, or `escalation_timeout` expired |
| `escalation_pending` | `ended` | `call:end` from either participant |
| `escalation_pending` | `failed` | `call:failed` from a participant, or participant disconnected beyond `reconnect_grace` |

## Timers

| Timer | Default | Behavior on expiry |
|---|---|---|
| `ringing_timeout` | 30 s | Call ⇒ `timeout`; `call:timeout` (phase `ringing`) to caller and all ringing devices |
| `connecting_timeout` | 30 s | Call ⇒ `timeout`; `call:timeout` (phase `connecting`) to both participants |
| `escalation_timeout` | 30 s | Call reverts to `connected`; `escalation:rejected` (reason `timeout`) to the requester |
| `reconnect_grace` | 30 s | Call ⇒ `failed` (reason `peer_disconnected`); `call:failed` to the remaining participant |
| `terminal_retention` | 60 s | Call session retained at least this long after reaching a terminal state; call-scoped messages during retention ⇒ error `invalid_state`, after cleanup ⇒ error `call_not_found` |

## Error codes

Errors are reported with
`{type:"error", code, message, relatedType?, callAttemptId?, timestamp}`.
The offending message was **not** processed. `message` is human-readable
detail, not for programmatic use.

| Code | Meaning |
|---|---|
| `invalid_json` | Frame is not valid JSON |
| `invalid_message` | Not a JSON object with a string `type` |
| `validation_error` | Payload failed schema validation |
| `unknown_message_type` | `type` is not a known message |
| `not_authenticated` | Message sent before a successful `device:connect` |
| `auth_failed` | Token invalid (bad signature, malformed, wrong claims) |
| `token_expired` | Token `exp` has passed |
| `device_mismatch` | `deviceId` does not equal the token's `device_id` claim |
| `protocol_incompatible` | Client protocol major version does not match the server's |
| `rate_limited` | Too many requests from this connection/IP |
| `not_authorized` | Sender's role or business scope does not permit this message |
| `call_not_found` | No call with this `callAttemptId` (or already cleaned up) |
| `invalid_state` | Message not valid in the call's current state |
| `not_call_participant` | Sender is not a participant of this call |
| `duplicate_call_id` | `callAttemptId` was already used |
| `peer_not_connected` | The other participant is not reachable |
| `device_not_found` | No such device in the registry |
| `server_error` | Internal server failure |

## Versioning

The protocol uses semver. Clients send their version in `device:connect`
(required); the server rejects a **major**-version mismatch with
`protocol_incompatible` and returns the negotiated version in
`device:connected`.

- **Major**: breaking changes (message/field removals, semantics changes).
- **Minor**: backward-compatible additions (new messages, new optional fields).
- **Patch**: clarifications and fixes with no wire impact.

## Changelog: v1 → v2 (breaking)

1. **`device:connect`**: `token` and `protocolVersion` are now REQUIRED;
   `device:connected` gains `role` and `timestamp`.
2. **`mediaCapabilities`** is formally the array form
   `{canSend: [...], canReceive: [...]}` (the v1 spec's booleans never matched
   reality).
3. **`webrtc:offer`/`webrtc:answer`** formally carry `{type, sdp}` objects
   (v1's Elixir server expected a flat `sdp` string).
4. **Dropped payload fields** (identity now comes from the connection):
   `call:accept.deviceId`/`.deviceType`, `call:reject.deviceType`,
   `call:end.initiator`, `device:status.deviceId`,
   `device:disconnect.deviceId`, `call:escalate.requestedBy`,
   `call:downgrade.requestedBy`, `media:toggle.success`,
   `call:initiate.sourceId`.
5. **New messages**: `ping`, `pong`, `call:initiated` (caller ack — replaces
   the v1 behavior of echoing `call:incoming` to the caller), `call:cancel`,
   `call:reconnect`, `call:reconnected`, `escalation:requested`,
   `escalation:accept`, `escalation:reject`, `call:downgraded`.
   **Removed pseudo-messages**: `open`, `close` (v1 also had
   `connect`/`disconnect` naming drift).
6. **Renames/shape changes**: `call:accepted.acceptingDevice` (DeviceType) →
   `acceptingDeviceId` (string); `call:ended` gains `reason` and `endedBy`;
   `call:timeout` gains `phase` and `timeoutDuration`;
   `call:unavailable.reason` and `call:cancelled.reason` are now enums
   (`cancelled_by_caller` | `answered_elsewhere`); error field `error` →
   `code`.
7. **Enum changes**: `CallInitiator` → `Role`; `CallEndReason` trimmed to
   `normal`/`customer_hangup`/`business_hangup`; new enums `CallFailReason`,
   `CallCancelReason`, `CallUnavailableReason`, `CallBusyReason`,
   `TimeoutPhase`, `EscalationRejectReason`, `ErrorCode`.
8. **Call states**: the v1 per-call video-pause states
   (`video_paused_by_user`, `video_paused_bandwidth`,
   `camera_permission_denied`) were removed — they conflated per-participant
   media state with call state. Pauses are conveyed by `media:toggle`; setup
   failures by `call:failed` (reason `media_permission_denied`).
