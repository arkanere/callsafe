import 'dart:async';
import 'package:fpdart/fpdart.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
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

/// Thin WebSocket wrapper for protocol message serialization
/// Pure data transformation - no business logic
class SignalingClient {
  final String serverUrl;
  io.Socket? _socket;

  final StreamController<SignalingState> _stateController =
      StreamController<SignalingState>.broadcast();

  final StreamController<Map<String, dynamic>> _messageController =
      StreamController<Map<String, dynamic>>.broadcast();

  final StreamController<SignalingError> _errorController =
      StreamController<SignalingError>.broadcast();

  SignalingState _currentState = SignalingState.disconnected;

  SignalingClient(this.serverUrl);

  /// Current connection state
  SignalingState get state => _currentState;

  /// State change stream
  Stream<SignalingState> get stateStream => _stateController.stream;

  /// Incoming message stream
  Stream<Map<String, dynamic>> get messageStream => _messageController.stream;

  /// Error stream
  Stream<SignalingError> get errorStream => _errorController.stream;

  /// Connect to signaling server
  Task<Unit> connect({
    required DeviceType deviceType,
    required String deviceId,
    String? pushToken,
  }) {
    return Task(() async {
      if (_currentState == SignalingState.connected) {
        return unit;
      }

      _updateState(SignalingState.connecting);

      try {
        _socket = io.io(
          serverUrl,
          io.OptionBuilder()
              .setTransports(['websocket'])
              .enableAutoConnect()
              .setReconnectionAttempts(5)
              .setReconnectionDelay(1000)
              .build(),
        );

        _setupEventHandlers();

        // Connect socket (non-async)
        _socket!.connect();

        // Wait briefly for connection to establish
        await Future.delayed(const Duration(milliseconds: 500));

        // Send device:connect message
        final connectPayload = DeviceConnectPayload(
          deviceType: deviceType,
          deviceId: deviceId,
          pushToken: pushToken,
          protocolVersion: protocolVersion,
          timestamp: DateTime.now().millisecondsSinceEpoch,
        );

        emit(MessageTypes.deviceConnect, connectPayload.toJson());

        return unit;
      } catch (e) {
        _updateState(SignalingState.error);
        _errorController.add(SignalingError(e.toString()));
        throw SignalingError(e.toString());
      }
    });
  }

  /// Disconnect from signaling server
  Task<Unit> disconnect({String? deviceId}) {
    return Task(() async {
      try {
        if (deviceId != null && _socket?.connected == true) {
          final disconnectPayload = DeviceDisconnectPayload(
            deviceId: deviceId,
            timestamp: DateTime.now().millisecondsSinceEpoch,
          );
          emit(MessageTypes.deviceDisconnect, disconnectPayload.toJson());
        }

        _socket?.disconnect();
        _socket?.dispose();
        _socket = null;
        _updateState(SignalingState.disconnected);

        return unit;
      } catch (e) {
        _errorController.add(SignalingError(e.toString()));
        throw SignalingError(e.toString());
      }
    });
  }

  /// Emit protocol message
  void emit(String messageType, Map<String, dynamic> payload) {
    if (_currentState != SignalingState.connected) {
      _errorController.add(
        const SignalingError('Cannot emit: not connected'),
      );
      return;
    }

    _socket?.emit(messageType, payload);
  }

  /// Setup socket event handlers
  void _setupEventHandlers() {
    _socket?.on('connect', (_) {
      _updateState(SignalingState.connected);
    });

    _socket?.on('disconnect', (_) {
      _updateState(SignalingState.disconnected);
    });

    _socket?.on('error', (data) {
      _updateState(SignalingState.error);
      _errorController.add(SignalingError(data.toString()));
    });

    // Forward all protocol messages to message stream
    _registerMessageHandler(MessageTypes.callIncoming);
    _registerMessageHandler(MessageTypes.callAccepted);
    _registerMessageHandler(MessageTypes.callCancelled);
    _registerMessageHandler(MessageTypes.callEnded);
    _registerMessageHandler(MessageTypes.callBusy);
    _registerMessageHandler(MessageTypes.callUnavailable);
    _registerMessageHandler(MessageTypes.callTimeout);
    _registerMessageHandler(MessageTypes.webrtcOffer);
    _registerMessageHandler(MessageTypes.webrtcAnswer);
    _registerMessageHandler(MessageTypes.webrtcIceCandidate);
    _registerMessageHandler(MessageTypes.deviceConnected);
    _registerMessageHandler(MessageTypes.deviceDisconnected);
    _registerMessageHandler(MessageTypes.deviceStatusUpdated);
    _registerMessageHandler(MessageTypes.mediaToggle);
    _registerMessageHandler(MessageTypes.escalationAccepted);
    _registerMessageHandler(MessageTypes.escalationRejected);
    _registerMessageHandler(MessageTypes.serverShutdown);
  }

  /// Register handler for specific message type
  void _registerMessageHandler(String messageType) {
    _socket?.on(messageType, (data) {
      if (data is Map<String, dynamic>) {
        _messageController.add({
          'type': messageType,
          'payload': data,
        });
      }
    });
  }

  /// Update state and notify listeners
  void _updateState(SignalingState newState) {
    _currentState = newState;
    _stateController.add(newState);
  }

  /// Dispose resources
  void dispose() {
    _socket?.disconnect();
    _socket?.dispose();
    _stateController.close();
    _messageController.close();
    _errorController.close();
  }
}

/// Mock implementation for testing and Phase 1 UI development
class MockSignalingClient extends SignalingClient {
  final StreamController<SignalingState> _mockStateController =
      StreamController<SignalingState>.broadcast();

  final StreamController<Map<String, dynamic>> _mockMessageController =
      StreamController<Map<String, dynamic>>.broadcast();

  SignalingState _mockState = SignalingState.disconnected;

  MockSignalingClient() : super('mock://localhost');

  @override
  SignalingState get state => _mockState;

  @override
  Stream<SignalingState> get stateStream => _mockStateController.stream;

  @override
  Stream<Map<String, dynamic>> get messageStream =>
      _mockMessageController.stream;

  @override
  Task<Unit> connect({
    required DeviceType deviceType,
    required String deviceId,
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
  Task<Unit> disconnect({String? deviceId}) {
    return Task(() async {
      _mockState = SignalingState.disconnected;
      _mockStateController.add(_mockState);
      return unit;
    });
  }

  @override
  void emit(String messageType, Map<String, dynamic> payload) {
    // Mock emit - does nothing
  }

  /// Test helper to simulate incoming message
  void simulateMessage(String type, Map<String, dynamic> payload) {
    _mockMessageController.add({
      'type': type,
      'payload': payload,
    });
  }

  @override
  void dispose() {
    _mockStateController.close();
    _mockMessageController.close();
  }
}
