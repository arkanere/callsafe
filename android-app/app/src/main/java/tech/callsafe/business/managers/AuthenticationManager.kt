package tech.callsafe.business.managers

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import tech.callsafe.business.api.RetrofitClient
import tech.callsafe.business.models.BusinessUser
import tech.callsafe.business.models.LoginRequest
import tech.callsafe.business.models.LoginResponse

class AuthenticationManager(context: Context) {
    private val apiService = RetrofitClient.apiService
    private val sharedPreferences: SharedPreferences = context.getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
    
    companion object {
        private const val TAG = "AuthenticationManager"
        private const val JWT_TOKEN_KEY = "jwt_token"
        private const val TOKEN_EXPIRES_AT = "token_expires_at"
        private const val USER_EMAIL = "user_email"
        private const val USER_HANDLE = "user_handle"
        private const val USER_SOURCE_ID = "user_source_id"
    }
    
    suspend fun login(email: String, password: String): LoginResponse {
        Log.d(TAG, "[AUTH] login() called with email: $email")
        val request = LoginRequest(email, password)
        
        Log.d(TAG, "[AUTH] Making API call to login endpoint")
        val response = apiService.login(request)
        
        Log.d(TAG, "[AUTH] API response received - success: ${response.success}, token: ${if (response.token != null) "[PRESENT]" else "[NULL]"}, user: ${if (response.user != null) "[PRESENT]" else "[NULL]"}")
        
        if (response.success && response.token != null && response.user != null) {
            Log.d(TAG, "[AUTH] Login successful, storing token and user data")
            // Calculate expiration time (24 hours from now, as per frontend JWT)
            val expiresAt = System.currentTimeMillis() + (24 * 60 * 60 * 1000)
            
            Log.d(TAG, "[AUTH] Storing token with expiration: $expiresAt")
            sharedPreferences.edit()
                .putString(JWT_TOKEN_KEY, response.token)
                .putLong(TOKEN_EXPIRES_AT, expiresAt)
                .putString(USER_EMAIL, response.user.email)
                .putString(USER_HANDLE, response.user.handle)
                .putString(USER_SOURCE_ID, response.user.sourceId)
                .putBoolean("is_logged_in", true)
                .apply()
            Log.d(TAG, "[AUTH] Token and user data stored successfully")
        } else {
            Log.w(TAG, "[AUTH] Login failed - not storing credentials")
        }
        
        return response
    }
    
    fun getStoredToken(): String? {
        Log.d(TAG, "[AUTH] getStoredToken() called")
        val token = sharedPreferences.getString(JWT_TOKEN_KEY, null)
        val expiresAt = sharedPreferences.getLong(TOKEN_EXPIRES_AT, 0)
        val currentTime = System.currentTimeMillis()
        
        Log.d(TAG, "[AUTH] Token status - exists: ${token != null}, expiresAt: $expiresAt, currentTime: $currentTime, isValid: ${token != null && currentTime < expiresAt}")
        
        return if (token != null && currentTime < expiresAt) {
            Log.d(TAG, "[AUTH] Returning valid token")
            token
        } else {
            Log.d(TAG, "[AUTH] Token is null or expired, returning null")
            null
        }
    }
    
    // SECURITY: Do not decode JWT locally - rely on server validation only
    // Handle extraction is performed server-side during device registration
    fun isTokenValid(): Boolean {
        Log.d(TAG, "[AUTH] isTokenValid() called")
        val token = getStoredToken()
        val expiresAt = sharedPreferences.getLong(TOKEN_EXPIRES_AT, 0)
        val currentTime = System.currentTimeMillis()
        val isValid = token != null && currentTime < expiresAt
        
        Log.d(TAG, "[AUTH] Token validation - token exists: ${token != null}, currentTime: $currentTime, expiresAt: $expiresAt, isValid: $isValid")
        return isValid
    }
    
    fun getStoredUser(): BusinessUser? {
        Log.d(TAG, "[AUTH] getStoredUser() called")
        val email = sharedPreferences.getString(USER_EMAIL, null)
        val handle = sharedPreferences.getString(USER_HANDLE, null)
        val sourceId = sharedPreferences.getString(USER_SOURCE_ID, null)
        
        return if (email != null && handle != null && sourceId != null) {
            Log.d(TAG, "[AUTH] Returning stored user data")
            BusinessUser(email, handle, sourceId)
        } else {
            Log.d(TAG, "[AUTH] No complete user data found")
            null
        }
    }
    
    fun logout() {
        Log.d(TAG, "[AUTH] logout() called - clearing stored credentials")
        sharedPreferences.edit()
            .remove(JWT_TOKEN_KEY)
            .remove(TOKEN_EXPIRES_AT)
            .remove(USER_EMAIL)
            .remove(USER_HANDLE)
            .remove(USER_SOURCE_ID)
            .remove("is_logged_in")
            .apply()
        Log.d(TAG, "[AUTH] Logout complete - all credentials cleared")
    }
}