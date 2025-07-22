package com.callsafe.androidapp.models

data class User(
    val id: Int,
    val email: String,
    val name: String,
    val isActive: Boolean,
    val isEmbedded: Boolean,
    val sourceId: String? = null
)