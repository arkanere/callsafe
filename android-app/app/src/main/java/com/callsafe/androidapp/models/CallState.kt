package com.callsafe.androidapp.models

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

/**
 * Represents the current state of the CallSafe service and any active calls
 * This is the single source of truth for all call-related state
 */
@Parcelize
data class CallState(
    // Connection state
    val isConnected: Boolean = false,
    val connectionStatus: String = "Disconnected",
    val lastConnectionAttempt: Long = 0L,
    
    // Agent registration state
    val isAgentRegistered: Boolean = false,
    val agentHandle: String? = null,
    val sourceId: String? = null,
    
    // Active call state
    val currentCall: ActiveCall? = null,
    
    // Incoming calls queue
    val incomingCalls: List<IncomingCall> = emptyList(),
    
    // Call history (last 10 calls)
    val recentCallHistory: List<CallHistoryItem> = emptyList(),
    
    // Error state
    val lastError: String? = null,
    val errorTimestamp: Long = 0L
) : Parcelable

@Parcelize
data class ActiveCall(
    val callId: String,
    val sourceId: String,
    val status: CallStatus,
    val startTime: Long,
    val duration: Int = 0,
    val isMuted: Boolean = false
) : Parcelable

enum class CallStatus {
    INCOMING,
    CONNECTING, 
    CONNECTED,
    ENDING,
    ENDED
}


