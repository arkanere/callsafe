package tech.callsafe.business.database

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "call_history")
data class CallRecord(
    @PrimaryKey val callAttemptId: String,
    val sourceId: String,
    val startTime: Long,
    val endTime: Long,
    val duration: Int, // in seconds
    val device: String, // "mobile", "web"
    val status: String, // "completed", "missed", "rejected", "cancelled", "failed", "answered_elsewhere", "timeout"
    val timestamp: Long = System.currentTimeMillis(),
    val reason: String? = null, // Additional details about call outcome (customer_cancelled, timeout, etc.)
    val callType: String = "incoming", // "incoming", "outgoing" 
    val deviceInfo: String? = null, // Additional device information
    val connectionType: String? = null // "webrtc", "pstn", etc.
)