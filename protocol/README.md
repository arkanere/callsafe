# CallSafe WebRTC Protocol Specification

Version: 1.0.0

This directory contains the formalized protocol specification for all WebSocket communication between CallSafe clients (web embed, web dashboard, mobile apps) and the signaling server.

## Purpose

The protocol specification serves as the single source of truth for:
- Message types and their payloads
- Call states and valid state transitions
- Field validation rules
- Protocol versioning and compatibility

All components (frontend, signaling server, mobile apps) must implement this protocol to ensure compatibility.

## Files

- **`index.ts`** - Main TypeScript protocol specification
- **`protocol.json`** - JSON schema for Android/Kotlin consumption
- **`generate-json.js`** - Script to generate JSON from TypeScript spec
- **`package.json`** - NPM package configuration

## Usage

### TypeScript/JavaScript (Frontend & Signaling Server)

```typescript
import { MessageTypes, CallType, DeviceType, validateMessage } from '@callsafe/protocol';

// Use message type constants
socket.emit(MessageTypes.CALL_INITIATE, {
  callAttemptId: uuid(),
  handle: 'my-business',
  callType: CallType.VOICE,
  mediaCapabilities: {
    canSendAudio: true,
    canSendVideo: false,
    canReceiveAudio: true,
    canReceiveVideo: false,
  },
});

// Validate incoming messages
const result = validateMessage(MessageTypes.CALL_ACCEPT, payload);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

### Kotlin (Android App)

Load the JSON schema at runtime or generate constants:

```kotlin
// Option 1: Parse JSON schema
val protocolJson = assets.open("protocol.json").bufferedReader().use { it.readText() }
val protocol = Json.decodeFromString<Protocol>(protocolJson)

// Option 2: Use generated constants (recommended)
object MessageTypes {
    const val CALL_INITIATE = "call:initiate"
    const val CALL_ACCEPT = "call:accept"
    // ... etc
}
```

## Message Categories

### Call Lifecycle (12 messages)
- `call:initiate`, `call:accept`, `call:reject`, `call:end`, `call:failed`
- `call:incoming`, `call:accepted`, `call:cancelled`, `call:ended`
- `call:busy`, `call:unavailable`, `call:timeout`

### WebRTC Signaling (3 messages)
- `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`

### Device Management (6 messages)
- `device:connect`, `device:disconnect`, `device:status`
- `device:connected`, `device:disconnected`, `device:status-updated`

### Media Control (5 messages) - Video Extension
- `media:toggle`, `call:escalate`, `call:downgrade`
- `escalation:accepted`, `escalation:rejected`

### System (4 messages)
- `connect`, `disconnect`, `error`, `server:shutdown`

## Call States

### Common States (Voice & Video)
- `initiated`, `ringing`, `connecting`, `connected`
- `ended`, `failed`, `cancelled`, `busy`, `unavailable`, `timeout`

### Video-Specific States
- `camera_permission_denied` - Camera access denied by user/system
- `video_paused_by_user` - User manually paused video
- `video_paused_bandwidth` - Video paused due to poor connection
- `escalation_pending` - Waiting for peer to accept video upgrade

## State Transitions

State transitions are validated using the `StateTransitions` map. Use `isValidStateTransition(currentState, nextState)` to check if a transition is allowed.

Example flow for voice call:
```
initiated → ringing → connecting → connected → ended
```

Example flow for video escalation:
```
connected (voice) → escalation_pending → connected (video)
```

## Video Calling Extension

The protocol supports both voice and video calls through the same signaling infrastructure:

1. **Call Type**: Every `call:initiate` includes a `callType` field (`voice` or `video`)
2. **Media Capabilities**: Peers declare what they can send/receive (audio/video)
3. **Mid-Call Changes**: Calls can escalate (voice→video) or downgrade (video→voice)
4. **Media Controls**: Toggle camera, flip camera, mute microphone

## Protocol Versioning

Clients send their protocol version in the `device:connect` message:

```typescript
{
  deviceType: 'web',
  deviceId: 'abc123',
  protocolVersion: '1.0.0'
}
```

The server:
- Stores the version per socket connection
- Validates compatibility (major version must match)
- Uses the lower version for negotiation

## Adding New Message Types

1. Add message constant to appropriate category in `index.ts`
2. Define TypeScript interface for payload
3. Add validation schema to `MessageSchemas`
4. Update `generate-json.js` to include new message
5. Run `npm run generate-json` to update `protocol.json`
6. Update this README with the new message

## Validation

All messages are validated against their schemas:

- **Required fields** - Must be present in payload
- **Optional fields** - May be omitted
- **Field validators** - Check value format (UUID, enum values, etc.)

Validation occurs on the signaling server for all incoming messages. During Phase 1, violations are logged but not rejected.

## Migration Strategy

Phase 1 (Current):
- Protocol specification created
- Magic strings replaced with protocol imports
- Validation logging added (non-blocking)
- Version negotiation implemented

Future phases will use this protocol as the contract for:
- Flutter mobile app (Phase 2)
- Elixir signaling server (Phase 3)

## Compatibility

Protocol version 1.0.0 is compatible with:
- Frontend: SvelteKit (existing)
- Signaling Server: Node.js (existing)
- Mobile: Android Kotlin (existing), Flutter (planned Phase 2)

Major version increments indicate breaking changes.
Minor version increments add backward-compatible features.
Patch version increments are bug fixes only.
