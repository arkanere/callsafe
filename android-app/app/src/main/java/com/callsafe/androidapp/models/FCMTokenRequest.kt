package com.callsafe.androidapp.models

data class FCMTokenRequest(
    val handle: String,
    val fcmToken: String,
    val platform: String,
    val sourceId: String?
)

data class FCMTokenResponse(
    val success: Boolean,
    val message: String,
    val timestamp: String
)