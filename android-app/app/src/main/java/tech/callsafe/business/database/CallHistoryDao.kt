package tech.callsafe.business.database

import androidx.lifecycle.LiveData
import androidx.room.*

@Dao
interface CallHistoryDao {
    @Query("SELECT * FROM call_history ORDER BY timestamp DESC")
    fun getAllCalls(): LiveData<List<CallRecord>>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCall(call: CallRecord)
    
    @Query("DELETE FROM call_history WHERE timestamp < :cutoffTime")
    suspend fun deleteOldCalls(cutoffTime: Long)
    
    @Query("SELECT COUNT(*) FROM call_history")
    suspend fun getCallCount(): Int
}