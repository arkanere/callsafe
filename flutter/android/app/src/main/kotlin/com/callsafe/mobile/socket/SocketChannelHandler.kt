package com.callsafe.mobile.socket

import android.content.Context
import android.util.Log
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import com.callsafe.mobile.protocol.Protocol
import com.callsafe.mobile.utils.getUniqueDeviceId

/**
 * Socket.IO platform channel handler
 * Exposes Socket.IO functionality to Flutter
 */
class SocketChannelHandler(
    messenger: BinaryMessenger,
    private val context: Context
) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL_NAME)
    private val eventChannel = EventChannel(messenger, EVENT_CHANNEL_NAME)
    private var eventSink: EventChannel.EventSink? = null

    private var socket: Socket? = null
    private var isConnected = false

    companion object {
        private const val TAG = "SocketChannelHandler"
        private const val CHANNEL_NAME = "com.callsafe.socket"
        private const val EVENT_CHANNEL_NAME = "com.callsafe.socket.events"
    }

    init {
        channel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                eventSink = events
            }

            override fun onCancel(arguments: Any?) {
                eventSink = null
            }
        })
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "connect" -> {
                val token = call.argument<String>("token") ?: return result.error("INVALID_ARGS", "Missing token", null)
                val serverUrl = call.argument<String>("serverUrl") ?: "wss://tunnel.callsafe.tech"
                connect(token, serverUrl, result)
            }
            "disconnect" -> {
                disconnect()
                result.success(null)
            }
            "emit" -> {
                val event = call.argument<String>("event") ?: return result.error("INVALID_ARGS", "Missing event", null)
                val data = call.argument<Map<String, Any>>("data") ?: return result.error("INVALID_ARGS", "Missing data", null)
                emit(event, data)
                result.success(null)
            }
            "isConnected" -> {
                result.success(isConnected)
            }
            else -> result.notImplemented()
        }
    }

    private fun connect(token: String, serverUrl: String, result: MethodChannel.Result) {
        Log.d(TAG, "connect() called with serverUrl: $serverUrl")

        // Disconnect existing connection if any
        disconnect()

        try {
            val options = IO.Options().apply {
                auth = mapOf("token" to token)
                transports = arrayOf("websocket", "polling")
                timeout = 30000
                forceNew = true
            }

            socket = IO.socket(serverUrl, options)

            socket?.apply {
                on(Socket.EVENT_CONNECT) {
                    Log.d(TAG, "Socket connected")
                    isConnected = true
                    eventSink?.success(mapOf(
                        "type" to "connected"
                    ))

                    // Auto-register device
                    registerDevice()
                }

                on(Socket.EVENT_DISCONNECT) { args ->
                    Log.d(TAG, "Socket disconnected: ${args.getOrNull(0)}")
                    isConnected = false
                    eventSink?.success(mapOf(
                        "type" to "disconnected",
                        "reason" to args.getOrNull(0)?.toString()
                    ))
                }

                on(Socket.EVENT_CONNECT_ERROR) { args ->
                    Log.e(TAG, "Socket connection error: ${args.getOrNull(0)}")
                    eventSink?.error("CONNECTION_ERROR", args.getOrNull(0)?.toString(), null)
                }

                // Listen for protocol events
                setupProtocolEventHandlers()

                connect()
                result.success(null)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create socket", e)
            result.error("CONNECTION_FAILED", e.message, null)
        }
    }

    private fun setupProtocolEventHandlers() {
        socket?.apply {
            // Incoming call
            on(Protocol.MessageTypes.CALL_INCOMING) { args ->
                Log.d(TAG, "Received ${Protocol.MessageTypes.CALL_INCOMING}")
                val data = args.getOrNull(0) as? JSONObject
                data?.let {
                    eventSink?.success(mapOf(
                        "type" to "call:incoming",
                        "data" to jsonToMap(it)
                    ))
                }
            }

            // Call cancelled
            on(Protocol.MessageTypes.CALL_CANCELLED) { args ->
                Log.d(TAG, "Received ${Protocol.MessageTypes.CALL_CANCELLED}")
                val data = args.getOrNull(0) as? JSONObject
                data?.let {
                    eventSink?.success(mapOf(
                        "type" to "call:cancelled",
                        "data" to jsonToMap(it)
                    ))
                }
            }

            // Call ended
            on(Protocol.MessageTypes.CALL_ENDED) { args ->
                Log.d(TAG, "Received ${Protocol.MessageTypes.CALL_ENDED}")
                val data = args.getOrNull(0) as? JSONObject
                data?.let {
                    eventSink?.success(mapOf(
                        "type" to "call:ended",
                        "data" to jsonToMap(it)
                    ))
                }
            }

            // Call failed
            on(Protocol.MessageTypes.CALL_FAILED) { args ->
                Log.d(TAG, "Received ${Protocol.MessageTypes.CALL_FAILED}")
                val data = args.getOrNull(0) as? JSONObject
                data?.let {
                    eventSink?.success(mapOf(
                        "type" to "call:failed",
                        "data" to jsonToMap(it)
                    ))
                }
            }

            // WebRTC offer
            on(Protocol.MessageTypes.WEBRTC_OFFER) { args ->
                Log.d(TAG, "Received ${Protocol.MessageTypes.WEBRTC_OFFER}")
                val data = args.getOrNull(0) as? JSONObject
                data?.let {
                    eventSink?.success(mapOf(
                        "type" to "webrtc:offer",
                        "data" to jsonToMap(it)
                    ))
                }
            }

            // WebRTC ICE candidate
            on(Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE) { args ->
                Log.d(TAG, "Received ${Protocol.MessageTypes.WEBRTC_ICE_CANDIDATE}")
                val data = args.getOrNull(0) as? JSONObject
                data?.let {
                    eventSink?.success(mapOf(
                        "type" to "webrtc:ice-candidate",
                        "data" to jsonToMap(it)
                    ))
                }
            }

            // Device connected
            on(Protocol.MessageTypes.DEVICE_CONNECTED) { args ->
                Log.d(TAG, "Received ${Protocol.MessageTypes.DEVICE_CONNECTED}")
                val data = args.getOrNull(0) as? JSONObject
                data?.let {
                    eventSink?.success(mapOf(
                        "type" to "device:connected",
                        "data" to jsonToMap(it)
                    ))
                }
            }

            // Error
            on(Protocol.MessageTypes.ERROR) { args ->
                Log.e(TAG, "Received error event")
                val error = args.getOrNull(0) as? JSONObject
                error?.let {
                    eventSink?.success(mapOf(
                        "type" to "error",
                        "data" to jsonToMap(it)
                    ))
                }
            }
        }
    }

    private fun registerDevice() {
        val deviceId = getUniqueDeviceId(context)

        val deviceConnectEvent = JSONObject().apply {
            put("type", Protocol.MessageTypes.DEVICE_CONNECT)
            put("deviceType", Protocol.DeviceType.MOBILE.value)
            put("deviceId", deviceId)
            put("protocolVersion", Protocol.VERSION)
            put("timestamp", System.currentTimeMillis())
        }

        Log.d(TAG, "Registering device with protocol version ${Protocol.VERSION}")
        socket?.emit(Protocol.MessageTypes.DEVICE_CONNECT, deviceConnectEvent)

        // Send initial status as available
        val statusData = JSONObject().apply {
            put("deviceId", deviceId)
            put("status", Protocol.DeviceStatus.AVAILABLE.value)
            put("timestamp", System.currentTimeMillis())
        }
        socket?.emit(Protocol.MessageTypes.DEVICE_STATUS, statusData)
    }

    private fun emit(event: String, data: Map<String, Any>) {
        val jsonData = JSONObject(data)
        socket?.emit(event, jsonData)
        Log.d(TAG, "Emitted event: $event")
    }

    private fun disconnect() {
        socket?.disconnect()
        socket = null
        isConnected = false
        Log.d(TAG, "Socket disconnected and cleared")
    }

    private fun jsonToMap(json: JSONObject): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        json.keys().forEach { key ->
            val value = json.get(key)
            map[key] = when (value) {
                is JSONObject -> jsonToMap(value)
                JSONObject.NULL -> null
                else -> value
            }
        }
        return map
    }

    fun dispose() {
        disconnect()
        channel.setMethodCallHandler(null)
    }
}
