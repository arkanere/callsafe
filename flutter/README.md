# CallSafe Mobile

Flutter app (Android and iOS from a single codebase) for the business side
of [CallSafe](../README.md): it receives incoming customer calls — including
waking from a killed state via FCM — and handles voice/video calls over
WebRTC.

System design: [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
Wire protocol (v2.0.0): [`../protocol/README.md`](../protocol/README.md).
Build/setup details: [`SETUP.md`](SETUP.md).

## Structure

```
lib/src/
├── protocol/     # Generated + hand-written protocol layer (v2 conformant)
├── signaling/    # WebSocket client (JWT auth, heartbeat, reconnect)
├── call/         # Call manager: state, lifecycle, reconnect
├── platform/     # Method channels to native (WebRTC, audio, call, push)
├── auth/         # Token handling
└── ui/           # Riverpod providers + screens

android/…/kotlin/com/callsafe/mobile/
├── fcm/          # FCM wake: data message → full-screen intent notification
├── call/         # Foreground call service, ConnectionService
└── channels/     # Method-channel handlers (WebRTC, audio, push)
```

Dart owns signaling and call state; platform channels bridge to native
Kotlin/Swift for WebRTC media, audio routing, and the incoming-call UX.

## Development

Requires Flutter SDK 3.x (Dart ≥ 3.0).

```sh
flutter pub get
dart run build_runner build --delete-conflicting-outputs   # Freezed/JSON codegen
flutter test
flutter run
```

Protocol constants and enums under `lib/src/protocol/` are generated from
[`../protocol/protocol.json`](../protocol/protocol.json) — never edit them
by hand; run the generators in `../protocol/` instead.
