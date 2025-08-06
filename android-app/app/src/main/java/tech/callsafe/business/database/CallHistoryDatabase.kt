package tech.callsafe.business.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [CallRecord::class],
    version = 2,
    exportSchema = false
)
abstract class CallHistoryDatabase : RoomDatabase() {
    abstract fun callHistoryDao(): CallHistoryDao
    
    companion object {
        @Volatile
        private var INSTANCE: CallHistoryDatabase? = null
        
        // Migration from version 1 to version 2
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Add new columns with default values
                database.execSQL("ALTER TABLE call_history ADD COLUMN reason TEXT")
                database.execSQL("ALTER TABLE call_history ADD COLUMN callType TEXT NOT NULL DEFAULT 'incoming'")
                database.execSQL("ALTER TABLE call_history ADD COLUMN deviceInfo TEXT")
                database.execSQL("ALTER TABLE call_history ADD COLUMN connectionType TEXT")
            }
        }
        
        fun getDatabase(context: Context): CallHistoryDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    CallHistoryDatabase::class.java,
                    "call_history_database"
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}