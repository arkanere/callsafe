# Phase 4: Cross-Platform Validation

Integration tests verifying Flutter business logic works seamlessly with both Android and iOS native implementations.

## Test Structure

### 1. Contract Compliance Tests (`cross_platform_validation_test.dart`)
Verifies identical inputs produce identical outputs across platforms.

**Coverage:**
- WebRTC platform contract (initializePeerConnection, createOffer, createAnswer, ICE candidates)
- Push platform contract (permissions, tokens, notifications)
- Audio platform contract (session config, speaker mode, ringtone)
- Data serialization consistency (RTCSessionDescriptionInit, RTCIceCandidate, MediaCapabilities)

**Run:**
```bash
flutter test test/integration/cross_platform_validation_test.dart
```

### 2. Signaling Round-Trip Tests (`signaling_roundtrip_test.dart`)
Verifies complete call flows from initiation to WebRTC connection.

**Coverage:**
- Outgoing call flow: initiate → offer → answer → connected
- Incoming call flow: incoming → accept → connected
- Call rejection flows: busy, timeout, cancelled
- Call end flows: normal termination
- ICE candidate exchange
- State transitions

**Run:**
```bash
flutter test test/integration/signaling_roundtrip_test.dart
```

### 3. Platform Compliance Tests (`platform_compliance_test.dart`)
Verifies actual native implementations on real devices.

**Coverage:**
- Sequential and concurrent peer connections
- Valid SDP offer/answer generation
- ICE candidate handling
- Media capabilities reporting
- Audio/video controls
- Resource cleanup
- Error handling
- Performance benchmarks

**Run on Android:**
```bash
flutter test --device-id=<android-device-id> test/integration/platform_compliance_test.dart
```

**Run on iOS:**
```bash
flutter test --device-id=<ios-device-id> test/integration/platform_compliance_test.dart
```

## Running All Tests

```bash
# Run all integration tests
flutter test test/integration/

# Run with verbose output
flutter test --verbose test/integration/

# Run specific test group
flutter test test/integration/ --name="WebRTC"
```

## Device Testing Checklist

### Android Device Testing

1. **Prerequisites**
   - Physical Android device or emulator running
   - USB debugging enabled
   - Device connected: `flutter devices`

2. **Test Execution**
   ```bash
   # Get device ID
   flutter devices

   # Run compliance tests
   flutter test --device-id=<device-id> test/integration/platform_compliance_test.dart
   ```

3. **Verification Points**
   - [ ] WebRTC peer connection initializes
   - [ ] SDP offer/answer generated with valid format
   - [ ] ICE candidates added without errors
   - [ ] Media capabilities reported correctly
   - [ ] Audio controls (mute, speaker) function
   - [ ] Permissions requested properly
   - [ ] Resources cleaned up on connection close
   - [ ] No memory leaks during rapid connect/disconnect

4. **Manual Testing**
   - [ ] Real call between two Android devices
   - [ ] Audio quality acceptable
   - [ ] FCM push notifications received
   - [ ] Background call handling works
   - [ ] CallKit/notification UI appears

### iOS Device Testing

1. **Prerequisites**
   - Physical iOS device or simulator
   - Development certificate configured
   - Device connected: `flutter devices`

2. **Test Execution**
   ```bash
   # Get device ID
   flutter devices

   # Run compliance tests
   flutter test --device-id=<device-id> test/integration/platform_compliance_test.dart
   ```

3. **Verification Points**
   - [ ] WebRTC peer connection initializes
   - [ ] SDP offer/answer generated with valid format
   - [ ] ICE candidates added without errors
   - [ ] Media capabilities reported correctly
   - [ ] Audio session configured for VoIP
   - [ ] CallKit integration functional
   - [ ] APNs permissions requested
   - [ ] Resources cleaned up on connection close
   - [ ] No crashes during rapid operations

4. **Manual Testing**
   - [ ] Real call between two iOS devices
   - [ ] Audio quality acceptable
   - [ ] APNs push notifications received
   - [ ] CallKit UI appears for incoming calls
   - [ ] Background mode handles calls
   - [ ] Proximity sensor controls screen

### Cross-Platform Testing

1. **Android ↔ iOS Call**
   - [ ] Android can call iOS
   - [ ] iOS can call Android
   - [ ] Audio bidirectional
   - [ ] ICE candidates exchanged
   - [ ] Call end handled on both sides

2. **Protocol Consistency**
   - [ ] Same message types sent from both platforms
   - [ ] Same payload structure in messages
   - [ ] Compatible SDP formats
   - [ ] ICE candidate formats compatible

3. **Performance Benchmarks**
   - [ ] Connection establishment < 3s
   - [ ] Offer creation < 2s
   - [ ] Answer creation < 2s
   - [ ] ICE gathering < 5s
   - [ ] End-to-end latency < 500ms

## Validation Results

### Android Results
| Test | Status | Notes |
|------|--------|-------|
| Contract Compliance | ⏳ Pending | |
| Signaling Round-Trip | ⏳ Pending | |
| Platform Compliance | ⏳ Pending | |
| Manual Device Test | ⏳ Pending | |

### iOS Results
| Test | Status | Notes |
|------|--------|-------|
| Contract Compliance | ⏳ Pending | |
| Signaling Round-Trip | ⏳ Pending | |
| Platform Compliance | ⏳ Pending | |
| Manual Device Test | ⏳ Pending | |

### Cross-Platform Results
| Test | Status | Notes |
|------|--------|-------|
| Android → iOS Call | ⏳ Pending | |
| iOS → Android Call | ⏳ Pending | |
| Protocol Consistency | ⏳ Pending | |
| Performance Benchmarks | ⏳ Pending | |

## Troubleshooting

### Common Issues

**Test fails with "PlatformException"**
- Ensure device is properly connected
- Check platform channel handlers are registered
- Verify native code compiled successfully

**SDP validation fails**
- Check WebRTC SDK version on native side
- Ensure audio/video permissions granted
- Verify network connectivity

**ICE candidates not exchanged**
- Check STUN/TURN server configuration
- Verify signaling connection established
- Check firewall/NAT settings

**Performance tests timeout**
- Use physical device, not simulator (simulators are slower)
- Close background apps
- Check device not in low-power mode

### Debugging Tips

1. **Enable verbose logging**
   ```bash
   flutter test --verbose test/integration/
   ```

2. **Check native logs**
   ```bash
   # Android
   adb logcat | grep CallSafe

   # iOS
   # View Xcode console
   ```

3. **Inspect platform channel traffic**
   - Add breakpoints in native channel handlers
   - Log all method calls and arguments
   - Verify payload serialization

## Success Criteria

Phase 4 is complete when:

- [x] All contract compliance tests pass
- [ ] All signaling round-trip tests pass
- [ ] Platform compliance tests pass on Android device
- [ ] Platform compliance tests pass on iOS device
- [ ] Manual cross-platform call successful
- [ ] Performance benchmarks meet targets
- [ ] No memory leaks detected
- [ ] Error handling covers edge cases

## Next Steps

After Phase 4 validation completes, proceed to:
- Phase 5: UI Layer implementation
- Production readiness checklist
- App store submission preparation
