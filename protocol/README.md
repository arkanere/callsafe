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
- **`protocol.json`** - JSON schema for cross-platform consumption
- **`generate-json.js`** - Script to generate JSON from TypeScript spec
- **`generate-kotlin.js`** - Script to generate Kotlin constants from JSON schema
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

**AUTO-GENERATED** constants at `android-app/app/src/main/java/tech/callsafe/business/protocol/Protocol.kt`

```kotlin
import tech.callsafe.business.protocol.Protocol

// Use message type constants
socket.emit(Protocol.MessageTypes.DEVICE_CONNECT, JSONObject().apply {
    put("type", Protocol.MessageTypes.DEVICE_CONNECT)
    put("deviceType", Protocol.DeviceType.MOBILE.value)
    put("deviceId", deviceId)
    put("protocolVersion", Protocol.VERSION)
})

// Use enums for type safety
put("status", Protocol.DeviceStatus.AVAILABLE.value)
put("callType", Protocol.CallType.VOICE.value)
```

To regenerate Kotlin constants after protocol changes:
```bash
cd protocol
node generate-kotlin.js
```

See `android-app/PROTOCOL.md` for complete usage guide.

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
6. Run `node generate-kotlin.js` to regenerate Android constants
7. Update this README with the new message

## Validation

All messages are validated against their schemas:

- **Required fields** - Must be present in payload
- **Optional fields** - May be omitted
- **Field validators** - Check value format (UUID, enum values, etc.)

Validation occurs on the signaling server for all incoming messages. During Phase 1, violations are logged but not rejected.

## Migration Strategy

**Phase 1: Protocol Specification Creation** ✓
- Protocol specification created in TypeScript
- JSON schema generated for cross-platform use
- Version 1.0.0 defined with 30 message types

**Phase 2: Component Integration** ✓
- Frontend (SvelteKit) uses protocol imports
- Signaling server (Node.js) uses protocol imports
- Protocol version added to connection handshake

**Phase 3: Validation Layer** ✓
- Message validation middleware on signaling server
- All incoming messages validated against schemas
- Violations logged (non-blocking during rollout)

**Phase 4: Android Integration** ✓
- Kotlin constants generated from protocol.json
- Android app uses Protocol.kt instead of magic strings
- Protocol version added to device:connect
- Documentation created for Flutter migration

Future phases:
- **Phase 5**: Flutter mobile app (use same protocol.json)
- **Phase 6**: Elixir signaling server (port validation logic)

## Compatibility

Protocol version 1.0.0 is compatible with:
- **Frontend**: SvelteKit (integrated, using protocol imports)
- **Signaling Server**: Node.js (integrated, with validation middleware)
- **Mobile**: Android Kotlin (integrated, using generated Protocol.kt)
- **Future**: Flutter (will use same protocol.json schema)

Major version increments indicate breaking changes.
Minor version increments add backward-compatible features.
Patch version increments are bug fixes only.

## Platform-Specific Documentation

- **TypeScript/JavaScript**: See usage examples above
- **Android/Kotlin**: See `android-app/PROTOCOL.md`
- **Flutter/Dart**: Will be documented in Phase 5
