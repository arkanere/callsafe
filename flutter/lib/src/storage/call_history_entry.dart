import 'package:hive/hive.dart';
import '../protocol/protocol.dart';

part 'call_history_entry.g.dart';

/// Call history entry for persistence
/// Simplified version of CallSession storing only display data
@HiveType(typeId: 0)
class CallHistoryEntry extends HiveObject {
  @HiveField(0)
  final String callAttemptId;

  @HiveField(1)
  final String handle;

  @HiveField(2)
  final String callType; // 'voice' | 'video'

  @HiveField(3)
  final String state; // final call state

  @HiveField(4)
  final DateTime startTime;

  @HiveField(5)
  final DateTime? endTime;

  @HiveField(6)
  final int? durationSeconds;

  @HiveField(7)
  final String? endReason;

  @HiveField(8)
  final bool isIncoming;

  CallHistoryEntry({
    required this.callAttemptId,
    required this.handle,
    required this.callType,
    required this.state,
    required this.startTime,
    this.endTime,
    this.durationSeconds,
    this.endReason,
    required this.isIncoming,
  });

  /// Create from CallSession
  factory CallHistoryEntry.fromCallSession({
    required String callAttemptId,
    required String handle,
    required CallType type,
    required CallState state,
    required DateTime startTime,
    DateTime? endTime,
    Duration? duration,
    CallEndReason? endReason,
    required bool isIncoming,
  }) {
    return CallHistoryEntry(
      callAttemptId: callAttemptId,
      handle: handle,
      callType: type.value,
      state: state.value,
      startTime: startTime,
      endTime: endTime,
      durationSeconds: duration?.inSeconds,
      endReason: endReason?.value,
      isIncoming: isIncoming,
    );
  }

  /// Parsed call type
  CallType get callTypeEnum => CallType.fromString(callType);

  /// Parsed call state
  CallState get stateEnum => CallState.fromString(state);

  /// Parsed end reason
  CallEndReason? get endReasonEnum =>
      endReason != null ? CallEndReason.fromString(endReason!) : null;

  /// Duration as Duration object
  Duration? get duration =>
      durationSeconds != null ? Duration(seconds: durationSeconds!) : null;

  /// Was call successful
  bool get wasSuccessful => stateEnum == CallState.connected;

  /// Display duration string (mm:ss format)
  String get durationDisplay {
    if (duration == null) return '--:--';
    final minutes = duration!.inMinutes;
    final seconds = duration!.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  /// Display time string (relative or absolute)
  String get timeDisplay {
    final now = DateTime.now();
    final diff = now.difference(startTime);

    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';

    // Absolute date
    return '${startTime.month}/${startTime.day}/${startTime.year}';
  }
}
