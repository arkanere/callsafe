package tech.callsafe.business.models

data class LoginResponse(
    val success: Boolean,
    val message: String?,
    val token: String?,
    val user: BusinessUser?
)