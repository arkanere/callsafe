package tech.callsafe.business.models

data class LoginRequest(
    val email: String,
    val password: String
)