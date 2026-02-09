# CallSafe Protocol Integration - Android

Protocol version: `1.0.0`

## Overview

Android app uses type-safe protocol constants generated from `protocol/protocol.json`. All WebSocket communication uses `Protocol.kt` constants instead of magic strings.

## Protocol Constants Location

```
app/src/main/java/tech/callsafe/business/protocol/Protocol.kt
```

**AUTO-GENERATED** - Do not edit manually. Regenerate with:
```bash
cd protocol && node generate-kotlin.js
```

## Usage Patterns

### Message Types

Use `Protocol.MessageTypes` for all socket events:

```kotlin
// CORRECT - Type-safe protocol constant
socket.emit(Protocol.MessageTypes.DEVICE_CONNECT, data)
socket.on(Protocol.MessageTypes.CALL_INCOMING) { args -> ... }

// INCORRECT - Magic strings (deprecated)
socket.emit("device:connect", data)  // ❌ Don't use
```

### Device Types

Use `Protocol.DeviceType` enum:

```kotlin
// CORRECT
put("deviceType", Protocol.DeviceType.MOBILE.value)

// INCORRECT
put("deviceType", "mobile")  // ❌ Don't use
```

### Device Status

Use `Protocol.DeviceStatus` enum:

```kotlin
// CORRECT
put("status", Protocol.DeviceStatus.AVAILABLE.value)
put("status", Protocol.DeviceStatus.UNAVAILABLE.value)

// INCORRECT
put("status", "available")  // ❌ Don't use
```

### Protocol Version Negotiation

**REQUIRED**: Include protocol version in `device:connect` messages:

```kotlin
val deviceConnectEvent = JSONObject().apply {
    put("type", Protocol.MessageTypes.DEVICE_CONNECT)
    put("deviceType", Protocol.DeviceType.MOBILE.value)
    put("deviceId", deviceId)
    put("pushToken", fcmToken)
    put("protocolVersion", Protocol.VERSION)  // ✓ Required
    put("timestamp", System.currentTimeMillis())
}
socket.emit(Protocol.MessageTypes.DEVICE_CONNECT, deviceConnectEvent)
```

Server validates protocol version compatibility (major version must match).

## Complete Message Examples

### Device Registration

```kotlin
val data = JSONObject().apply {
    put("type", Protocol.MessageTypes.DEVICE_CONNECT)
    put("deviceType", Protocol.DeviceType.MOBILE.value)
    put("deviceId", getUniqueDeviceId(context))
    put("pushToken", fcmToken)
    put("protocolVersion", Protocol.VERSION)
    put("timestamp", System.currentTimeMillis())
}
socket.emit(Protocol.MessageTypes.DEVICE_CONNECT, data)
```

### Device Status Update

```kotlin
val data = JSONObject().apply {
    put("deviceId", deviceId)
    put("status", Protocol.DeviceStatus.AVAILABLE.value)
    put("timestamp", System.currentTimeMillis())
}
socket.emit(Protocol.MessageTypes.DEVICE_STATUS, data)
```

### Accept Call

```kotlin
val data = JSONObject().apply {
    put("callAttemptId", callAttemptId)
    put("deviceType", Protocol.DeviceType.MOBILE.value)
    put("deviceId", deviceId)
    put("timestamp", System.currentTimeMillis())
}
socket.emit(Protocol.MessageTypes.CALL_ACCEPT, data)
```

### Reject Call

```kotlin
val data = JSONObject().apply {
    put("callAttemptId", callAttemptId)
    put("deviceType", Protocol.DeviceType.MOBILE.value)
    put("reason", "user_declined")
    put("timestamp", System.currentTimeMillis())
}
socket.emit(Protocol.MessageTypes.CALL_REJECT, data)
```

### End Call

```kotlin
val data = JSONObject().apply {
    put("callAttemptId", callAttemptId)
    put("initiator", Protocol.CallInitiator.BUSINESS.value)
    put("reason", Protocol.CallEndReason.NORMAL.value)
    put("timestamp", System.currentTimeMillis())
}
socket.emit(Protocol.MessageTypes.CALL_END, data)
```

### WebRTC Answer

```kotlin
val data = JSONObject().apply {
    put("callAttemptId", callAttemptId)
    put("answer", JSONObject().apply {
        put("type", "answer")
        put("sdp", sessionDescription.description)
    })
    put("timestamp", System.currentTimeMillis())
}
socket.emit(Protocol.MessageTypes.WEBRTC_ANSWER, data)
```

### WebRTC ICE Candidate

```kotlin
val data = JSONObject().apply {
    put("callAttemptId", callAttemptId)
    put("candidate", JSONObject().apply {
        put("candidate", iceCandidate.sdp)
        put("sdpMLineIndex", iceCandidate.sdpMLineIndex)
        put("sdpMid", iceCandidate.sdpMid)
    })
    put("timestamp", System.currentTimeMillis())
}
socket.emit(Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE, data)
```

## Event Handlers

### Incoming Call

```kotlin
socket.on(Protocol.MessageTypes.CALL_INCOMING) { args ->
    val data = args[0] as JSONObject
    val callAttemptId = data.getString("callAttemptId")
    val sourceId = data.getString("sourceId")
    val timestamp = data.getLong("timestamp")
    handleIncomingCall(callAttemptId, sourceId, timestamp)
}
```

### Call Cancelled

```kotlin
socket.on(Protocol.MessageTypes.CALL_CANCELLED) { args ->
    val data = args[0] as JSONObject
    val callAttemptId = data.getString("callAttemptId")
    val reason = data.getString("reason")
    handleCallCancelled(callAttemptId, reason)
}
```

### Call Ended

```kotlin
socket.on(Protocol.MessageTypes.CALL_ENDED) { args ->
    val data = args[0] as JSONObject
    val callAttemptId = data.getString("callAttemptId")
    val duration = data.getInt("duration")
    val reason = data.optString("reason")
    handleCallEnded(callAttemptId, duration, reason)
}
```

### WebRTC Offer

```kotlin
socket.on(Protocol.MessageTypes.WEBRTC_OFFER) { args ->
    val data = args[0] as JSONObject
    val callAttemptId = data.getString("callAttemptId")
    val offerObject = data.getJSONObject("offer")
    val sdp = offerObject.getString("sdp")
    val type = offerObject.getString("type")
    handleWebRTCOffer(callAttemptId, sdp, type)
}
```

### WebRTC ICE Candidate

```kotlin
socket.on(Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE) { args ->
    val data = args[0] as JSONObject
    val callAttemptId = data.getString("callAttemptId")
    val candidateObject = data.getJSONObject("candidate")
    val candidate = candidateObject.getString("candidate")
    val sdpMLineIndex = candidateObject.getInt("sdpMLineIndex")
    val sdpMid = candidateObject.getString("sdpMid")
    handleWebRTCIceCandidate(callAttemptId, candidate, sdpMLineIndex, sdpMid)
}
```

## Available Enums

### Protocol.CallType
- `VOICE` - Voice-only call
- `VIDEO` - Video call

### Protocol.DeviceType
- `WEB` - Web client (embed or dashboard)
- `MOBILE` - Mobile app (Android/iOS)

### Protocol.DeviceStatus
- `AVAILABLE` - Device ready to receive calls
- `UNAVAILABLE` - Device not accepting calls

### Protocol.CallState
- `INITIATED`, `RINGING`, `CONNECTING`, `CONNECTED`
- `ENDED`, `FAILED`, `CANCELLED`
- `BUSY`, `UNAVAILABLE`, `TIMEOUT`
- Video states: `CAMERA_PERMISSION_DENIED`, `VIDEO_PAUSED_BY_USER`, `VIDEO_PAUSED_BANDWIDTH`, `ESCALATION_PENDING`

### Protocol.CallEndReason
- `NORMAL` - Normal call termination
- `CUSTOMER_HANGUP` - Customer ended call
- `BUSINESS_HANGUP` - Business ended call
- `CONNECTION_FAILED` - WebRTC connection failed
- `TIMEOUT` - Call timed out
- `REJECTED` - Call was rejected

### Protocol.CallInitiator
- `CUSTOMER` - Call initiated by customer
- `BUSINESS` - Call initiated by business

### Protocol.MediaTrackType
- `AUDIO` - Audio track
- `VIDEO` - Video track

### Protocol.MediaToggleAction
- `ENABLE_CAMERA`, `DISABLE_CAMERA`
- `ENABLE_MICROPHONE`, `DISABLE_MICROPHONE`
- `FLIP_CAMERA`

## Migration from Magic Strings

Old constants in `Constants.kt` are deprecated but maintained for backwards compatibility:

```kotlin
// OLD (deprecated)
Constants.DEVICE_CONNECT  // ⚠️ Use Protocol.MessageTypes.DEVICE_CONNECT

// NEW (recommended)
Protocol.MessageTypes.DEVICE_CONNECT  // ✓
```

IDE will show deprecation warnings with automatic replacements.

## Protocol Validation

Server validates all incoming messages against protocol schemas:
- Required fields must be present
- Field types must match schema
- Protocol version must be compatible (same major version)

Validation violations are logged but non-blocking during initial rollout phase.

## Flutter Migration Notes

Flutter app will:
1. Use same `protocol.json` schema
2. Generate Dart constants (similar to Kotlin generation)
3. Follow identical message structure and validation
4. Use same protocol version negotiation

Maintain protocol compatibility during Flutter transition by:
- Not changing message structure
- Using semantic versioning for protocol changes
- Testing both Android and Flutter with same backend
