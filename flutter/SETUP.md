# Flutter Project Setup Instructions

## Current Status

Phase 1 (Protocol Integration) implementation is complete. All Dart source files have been created with:

- ✅ Protocol constants and message types
- ✅ Protocol enums (CallType, DeviceType, CallState, etc.)
- ✅ Freezed data class definitions
- ✅ Validation layer
- ✅ State transition logic
- ✅ Version negotiation utilities
- ✅ Comprehensive test suite

## Required Next Steps

### 1. Install Flutter SDK

If Flutter is not installed, follow the official installation guide:
- https://docs.flutter.dev/get-started/install

Verify installation:
```bash
flutter --version
```

### 2. Install Dependencies

Navigate to the Flutter project directory and install dependencies:
```bash
cd flutter
flutter pub get
```

### 3. Run Code Generation

Generate Freezed and JSON serialization code:
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

This will generate:
- `*.freezed.dart` files (immutable data classes with copyWith, equality, etc.)
- `*.g.dart` files (JSON serialization/deserialization)

For development with auto-regeneration on file changes:
```bash
flutter pub run build_runner watch --delete-conflicting-outputs
```

### 4. Run Tests

Verify the protocol implementation:
```bash
flutter test
```

All tests should pass, validating:
- Protocol constants
- Enum conversions
- State transitions
- Message validation
- Version negotiation

## Project Structure

```
flutter/
├── lib/
│   ├── src/
│   │   └── protocol/
│   │       ├── constants/
│   │       │   └── protocol_constants.dart
│   │       ├── models/
│   │       │   ├── protocol_enums.dart
│   │       │   ├── protocol_messages.dart  # Freezed classes
│   │       │   └── state_transitions.dart
│   │       ├── validators/
│   │       │   ├── protocol_validators.dart
│   │       │   └── version_negotiation.dart
│   │       └── protocol.dart  # Main export
│   └── callsafe_mobile.dart  # Library export
├── test/
│   └── protocol_test.dart
├── pubspec.yaml
├── build.yaml
└── README.md
```

## Expected Output After Code Generation

After running `build_runner`, you should see:
1. Generated files in `lib/src/protocol/models/`:
   - `protocol_messages.freezed.dart`
   - `protocol_messages.g.dart`

2. Build output indicating successful generation:
   ```
   [INFO] Succeeded after X.Xs with N outputs
   ```

## Troubleshooting

### Build Runner Conflicts

If you encounter conflicts, use:
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

### Dependency Issues

Clean and reinstall:
```bash
flutter clean
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

### Import Errors

Ensure generated files are created. If imports fail:
1. Check that `build_runner` completed successfully
2. Verify `*.freezed.dart` and `*.g.dart` files exist
3. Restart your IDE/editor

## Phase 1 Completion Checklist

- ✅ Project structure created
- ✅ Dependencies configured (pubspec.yaml)
- ✅ Protocol constants implemented
- ✅ Protocol enums implemented
- ✅ Freezed data classes defined
- ✅ Validation layer implemented
- ✅ State transitions implemented
- ✅ Version negotiation implemented
- ✅ Test suite created
- ⏳ Code generation (requires Flutter SDK)
- ⏳ Tests passing (requires code generation)

## Next Phase

Once code generation is complete and tests pass, proceed to **Phase 2: Core Business Logic Layer**.
