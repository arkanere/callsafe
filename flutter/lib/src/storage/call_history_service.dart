import 'package:hive/hive.dart';
import 'package:fpdart/fpdart.dart';
import 'call_history_entry.dart';
import '../call/call_state.dart';

/// Service for managing call history persistence
/// Pure interface over Hive storage operations
class CallHistoryService {
  static const String _boxName = 'call_history';
  Box<CallHistoryEntry>? _box;

  /// Initialize storage - must be called before use
  TaskEither<String, Unit> initialize() {
    return TaskEither.tryCatch(
      () async {
        _box = await Hive.openBox<CallHistoryEntry>(_boxName);
        return unit;
      },
      (error, _) => 'Failed to initialize call history: $error',
    );
  }

  /// Save call to history
  TaskEither<String, Unit> saveCall(CallSession session) {
    return TaskEither.tryCatch(
      () async {
        if (_box == null) throw StateError('Storage not initialized');
        if (session.startTime == null) {
          throw ArgumentError('Cannot save call without start time');
        }

        final entry = CallHistoryEntry.fromCallSession(
          callAttemptId: session.callAttemptId,
          handle: session.handle,
          type: session.callType,
          state: session.state,
          startTime: session.startTime!,
          endTime: session.endTime,
          duration: session.duration,
          endReason: session.endReason,
          isIncoming: session.sourceId != null,
        );

        await _box!.put(session.callAttemptId, entry);
        return unit;
      },
      (error, _) => 'Failed to save call: $error',
    );
  }

  /// Get all call history entries, sorted by most recent first
  TaskEither<String, List<CallHistoryEntry>> getAllCalls() {
    return TaskEither.tryCatch(
      () async {
        if (_box == null) throw StateError('Storage not initialized');
        final entries = _box!.values.toList();
        // Sort by start time descending (most recent first)
        entries.sort((a, b) => b.startTime.compareTo(a.startTime));
        return entries;
      },
      (error, _) => 'Failed to get call history: $error',
    );
  }

  /// Get call by ID
  TaskEither<String, CallHistoryEntry?> getCall(String callAttemptId) {
    return TaskEither.tryCatch(
      () async {
        if (_box == null) throw StateError('Storage not initialized');
        return _box!.get(callAttemptId);
      },
      (error, _) => 'Failed to get call: $error',
    );
  }

  /// Delete call from history
  TaskEither<String, Unit> deleteCall(String callAttemptId) {
    return TaskEither.tryCatch(
      () async {
        if (_box == null) throw StateError('Storage not initialized');
        await _box!.delete(callAttemptId);
        return unit;
      },
      (error, _) => 'Failed to delete call: $error',
    );
  }

  /// Clear all call history
  TaskEither<String, Unit> clearAllCalls() {
    return TaskEither.tryCatch(
      () async {
        if (_box == null) throw StateError('Storage not initialized');
        await _box!.clear();
        return unit;
      },
      (error, _) => 'Failed to clear call history: $error',
    );
  }

  /// Get call count
  int get callCount => _box?.length ?? 0;

  /// Close storage
  TaskEither<String, Unit> close() {
    return TaskEither.tryCatch(
      () async {
        await _box?.close();
        _box = null;
        return unit;
      },
      (error, _) => 'Failed to close storage: $error',
    );
  }
}
