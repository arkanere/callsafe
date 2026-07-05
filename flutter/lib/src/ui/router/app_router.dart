import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../call/call_state.dart';
import '../../protocol/protocol.dart';
import '../providers/call_providers.dart';
import '../screens/home_screen.dart';
import '../screens/incoming_call_screen.dart';
import '../screens/active_call_screen.dart';
import '../screens/call_history_screen.dart';
import '../screens/login_screen.dart';

/// Route paths
class AppRoutes {
  static const home = '/';
  static const login = '/login';
  static const incomingCall = '/incoming-call';
  static const activeCall = '/active-call';
  static const callHistory = '/history';
}

/// Router provider
final routerProvider = Provider<GoRouter>((ref) {
  final callManager = ref.watch(callManagerProvider);
  final loggedIn = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: AppRoutes.home,
    debugLogDiagnostics: true,
    routes: [
      // Home route
      GoRoute(
        path: AppRoutes.home,
        name: 'home',
        pageBuilder: (context, state) => MaterialPage(
          key: state.pageKey,
          child: const HomeScreen(),
        ),
      ),

      // Login route
      GoRoute(
        path: AppRoutes.login,
        name: 'login',
        pageBuilder: (context, state) => MaterialPage(
          key: state.pageKey,
          child: const LoginScreen(),
        ),
      ),

      // Incoming call route
      GoRoute(
        path: AppRoutes.incomingCall,
        name: 'incoming-call',
        pageBuilder: (context, state) => MaterialPage(
          key: state.pageKey,
          child: const IncomingCallScreen(),
          fullscreenDialog: true,
        ),
      ),

      // Active call route
      GoRoute(
        path: AppRoutes.activeCall,
        name: 'active-call',
        pageBuilder: (context, state) => MaterialPage(
          key: state.pageKey,
          child: const ActiveCallScreen(),
          fullscreenDialog: true,
        ),
      ),

      // Call history route
      GoRoute(
        path: AppRoutes.callHistory,
        name: 'call-history',
        pageBuilder: (context, state) => MaterialPage(
          key: state.pageKey,
          child: const CallHistoryScreen(),
        ),
      ),

    ],
    redirect: (context, state) {
      final currentCall = callManager.currentCall;
      final currentPath = state.uri.path;

      // Not logged in: everything goes to the login screen
      if (loggedIn == false && currentPath != AppRoutes.login) {
        return AppRoutes.login;
      }
      if (loggedIn == true && currentPath == AppRoutes.login) {
        return AppRoutes.home;
      }

      // If there's an incoming call, redirect to incoming call screen
      if (currentCall?.state == CallState.ringing &&
          currentPath != AppRoutes.incomingCall) {
        return AppRoutes.incomingCall;
      }

      // If there's an active call, redirect to active call screen
      if (currentCall?.isActive == true &&
          currentCall?.state != CallState.ringing &&
          currentPath != AppRoutes.activeCall) {
        return AppRoutes.activeCall;
      }

      // If call ended and on call screens, redirect to home
      if (currentCall == null &&
          (currentPath == AppRoutes.incomingCall ||
              currentPath == AppRoutes.activeCall)) {
        return AppRoutes.home;
      }

      // No redirect needed
      return null;
    },
    refreshListenable: _GoRouterRefreshStream(callManager),
  );
});

/// Helper class to make GoRouter reactive to call state changes
class _GoRouterRefreshStream extends ChangeNotifier {
  final CallManagerState _state;

  _GoRouterRefreshStream(this._state);

  CallManagerState get state => _state;
}
