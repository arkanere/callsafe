package com.callsafe.androidapp.models

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

@Parcelize
data class CallHistoryItem(
    val callId: String,
    val timestamp: Long,
    val duration: Int, // in seconds
    val status: String, // completed, missed, failed, cancelled, timeout
    val sourceId: String,
    val reason: String
) : Parcelable