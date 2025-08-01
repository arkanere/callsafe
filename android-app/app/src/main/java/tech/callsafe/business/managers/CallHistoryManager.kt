package tech.callsafe.business.managers

import android.content.Context
import androidx.lifecycle.LiveData
import tech.callsafe.business.database.CallHistoryDatabase
import tech.callsafe.business.database.CallRecord

class CallHistoryManager(context: Context) {
    private val database = CallHistoryDatabase.getDatabase(context)
    private val callHistoryDao = database.callHistoryDao()
    
    fun getAllCalls(): LiveData<List<CallRecord>> = callHistoryDao.getAllCalls()
    
    suspend fun saveCall(
        callAttemptId: String,
        sourceId: String,
        startTime: Long,
        endTime: Long,
        duration: Int,
        status: String
    ) {
        val callRecord = CallRecord(
            callAttemptId = callAttemptId,
            sourceId = sourceId,
            startTime = startTime,
            endTime = endTime,
            duration = duration,
            device = "mobile",
            status = status
        )
        
        callHistoryDao.insertCall(callRecord)
        
        // Clean up old calls (keep only last 100)
        val callCount = callHistoryDao.getCallCount()
        if (callCount > 100) {
            val cutoffTime = System.currentTimeMillis() - (30 * 24 * 60 * 60 * 1000L) // 30 days
            callHistoryDao.deleteOldCalls(cutoffTime)
        }
    }
}