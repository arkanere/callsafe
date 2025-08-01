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
    val device: String, // "mobile"
    val status: String, // "completed", "missed", "rejected"
    val timestamp: Long = System.currentTimeMillis()
)