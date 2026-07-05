import 'dart:convert';
import 'dart:io';
import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';

/// Thrown when the stored auth token is missing or rejected (expired).
/// The UI should send the user to the login screen.
class NotAuthenticatedException implements Exception {
  final String message;
  const NotAuthenticatedException(this.message);

  @override
  String toString() => 'NotAuthenticatedException: $message';
}

/// Handles business authentication against the CallSafe dashboard:
/// - persistent per-install deviceId (UUIDv4, required by the v2 protocol)
/// - login (email/password -> 24h auth_token, captured from the httpOnly
///   Set-Cookie header; Dart's HttpClient exposes response cookies directly)
/// - short-lived socket token exchange for device:connect
///
/// Tokens are persisted in Hive. Hardening follow-up: move the auth token
/// to flutter_secure_storage.
class AuthService {
  static const _boxName = 'auth';
  static const _deviceIdKey = 'device_id';
  static const _authTokenKey = 'auth_token';
  static const _handleKey = 'handle';

  /// SvelteKit dashboard origin (issues auth + socket tokens).
  final String dashboardBaseUrl;

  Box<String>? _box;

  AuthService(this.dashboardBaseUrl);

  Future<Box<String>> _openBox() async {
    return _box ??= await Hive.openBox<String>(_boxName);
  }

  /// Persistent device id; generated once per install.
  Future<String> getDeviceId() async {
    final box = await _openBox();
    var deviceId = box.get(_deviceIdKey);
    if (deviceId == null) {
      deviceId = const Uuid().v4();
      await box.put(_deviceIdKey, deviceId);
    }
    return deviceId;
  }

  Future<bool> isLoggedIn() async {
    final box = await _openBox();
    return box.get(_authTokenKey) != null;
  }

  /// Business handle captured at login (for display).
  Future<String?> getHandle() async {
    final box = await _openBox();
    return box.get(_handleKey);
  }

  /// POST /api/login and persist the auth_token cookie.
  /// Throws [NotAuthenticatedException] on invalid credentials.
  Future<void> login(String email, String password) async {
    final client = HttpClient();
    try {
      final req = await client.postUrl(Uri.parse('$dashboardBaseUrl/api/login'));
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({'email': email, 'password': password}));
      final resp = await req.close();
      final body = await resp.transform(utf8.decoder).join();

      if (resp.statusCode != 200) {
        String message = 'Login failed (${resp.statusCode})';
        try {
          message = (jsonDecode(body) as Map<String, dynamic>)['error'] as String? ?? message;
        } catch (_) {}
        throw NotAuthenticatedException(message);
      }

      final authCookie = resp.cookies
          .where((c) => c.name == 'auth_token')
          .map((c) => c.value)
          .firstOrNull;
      if (authCookie == null) {
        throw const NotAuthenticatedException('Login response had no auth_token cookie');
      }

      final box = await _openBox();
      await box.put(_authTokenKey, authCookie);

      try {
        final user = (jsonDecode(body) as Map<String, dynamic>)['user'] as Map<String, dynamic>?;
        final handle = user?['handle'] as String?;
        if (handle != null) await box.put(_handleKey, handle);
      } catch (_) {}
    } finally {
      client.close();
    }
  }

  Future<void> logout() async {
    final box = await _openBox();
    await box.delete(_authTokenKey);
  }

  /// Exchange the stored auth token for a short-lived (5 min) socket token.
  /// Called by SignalingClient on every (re)connect.
  /// Throws [NotAuthenticatedException] when not logged in or the auth token
  /// has expired (24h) — the UI should return to the login screen.
  Future<String> fetchSocketToken() async {
    final box = await _openBox();
    final authToken = box.get(_authTokenKey);
    if (authToken == null) {
      throw const NotAuthenticatedException('Not logged in');
    }

    final deviceId = await getDeviceId();
    final client = HttpClient();
    try {
      final uri = Uri.parse('$dashboardBaseUrl/api/socket-token?deviceId=$deviceId');
      final req = await client.getUrl(uri);
      req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $authToken');
      final resp = await req.close();
      final body = await resp.transform(utf8.decoder).join();

      if (resp.statusCode == 401) {
        await box.delete(_authTokenKey);
        throw const NotAuthenticatedException('Session expired, please log in again');
      }
      if (resp.statusCode != 200) {
        throw HttpException('socket-token failed (${resp.statusCode})', uri: uri);
      }

      return (jsonDecode(body) as Map<String, dynamic>)['token'] as String;
    } finally {
      client.close();
    }
  }
}
