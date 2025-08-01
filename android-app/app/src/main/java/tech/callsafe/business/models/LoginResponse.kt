package tech.callsafe.business.models

data class LoginResponse(
    val success: Boolean,
    val token: String,
    val user: BusinessUser,
    val expiresAt: Long
)