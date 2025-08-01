package tech.callsafe.business.utils

import android.util.Base64
import org.json.JSONObject

class SecurityUtils {
    companion object {
        fun validateCallAttemptId(callAttemptId: String): Boolean {
            // UUID format validation
            val uuidRegex = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
            return uuidRegex.matches(callAttemptId)
        }
        
        fun validateHandle(handle: String): Boolean {
            // Handle format validation (16 hex characters)
            val handleRegex = Regex("^[a-f0-9]{16}$")
            return handleRegex.matches(handle)
        }
        
        fun extractHandleFromJWT(token: String): String? {
            return try {
                val parts = token.split(".")
                if (parts.size == 3) {
                    val payload = String(Base64.decode(parts[1], Base64.URL_SAFE))
                    JSONObject(payload).optString("handle")
                } else {
                    null
                }
            } catch (e: Exception) {
                null
            }
        }
        
        fun sanitizeSourceId(sourceId: String): String {
            // Remove dangerous characters and limit length
            return sourceId.replace(Regex("[<>'\"&]"), "").take(50)
        }
        
        fun validateJWTToken(token: String): Boolean {
            // Basic JWT format validation (3 parts separated by dots)
            val parts = token.split(".")
            return parts.size == 3 && parts.all { it.isNotEmpty() }
        }
    }
}