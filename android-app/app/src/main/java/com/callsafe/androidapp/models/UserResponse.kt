package com.callsafe.androidapp.models

data class UserResponse(
    val success: Boolean,
    val user: User? = null,
    val error: String? = null
)