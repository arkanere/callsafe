package com.callsafe.androidapp.models

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class IncomingCall(
    val callId: String,
    val sourceId: String,
    val timestamp: Long,
    val timeout: Long = timestamp + 30000, // 30 second timeout
    var action: String = ""
) : Parcelable