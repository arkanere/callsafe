# Next session: reliable incoming-call notifications on Android

Working notes from the 2026-07-15 mobile debugging session. Delete this file
once the work lands.

## Where we left off

Fixed and verified this session (commits `ef6de73`, `e6a9636`):

- Web → Android **foreground** voice and video calls work end-to-end,
  including hangup from either side.
- Server FCM pipeline restored on prod: `FCM_SERVICE_ACCOUNT_JSON` was
  missing from `/opt/callsafe/env` (and once added, needed `\n` doubled to
  `\\n` because systemd `EnvironmentFile` strips backslashes — the shell
  sourcing in the Makefile does not). Prod droplet redeployed at `1df640b`;
  it had been running a release predating the FCM wake-flow server code.

## The remaining bug (original complaint)

**A backgrounded (or killed) Android app does not ring.** Confirmed diagnosis
from live logs:

1. **Half-open socket race (server).** When Android freezes a backgrounded
   app's WebSocket, the server doesn't notice for a while. An incoming call
   during that window is routed to the dead socket and — because
   `connection_pid` is still set — **FCM is skipped** (`call_handler.ex`,
   `notify_devices/5`). The ring vanishes.
2. **No notification UI for socket-delivered rings (client).** When
   `call:incoming` arrives over the WebSocket while the app is backgrounded,
   nothing is shown. The Dart `showIncomingCallNotification` API exists
   (`push_platform.dart`) but is never called, and the Kotlin
   `PushChannelHandler` never implemented that method.

## Plan

1. **Retest the killed-app path first.** The native FCM → full-screen
   notification flow was never successfully retested after the server fixes
   (the last attempt failed because the device registry was wiped by the
   deploy restart and the phone hadn't re-registered). It may already work.
   Test: open app → wait for `device:connected` → swipe away → call from web.
2. **Server: dual-path ring.** In `notify_devices/5`, for mobile devices with
   a `push_token`, send the FCM data push *in addition to* the WebSocket
   delivery — never trust a mobile socket to be alive. Clients dedupe by
   `callAttemptId` (verify `_handleCallIncoming`'s `hasActiveCall` guard
   handles the duplicate correctly). Note the duplicate-delivery tolerance in
   `protocol/README.md`.
3. **Android: notify when not in foreground.** In
   `CallSafeFirebaseMessagingService.onMessageReceived`, the listener branch
   (engine attached) should *also* post the full-screen notification when no
   activity is resumed. Implement `showIncomingCallNotification` /
   cancel in `PushChannelHandler.kt` and call it from Dart when a ring
   arrives while the app lifecycle is not resumed; cancel it on
   accept/cancel/end/timeout.

## Hygiene / follow-ups (nice to have)

- Device registry is in-memory ETS: a server restart forgets mobile push
  tokens, making killed phones unreachable until the app is next opened.
  Consider persisting mobile registrations.
- Support `FCM_SERVICE_ACCOUNT_FILE` (path) in `token_server.ex` and document
  the systemd backslash gotcha in DEPLOY.md.
- Replace the temporary `[SIG]`/`[RTC]` `print()` debugging (commit
  `e6a9636`) with a debug-flagged logger; restore the generic login error
  message.
- Home screen shows "Ready to receive calls" even while signaling reconnects
  are failing — surface the real connection state.
- `make flutter-apk` doesn't pass `DASHBOARD_BASE_URL`; the debug build for
  prod testing needs:
  `flutter build apk --debug --dart-define=SIGNALING_SERVER_URL=wss://signal.callsafe.tech/ws --dart-define=DASHBOARD_BASE_URL=https://www.callsafe.tech`

## Test-loop cheat sheet

- Phone on USB: `adb logcat -d | grep -E '\[SIG\]|\[FCM\]|CallSafeFirebase'`
- Server: `ssh -i ~/.ssh/callsafe_deploy root@signal.callsafe.tech "journalctl -u callsafe-signaling --since '10 min ago' --no-pager | grep -iE 'fcm|DECISION|device'"`
- After any server restart the phone must reopen the app once to re-register
  its push token before background/killed tests mean anything.
