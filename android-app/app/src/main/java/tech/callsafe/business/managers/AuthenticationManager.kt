package tech.callsafe.business.managers

import android.content.Context
import android.content.SharedPreferences
import tech.callsafe.business.api.RetrofitClient
import tech.callsafe.business.models.LoginRequest
import tech.callsafe.business.models.LoginResponse

class AuthenticationManager(context: Context) {
    private val apiService = RetrofitClient.apiService
    private val sharedPreferences: SharedPreferences = context.getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
    
    companion object {
        private const val JWT_TOKEN_KEY = "jwt_token"
        private const val TOKEN_EXPIRES_AT = "token_expires_at"
        private const val USER_EMAIL = "user_email"
    }
    
    suspend fun login(email: String, password: String): LoginResponse {
        val request = LoginRequest(email, password)
        val response = apiService.login(request)
        
        if (response.success) {
            // Store JWT token only - handle extracted from token when needed
            sharedPreferences.edit()
                .putString(JWT_TOKEN_KEY, response.token)
                .putLong(TOKEN_EXPIRES_AT, response.expiresAt)
                .putString(USER_EMAIL, response.user.email)
                .apply()
        }
        
        return response
    }
    
    fun getStoredToken(): String? {
        val token = sharedPreferences.getString(JWT_TOKEN_KEY, null)
        val expiresAt = sharedPreferences.getLong(TOKEN_EXPIRES_AT, 0)
        
        return if (token != null && System.currentTimeMillis() < expiresAt) {
            token
        } else {
            null
        }
    }
    
    // SECURITY: Do not decode JWT locally - rely on server validation only
    // Handle extraction is performed server-side during device registration
    fun isTokenValid(): Boolean {
        val token = getStoredToken()
        val expiresAt = sharedPreferences.getLong(TOKEN_EXPIRES_AT, 0)
        return token != null && System.currentTimeMillis() < expiresAt
    }
    
    fun logout() {
        sharedPreferences.edit()
            .remove(JWT_TOKEN_KEY)
            .remove(TOKEN_EXPIRES_AT)
            .remove(USER_EMAIL)
            .apply()
    }
}