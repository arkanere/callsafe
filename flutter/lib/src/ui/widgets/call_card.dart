import 'package:flutter/material.dart';
import '../../protocol/protocol.dart';
import '../../storage/call_history_entry.dart';
import 'avatar_widget.dart';

/// Call card widget for displaying call history items
/// Pure transformation of CallHistoryEntry to widget
class CallCard extends StatelessWidget {
  final CallHistoryEntry entry;
  final VoidCallback? onTap;

  const CallCard({
    super.key,
    required this.entry,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              // Call type icon
              _CallTypeIcon(
                callType: entry.callTypeEnum,
                isIncoming: entry.isIncoming,
                wasSuccessful: entry.wasSuccessful,
              ),
              const SizedBox(width: 16),
              // Call info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.handle,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Text(
                          entry.isIncoming ? 'Incoming' : 'Outgoing',
                          style: TextStyle(
                            color: Colors.grey[400],
                            fontSize: 14,
                          ),
                        ),
                        if (entry.duration != null) ...[
                          Text(
                            ' • ',
                            style: TextStyle(
                              color: Colors.grey[400],
                              fontSize: 14,
                            ),
                          ),
                          Text(
                            entry.durationDisplay,
                            style: TextStyle(
                              color: Colors.grey[400],
                              fontSize: 14,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              // Timestamp
              Text(
                entry.timeDisplay,
                style: TextStyle(
                  color: Colors.grey[500],
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Call type icon indicator
class _CallTypeIcon extends StatelessWidget {
  final CallType callType;
  final bool isIncoming;
  final bool wasSuccessful;

  const _CallTypeIcon({
    required this.callType,
    required this.isIncoming,
    required this.wasSuccessful,
  });

  @override
  Widget build(BuildContext context) {
    final IconData icon;
    final Color color;

    if (callType == CallType.video) {
      icon = Icons.videocam;
    } else {
      icon = isIncoming ? Icons.call_received : Icons.call_made;
    }

    if (!wasSuccessful) {
      color = Colors.red;
    } else {
      color = isIncoming ? Colors.green : Colors.blue;
    }

    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withOpacity(0.15),
      ),
      child: Icon(
        icon,
        color: color,
        size: 24,
      ),
    );
  }
}
