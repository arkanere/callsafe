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
        status: String,
        reason: String? = null,
        callType: String = "incoming",
        deviceInfo: String? = null,
        connectionType: String? = null
    ) {
        android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - ENTRY POINT")
        android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - Parameters: callAttemptId=$callAttemptId, sourceId=$sourceId")
        android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - Times: startTime=$startTime, endTime=$endTime, duration=$duration")
        android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - Status: $status")
        
        android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - Creating CallRecord object")
        val callRecord = CallRecord(
            callAttemptId = callAttemptId,
            sourceId = sourceId,
            startTime = startTime,
            endTime = endTime,
            duration = duration,
            device = "mobile",
            status = status,
            reason = reason,
            callType = callType,
            deviceInfo = deviceInfo,
            connectionType = connectionType
        )
        android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - CallRecord created: $callRecord")
        
        try {
            android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - Inserting call into database")
            callHistoryDao.insertCall(callRecord)
            android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - Call inserted successfully")
            
            // Keep only latest 20 calls
            android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - Keeping only latest 20 calls")
            callHistoryDao.keepOnlyLatest20Calls()
            android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - Cleanup complete - only 20 most recent calls retained")
            
            android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - SUCCESS - Call saved to database")
        } catch (e: Exception) {
            android.util.Log.e("CallHistoryManager", "[HISTORY] saveCall() - EXCEPTION while saving to database", e)
            android.util.Log.e("CallHistoryManager", "[HISTORY] saveCall() - Exception type: ${e.javaClass.simpleName}")
            android.util.Log.e("CallHistoryManager", "[HISTORY] saveCall() - Exception message: ${e.message}")
            throw e
        }
        
        android.util.Log.d("CallHistoryManager", "[HISTORY] saveCall() - EXIT POINT")
    }
}