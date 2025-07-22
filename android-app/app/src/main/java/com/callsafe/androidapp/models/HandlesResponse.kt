package com.callsafe.androidapp.models

data class HandlesResponse(
    val success: Boolean,
    val handles: List<UserHandle> = emptyList(),
    val error: String? = null
)