package com.callsafe.androidapp.models

data class IncomingCall(
    val callId: String,
    val timestamp: Long,
    val sourceId: String,
    var action: String = ""
)