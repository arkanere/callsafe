package com.callsafe.androidapp.network

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import org.json.JSONException
import org.json.JSONObject
import java.net.URI

class SocketManager private constructor() {
    private var socket: Socket? = null
    private var isConnected = false
    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 5
    private var reconnectDelay = 1000L // Start with 1 second
    private val maxReconnectDelay = 16000L // Max 16 seconds
    private val serverUrl = "https://tunnel.callsafe.tech"
    
    // State tracking for reconnection  
    private var agentState = AgentState()
    
    // Event listeners
    private val eventListeners = mutableMapOf<String, (Any?) -> Unit>()
    
    private data class AgentState(
        var isAgentOnline: Boolean = false,
        var registrationType: String = "none", // none, basic, with_user, with_handle
        var userId: Int? = null,
        var handle: String? = null,
        var sourceId: String? = null
    )
    
    companion object {
        private const val TAG = "SocketManager"
        @Volatile
        private var INSTANCE: SocketManager? = null
        
        fun getInstance(): SocketManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SocketManager().also { INSTANCE = it }
            }
        }
    }
    
    fun connect(callback: (Boolean, String?) -> Unit) {
        // If already connected, return success
        if (socket?.connected() == true && isConnected) {
            callback(true, null)
            return
        }
        
        // Clean up existing socket (but keep listeners)
        Log.d(TAG, "🔄 Cleaning up existing socket before connecting")
        disconnect()
        
        try {
            val options = IO.Options().apply {
                transports = arrayOf("websocket", "polling")
                timeout = 10000
                reconnection = false // We handle reconnection manually
            }
            
            socket = IO.socket(URI.create(serverUrl), options)
            
            setupEventHandlers()
            
            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "✅ Socket connected")
                isConnected = true
                reconnectAttempts = 0
                reconnectDelay = 1000L
                
                // Restore agent state after reconnection
                restoreAgentState()
                
                callback(true, null)
            }
            
            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                val error = if (args.isNotEmpty()) args[0].toString() else "Unknown error"
                Log.e(TAG, "Connection error: $error")
                isConnected = false
                
                if (reconnectAttempts == 0) {
                    // First connection attempt failed
                    callback(false, error)
                } else {
                    // Handle reconnection
                    handleReconnection()
                }
            }
            
            socket?.on(Socket.EVENT_DISCONNECT) { args ->
                val reason = if (args.isNotEmpty()) args[0].toString() else "Unknown reason"
                Log.w(TAG, "Disconnected: $reason")
                isConnected = false
                
                // Only auto-reconnect if it wasn't a manual disconnect
                if (reason != "io client disconnect") {
                    handleReconnection()
                }
            }
            
            socket?.connect()
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create socket connection", e)
            callback(false, e.message)
        }
    }
    
    private fun setupEventHandlers() {
        socket?.apply {
            // EXACTLY match website incoming events
            on("new_incoming_call") { args ->
                Log.i(TAG, "📞 NEW INCOMING CALL")
                handleSocketEvent("new_incoming_call", args)
            }
            
            on("call_routed") { args ->
                Log.i(TAG, "🔄 Call routed")
                handleSocketEvent("call_routed", args)
            }
            
            on("offer") { args ->
                Log.i(TAG, "📥 WebRTC offer")
                handleSocketEvent("offer", args)
            }
            
            on("ice_candidate") { args ->
                handleSocketEvent("ice_candidate", args)
            }
            
            on("call_ended") { args ->
                Log.i(TAG, "📞 Call ended")
                handleSocketEvent("call_ended", args)
            }
            
            on("call_disconnected") { args ->
                Log.d(TAG, "📞 Received call_disconnected")
                handleSocketEvent("call_disconnected", args)
            }
            
            on("call_cancelled") { args ->
                Log.d(TAG, "📞 Received call_cancelled")
                handleSocketEvent("call_cancelled", args)
            }
            
            on("call_request_cancelled") { args ->
                Log.d(TAG, "📞 Received call_request_cancelled")
                handleSocketEvent("call_request_cancelled", args)
            }
            
            on("customer_disconnected") { args ->
                Log.d(TAG, "📞 Received customer_disconnected")
                handleSocketEvent("customer_disconnected", args)
            }
            
            on("network_error") { args ->
                Log.d(TAG, "🔥 Received network_error")
                handleSocketEvent("network_error", args)
            }
            
            on("reconnect_attempt") { args ->
                Log.d(TAG, "🔄 Received reconnect_attempt")
                handleSocketEvent("reconnect_attempt", args)
            }
            
            on("connection_failed") { args ->
                Log.d(TAG, "❌ Received connection_failed")
                handleSocketEvent("connection_failed", args)
            }
            
            on("call_no_longer_available") { args ->
                Log.d(TAG, "📞 Received call_no_longer_available")
                handleSocketEvent("call_no_longer_available", args)
            }
            
            on("agent_registered") { args ->
                Log.i(TAG, "✅ Agent registered")
                handleSocketEvent("agent_registered", args)
            }
            
            on("missed_call") { args ->
                Log.i(TAG, "📞 MISSED CALL")
                handleSocketEvent("missed_call", args)
            }
        }
    }
    
    private fun handleSocketEvent(eventName: String, args: Array<Any>) {
        val data = if (args.isNotEmpty()) args[0] else null
        Log.i(TAG, "🔄 handleSocketEvent: '$eventName' with data: $data")
        Log.i(TAG, "🔄 Available listeners: ${eventListeners.keys}")
        Log.i(TAG, "🔄 Has listener for '$eventName': ${eventListeners.containsKey(eventName)}")
        
        val listener = eventListeners[eventName]
        if (listener != null) {
            Log.i(TAG, "✅ Calling listener for '$eventName'")
            listener.invoke(data)
        } else {
            Log.e(TAG, "❌ No listener registered for '$eventName'")
        }
    }
    
    private fun handleReconnection() {
        if (reconnectAttempts >= maxReconnectAttempts) {
            Log.e(TAG, "Max reconnection attempts reached")
            eventListeners["connection_failed"]?.invoke("Max reconnection attempts reached")
            return
        }
        
        reconnectAttempts++
        eventListeners["reconnect_attempt"]?.invoke(reconnectAttempts)
        
        Log.d(TAG, "Reconnection attempt $reconnectAttempts in ${reconnectDelay}ms")
        
        // Exponential backoff with jitter
        reconnectDelay = minOf(
            reconnectDelay * 2 + (Math.random() * 1000).toLong(),
            maxReconnectDelay
        )
        
        // Reconnect after delay
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            connect { success, error ->
                if (!success) {
                    Log.e(TAG, "Reconnection failed: $error")
                    handleReconnection() // Try again
                }
            }
        }, reconnectDelay)
    }
    
    private fun restoreAgentState() {
        if (!agentState.isAgentOnline) {
            Log.d(TAG, "🔄 No agent state to restore (agent was offline)")
            return
        }
        
        Log.d(TAG, "🔄 Restoring agent state after reconnection: $agentState")
        
        when (agentState.registrationType) {
            "basic" -> {
                Log.d(TAG, "🔄 Re-registering agent (basic)")
                emit("agent_online", null)
            }
            "with_user" -> {
                agentState.userId?.let { userId ->
                    Log.d(TAG, "🔄 Re-registering agent with user ID: $userId")
                    val data = JSONObject().apply { put("userId", userId) }
                    emit("agent_online_with_user", data)
                }
            }
            "with_handle" -> {
                agentState.handle?.let { handle ->
                    Log.d(TAG, "🔄 Re-registering agent with handle: $handle, sourceId: ${agentState.sourceId}")
                    val data = JSONObject().apply {
                        put("handle", handle)
                        agentState.sourceId?.let { put("sourceId", it) }
                    }
                    emit("agent_online_with_handle", data)
                }
            }
        }
    }
    
    // EXACTLY match website outgoing events
    fun goOnlineWithHandle(handle: String, sourceId: String?) {
        Log.i(TAG, "📤 Going online with handle: $handle")
        agentState = AgentState(
            isAgentOnline = true,
            registrationType = "with_handle", 
            handle = handle,
            sourceId = sourceId
        )
        val data = JSONObject().apply {
            put("handle", handle)
            sourceId?.let { put("sourceId", it) }
        }
        emit("agent_online_with_handle", data)
    }
    
    fun goOffline() {
        Log.d(TAG, "📤 Emitting agent_offline")
        agentState = AgentState()
        emit("agent_offline", null)
    }
    
    fun acceptCall(callId: String, handle: String?, sourceId: String?) {
        Log.d(TAG, "📤 Emitting accept_call for: $callId, handle: $handle, sourceId: $sourceId")
        val data = JSONObject().apply {
            put("callId", callId)
            handle?.let { put("handle", it) }
            sourceId?.let { put("sourceId", it) }
        }
        emit("accept_call", data)
    }
    
    fun declineCall(callId: String, handle: String?, sourceId: String?) {
        Log.d(TAG, "📤 Emitting decline_call for: $callId, handle: $handle, sourceId: $sourceId")
        val data = JSONObject().apply {
            put("callId", callId)
            handle?.let { put("handle", it) }
            sourceId?.let { put("sourceId", it) }
        }
        emit("decline_call", data)
    }
    
    fun endCall(callId: String?, handle: String?, sourceId: String?, reason: String? = null) {
        Log.d(TAG, "📤 Emitting call_ended with callId: $callId, handle: $handle, sourceId: $sourceId, reason: $reason")
        val data = JSONObject().apply {
            callId?.let { put("callId", it) }
            handle?.let { put("handle", it) }
            sourceId?.let { put("sourceId", it) }
            reason?.let { put("reason", it) }
        }
        emit("call_ended", data)
    }
    
    fun sendAnswer(callId: String, answer: String, handle: String?, sourceId: String?) {
        Log.d(TAG, "📤 Emitting answer for: $callId, handle: $handle, sourceId: $sourceId")
        val data = JSONObject().apply {
            put("callId", callId)
            put("answer", answer)
            handle?.let { put("handle", it) }
            sourceId?.let { put("sourceId", it) }
        }
        emit("answer", data)
    }
    
    fun sendIceCandidate(callId: String, candidate: String, handle: String?, sourceId: String?) {
        Log.d(TAG, "📤 Emitting ice_candidate for: $callId, handle: $handle, sourceId: $sourceId")
        val data = JSONObject().apply {
            put("callId", callId)
            put("candidate", candidate)
            handle?.let { put("handle", it) }
            sourceId?.let { put("sourceId", it) }
        }
        emit("ice_candidate", data)
    }
    
    private fun emit(event: String, data: JSONObject?) {
        if (socket?.connected() == true && isConnected) {
            socket?.emit(event, data)
        } else {
            Log.w(TAG, "❌ Cannot emit $event: not connected")
        }
    }
    
    // Event subscription methods
    fun on(event: String, listener: (Any?) -> Unit) {
        eventListeners[event] = listener
    }
    
    fun off(event: String) {
        eventListeners.remove(event)
    }
    
    // Connection status
    fun isConnected(): Boolean {
        return isConnected && socket?.connected() == true
    }
    
    // Cleanup
    fun disconnect() {
        Log.d(TAG, "🔄 Disconnecting socket (keeping listeners)")
        socket?.disconnect()
        socket = null
        isConnected = false
        // DON'T clear listeners - they should persist across reconnections
        // eventListeners.clear()
    }
    
    // Complete cleanup - only call when app is shutting down
    fun shutdown() {
        Log.d(TAG, "🛑 Complete shutdown - clearing all listeners")
        disconnect()
        eventListeners.clear()
    }
}