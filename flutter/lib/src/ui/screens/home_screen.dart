import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../protocol/protocol.dart';
import '../providers/call_providers.dart';
import '../providers/permissions_providers.dart';
import '../router/app_router.dart';

/// Home screen - displayed when no call is active
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final callManager = ref.read(callManagerProvider.notifier);
    final audio = ref.read(audioPlatformProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF242424),
        elevation: 0,
        title: const Text(
          'CallSafe',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: const [],
      ),
      body: _buildBody(),
      bottomNavigationBar: BottomNavigationBar(
        backgroundColor: const Color(0xFF242424),
        selectedItemColor: Colors.green,
        unselectedItemColor: Colors.grey[600],
        currentIndex: _selectedIndex,
        onTap: (index) {
          setState(() {
            _selectedIndex = index;
          });
          if (index == 1) {
            context.push(AppRoutes.callHistory);
          }
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.call),
            label: 'Calls',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history),
            label: 'History',
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    final callManager = ref.read(callManagerProvider.notifier);
    final audio = ref.read(audioPlatformProvider);

    return SafeArea(
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.call,
              size: 80,
              color: Colors.white54,
            ),
            const SizedBox(height: 24),
            const Text(
              'CallSafe',
              style: TextStyle(
                color: Colors.white,
                fontSize: 32,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Ready to receive calls',
              style: TextStyle(
                color: Colors.grey[400],
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 48),
            // Test buttons for development
            ElevatedButton(
              onPressed: () async {
                // Request microphone permission before call
                final permissionsService =
                    ref.read(permissionsServiceProvider);
                final granted = await permissionsService
                    .requestMicrophonePermission()
                    .run();

                if (!granted) {
                  if (context.mounted) {
                    _showPermissionDeniedDialog(context, false);
                  }
                  return;
                }

                callManager
                    .initiateCall(
                      handle: 'test-handle',
                      callType: CallType.voice,
                    )
                    .run();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                padding:
                    const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              ),
              child: const Text('Test Outgoing Call'),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                audio.startRinging().run();
                // Simulate incoming call
                // In real app, this comes from signaling server
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                padding:
                    const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              ),
              child: const Text('Test Incoming Call'),
            ),
          ],
        ),
      ),
    );
  }

  void _showPermissionDeniedDialog(BuildContext context, bool isVideo) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Permission Required'),
        content: Text(
          isVideo
              ? 'CallSafe needs access to your microphone and camera to make video calls. Please grant permissions in Settings.'
              : 'CallSafe needs access to your microphone to make calls. Please grant permission in Settings.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              openAppSettings();
            },
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
  }
}
