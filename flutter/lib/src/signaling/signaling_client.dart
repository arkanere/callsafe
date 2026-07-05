import 'dart:async';
import 'dart:convert';
import 'package:fpdart/fpdart.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../protocol/protocol.dart';

/// Signaling connection state
enum SignalingState {
  disconnected,
  connecting,
  connected,
  error,
}

/// Signaling error
class SignalingError {
  final String message;
  final String? code;

  const SignalingError(this.message, {this.code});

  @override
  String toString() => 'SignalingError: $message${code != null ? ' (code: $code)' : ''}';
}

const _heartbeatInterval = Duration(seconds: 25);
const _heartbeatTimeout = Duration(seconds: 5);
const _maxReconnectAttempts = 5;
const _baseReconnectDelay = Duration(seconds: 1);

/// Thin WebSocket wrapper for protocol message serialization
/// Pure data transformation — no business logic
class SignalingClient {
  final String serverUrl;

  WebSocketChannel? _channel;
  StreamSubscription? _channelSubscription;

  final _stateController = StreamController<SignalingState>.broadcast();
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();
  final _errorController = StreamController<SignalingError>.broadcast();

  SignalingState _currentState = SignalingState.disconnected;
  bool _intentionallyClosed = false;
  int _reconnectAttempts = 0;

  Timer? _heartbeatTimer;
  Timer? _pongTimer;

  // Stored for reconnection
  DeviceType? _deviceType;
  String? _deviceId;
  String? _pushToken;
  Future<String> Function()? _getToken;

  SignalingClient(this.serverUrl);

  SignalingState get state => _currentState;
  Stream<SignalingState> get stateStream => _stateController.stream;
  Stream<Map<String, dynamic>> get messageStream => _messageController.stream;
  Stream<SignalingError> get errorStream => _errorController.stream;

  /// Connect to signaling server
  /// [getToken] is invoked on every (re)connection attempt so the short-lived
  /// auth token is always fresh.
  Task<Unit> connect({
    required DeviceType deviceType,
    required String deviceId,
    required Future<String> Function() getToken,
    String? pushToken,
  }) {
    return Task(() async {
      if (_currentState == SignalingState.connected) return unit;

      _deviceType = deviceType;
      _deviceId = deviceId;
      _pushToken = pushToken;
      _getToken = getToken;
      _intentionallyClosed = false;

      await _connect();
      return unit;
    });
  }

  Future<void> _connect() async {
    _updateState(SignalingState.connecting);

    try {
      final token = await _getToken!();

      _channel = WebSocketChannel.connect(Uri.parse(serverUrl));
      await _channel!.ready;

      _channelSubscription = _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
      );

      _reconnectAttempts = 0;
      _updateState(SignalingState.connected);
      _startHeartbeat();
      _sendDeviceConnect(token);
    } catch (e) {
      _updateState(SignalingState.error);
      _errorController.add(SignalingError(e.toString()));
      _scheduleReconnect();
    }
  }

  void _sendDeviceConnect(String token) {
    if (_deviceType == null || _deviceId == null) return;
    final payload = DeviceConnectPayload(
      deviceType: _deviceType!,
      deviceId: _deviceId!,
      token: token,
      protocolVersion: protocolVersion,
      pushToken: _pushToken,
      timestamp: DateTime.now().millisecondsSinceEpoch,
    );
    emit(MessageTypes.deviceConnect, payload.toJson());
  }

  /// Disconnect from signaling server
  Task<Unit> disconnect() {
    return Task(() async {
      _intentionallyClosed = true;

      if (_currentState == SignalingState.connected) {
        final payload = DeviceDisconnectPayload(
          timestamp: DateTime.now().millisecondsSinceEpoch,
        );
        emit(MessageTypes.deviceDisconnect, payload.toJson());
      }

      _close();
      return unit;
    });
  }

  /// Emit protocol message — sends JSON: {"type": messageType, ...payload}
  void emit(String messageType, Map<String, dynamic> payload) {
    if (_currentState != SignalingState.connected) {
      _errorController.add(const SignalingError('Cannot emit: not connected'));
      return;
    }
    _channel?.sink.add(jsonEncode({'type': messageType, ...payload}));
  }

  void _onMessage(dynamic raw) {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw as String) as Map<String, dynamic>;
    } catch (_) {
      return;
    }

    final type = msg['type'];
    if (type is! String) return;

    if (type == 'pong') {
      _onPong();
      return;
    }

    if (type == MessageTypes.error) {
      final code = msg['code'] as String?;
      _errorController.add(
        SignalingError(msg['message'] as String? ?? 'server error', code: code),
      );
      // Fatal auth/version errors: reconnecting with the same credentials
      // cannot succeed, so stop trying.
      const fatalCodes = {'auth_failed', 'device_mismatch', 'protocol_incompatible'};
      if (fatalCodes.contains(code)) {
        _intentionallyClosed = true;
        _close();
        return;
      }
    }

    final payload = Map<String, dynamic>.from(msg)..remove('type');
    _messageController.add({'type': type, 'payload': payload});
  }

  void _onError(Object error) {
    _updateState(SignalingState.error);
    _errorController.add(SignalingError(error.toString()));
  }

  void _onDone() {
    _stopHeartbeat();
    _updateState(SignalingState.disconnected);
    if (!_intentionallyClosed) {
      _scheduleReconnect();
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer = Timer.periodic(_heartbeatInterval, (_) {
      if (_currentState != SignalingState.connected) return;
      _channel?.sink.add(jsonEncode({'type': 'ping'}));
      _pongTimer = Timer(_heartbeatTimeout, () {
        _channel?.sink.close();
      });
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _pongTimer?.cancel();
    _pongTimer = null;
  }

  void _onPong() {
    _pongTimer?.cancel();
    _pongTimer = null;
  }

  void _scheduleReconnect() {
    if (_intentionallyClosed || _reconnectAttempts >= _maxReconnectAttempts) return;
    final delay = _baseReconnectDelay * (1 << _reconnectAttempts);
    _reconnectAttempts++;
    Timer(delay, () {
      if (!_intentionallyClosed) {
        _connect();
      }
    });
  }

  void _close() {
    _stopHeartbeat();
    _channelSubscription?.cancel();
    _channelSubscription = null;
    _channel?.sink.close();
    _channel = null;
    _updateState(SignalingState.disconnected);
  }

  void _updateState(SignalingState newState) {
    _currentState = newState;
    _stateController.add(newState);
  }

  void dispose() {
    _intentionallyClosed = true;
    _close();
    _stateController.close();
    _messageController.close();
    _errorController.close();
  }
}

/// Mock implementation for testing
class MockSignalingClient extends SignalingClient {
  final _mockStateController = StreamController<SignalingState>.broadcast();
  final _mockMessageController = StreamController<Map<String, dynamic>>.broadcast();

  SignalingState _mockState = SignalingState.disconnected;

  MockSignalingClient() : super('mock://localhost');

  @override
  SignalingState get state => _mockState;

  @override
  Stream<SignalingState> get stateStream => _mockStateController.stream;

  @override
  Stream<Map<String, dynamic>> get messageStream => _mockMessageController.stream;

  @override
  Task<Unit> connect({
    required DeviceType deviceType,
    required String deviceId,
    required Future<String> Function() getToken,
    String? pushToken,
  }) {
    return Task(() async {
      _mockState = SignalingState.connecting;
      _mockStateController.add(_mockState);

      await Future.delayed(const Duration(milliseconds: 100));

      _mockState = SignalingState.connected;
      _mockStateController.add(_mockState);

      return unit;
    });
  }

  @override
  Task<Unit> disconnect() {
    return Task(() async {
      _mockState = SignalingState.disconnected;
      _mockStateController.add(_mockState);
      return unit;
    });
  }

  @override
  void emit(String messageType, Map<String, dynamic> payload) {
    // Mock emit — no-op
  }

  /// Simulate an incoming server message in tests
  void simulateMessage(String type, Map<String, dynamic> payload) {
    _mockMessageController.add({'type': type, 'payload': payload});
  }

  @override
  void dispose() {
    _mockStateController.close();
    _mockMessageController.close();
  }
}
