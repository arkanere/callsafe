# CallSafe Mobile

Flutter-based mobile application for CallSafe supporting Android and iOS from a single codebase.

## Project Structure

```
lib/
├── src/
│   └── protocol/          # Protocol specification (Phase 1)
│       ├── constants/     # Message type constants
│       ├── models/        # Freezed data classes and enums
│       └── validators/    # Validation logic
└── callsafe_mobile.dart   # Main library export
```

## Phase 1: Protocol Integration ✅

Phase 1 implements the protocol specification in pure Dart:

- ✅ Protocol constants (message types)
- ✅ Protocol enums (CallType, DeviceType, CallState, etc.)
- ✅ Freezed data classes for immutable messages
- ✅ Validation layer
- ✅ State transition logic
- ✅ Version negotiation

## Setup

### Prerequisites

- Flutter SDK 3.0.0 or higher
- Dart SDK 3.0.0 or higher

### Installation

1. Install dependencies:
   ```bash
   flutter pub get
   ```

2. Generate code (Freezed, JSON serialization):
   ```bash
   flutter pub run build_runner build --delete-conflicting-outputs
   ```

### Development

To watch for changes and regenerate code automatically:
```bash
flutter pub run build_runner watch --delete-conflicting-outputs
```

## Protocol Specification

The protocol is defined in `lib/src/protocol/` and matches the TypeScript specification in `/protocol/index.ts`. All message types, enums, and validation rules are consistent across platforms.

### Protocol Version

Current version: **1.0.0**

## Next Steps

- **Phase 2**: Core Business Logic Layer (signaling, call manager)
- **Phase 3**: Native Integration (Android/iOS WebRTC)
- **Phase 4**: UI Layer and Production Release
