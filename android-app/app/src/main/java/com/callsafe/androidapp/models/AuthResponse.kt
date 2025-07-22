package com.callsafe.androidapp.models

data class AuthResponse(
    val success: Boolean,
    val message: String? = null,
    val user: User? = null,
    val error: String? = null
)