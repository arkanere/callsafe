import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../storage/call_history_entry.dart';
import 'call_providers.dart';

/// Call history list provider
/// Fetches and watches call history from storage
final callHistoryListProvider =
    FutureProvider<List<CallHistoryEntry>>((ref) async {
  final service = ref.watch(callHistoryServiceProvider);
  final result = await service.getAllCalls().run();
  return result.fold(
    (error) => throw Exception(error),
    (entries) => entries,
  );
});

/// Call count provider
final callHistoryCountProvider = Provider<int>((ref) {
  return ref.watch(callHistoryServiceProvider).callCount;
});
