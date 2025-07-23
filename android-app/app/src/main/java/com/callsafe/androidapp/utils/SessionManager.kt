package com.callsafe.androidapp.utils

import android.content.Context
import android.content.SharedPreferences
import com.callsafe.androidapp.models.User
import com.google.gson.Gson
import java.util.concurrent.TimeUnit

class SessionManager(context: Context) {
    
    companion object {
        private const val PREF_NAME = "callsafe_session"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_DATA = "user_data"
        private const val KEY_USER_HANDLE = "user_handle"
        private const val KEY_SOURCE_ID = "source_id"
        private const val KEY_LOGIN_TIMESTAMP = "login_timestamp"
        private const val SESSION_DURATION = 30L * 24 * 60 * 60 * 1000 // 30 days in milliseconds
        
        @Volatile
        private var INSTANCE: SessionManager? = null
        
        fun getInstance(context: Context): SessionManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SessionManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    private val sharedPreferences: SharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()
    
    fun saveUserSession(user: User, handle: String) {
        val currentTime = System.currentTimeMillis()
        
        with(sharedPreferences.edit()) {
            putInt(KEY_USER_ID, user.id)
            putString(KEY_USER_DATA, gson.toJson(user))
            putString(KEY_USER_HANDLE, handle)
            putString(KEY_SOURCE_ID, user.sourceId ?: "")
            putLong(KEY_LOGIN_TIMESTAMP, currentTime)
            apply()
        }
    }
    
    fun isSessionValid(): Boolean {
        val loginTimestamp = sharedPreferences.getLong(KEY_LOGIN_TIMESTAMP, 0)
        if (loginTimestamp == 0L) return false
        
        val currentTime = System.currentTimeMillis()
        val sessionAge = currentTime - loginTimestamp
        
        return sessionAge < SESSION_DURATION && hasValidUserData()
    }
    
    private fun hasValidUserData(): Boolean {
        val userId = sharedPreferences.getInt(KEY_USER_ID, -1)
        val userData = sharedPreferences.getString(KEY_USER_DATA, null)
        val handle = sharedPreferences.getString(KEY_USER_HANDLE, null)
        
        return userId != -1 && !userData.isNullOrEmpty() && !handle.isNullOrEmpty()
    }
    
    fun getUserId(): Int {
        return sharedPreferences.getInt(KEY_USER_ID, -1)
    }
    
    fun getUser(): User? {
        val userJson = sharedPreferences.getString(KEY_USER_DATA, null)
        return if (!userJson.isNullOrEmpty()) {
            try {
                gson.fromJson(userJson, User::class.java)
            } catch (e: Exception) {
                null
            }
        } else null
    }
    
    fun getUserHandle(): String? {
        return sharedPreferences.getString(KEY_USER_HANDLE, null)
    }
    
    fun getSourceId(): String? {
        return sharedPreferences.getString(KEY_SOURCE_ID, null)
    }
    
    fun getSessionAge(): Long {
        val loginTimestamp = sharedPreferences.getLong(KEY_LOGIN_TIMESTAMP, 0)
        return if (loginTimestamp > 0) {
            System.currentTimeMillis() - loginTimestamp
        } else 0
    }
    
    fun getSessionAgeInDays(): Int {
        val ageInMs = getSessionAge()
        return TimeUnit.MILLISECONDS.toDays(ageInMs).toInt()
    }
    
    fun clearSession() {
        with(sharedPreferences.edit()) {
            clear()
            apply()
        }
    }
    
    fun refreshSession() {
        if (hasValidUserData()) {
            with(sharedPreferences.edit()) {
                putLong(KEY_LOGIN_TIMESTAMP, System.currentTimeMillis())
                apply()
            }
        }
    }
}