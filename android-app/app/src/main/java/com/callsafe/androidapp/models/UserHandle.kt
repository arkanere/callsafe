package com.callsafe.androidapp.models

data class UserHandle(
    val id: Int,
    val handleId: String,
    val handle: String,
    val isEmbedded: Boolean,
    val createdAt: String
)