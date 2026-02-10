package com.callsafe.mobile.call

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Android ConnectionService for self-managed calling
 * Integrates CallSafe calls with system telephony UI
 */
class CallConnectionService : ConnectionService() {

    companion object {
        private const val TAG = "CallConnectionService"
        const val PHONE_ACCOUNT_ID = "CallSafe"
        private const val PHONE_ACCOUNT_LABEL = "CallSafe"

        // Active connections keyed by callAttemptId
        private val activeConnections = mutableMapOf<String, CallConnection>()

        // Callbacks to Flutter
        var onAnswerCallback: ((String) -> Unit)? = null
        var onRejectCallback: ((String) -> Unit)? = null
        var onDisconnectCallback: ((String) -> Unit)? = null
        var onMuteChangedCallback: ((String, Boolean) -> Unit)? = null
        var onSpeakerChangedCallback: ((String, Boolean) -> Unit)? = null

        /**
         * Register phone account with system
         * Must be called before showing any calls
         */
        @RequiresApi(Build.VERSION_CODES.O)
        fun registerPhoneAccount(telecomManager: TelecomManager, componentName: ComponentName) {
            val phoneAccountHandle = PhoneAccountHandle(componentName, PHONE_ACCOUNT_ID)

            val phoneAccount = PhoneAccount.builder(phoneAccountHandle, PHONE_ACCOUNT_LABEL)
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED or
                        PhoneAccount.CAPABILITY_SUPPORTS_VIDEO_CALLING)
                .build()

            telecomManager.registerPhoneAccount(phoneAccount)
            Log.d(TAG, "Phone account registered")
        }

        /**
         * Show incoming call in system UI
         */
        @RequiresApi(Build.VERSION_CODES.O)
        fun showIncomingCall(
            telecomManager: TelecomManager,
            componentName: ComponentName,
            callAttemptId: String,
            callerName: String,
            isVideo: Boolean
        ) {
            val phoneAccountHandle = PhoneAccountHandle(componentName, PHONE_ACCOUNT_ID)

            val extras = android.os.Bundle().apply {
                putString("callAttemptId", callAttemptId)
                putString("callerName", callerName)
                putBoolean("isVideo", isVideo)
                putBoolean("isIncoming", true)
            }

            telecomManager.addNewIncomingCall(phoneAccountHandle, extras)
            Log.d(TAG, "Incoming call added to system: $callAttemptId")
        }

        /**
         * Start outgoing call in system UI
         */
        @RequiresApi(Build.VERSION_CODES.O)
        fun startOutgoingCall(
            telecomManager: TelecomManager,
            componentName: ComponentName,
            callAttemptId: String,
            recipientName: String,
            isVideo: Boolean
        ) {
            val phoneAccountHandle = PhoneAccountHandle(componentName, PHONE_ACCOUNT_ID)

            val extras = android.os.Bundle().apply {
                putString("callAttemptId", callAttemptId)
                putString("recipientName", recipientName)
                putBoolean("isVideo", isVideo)
                putBoolean("isIncoming", false)
            }

            val uri = Uri.fromParts("tel", recipientName, null)

            telecomManager.placeCall(uri, extras.apply {
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle)
            })
            Log.d(TAG, "Outgoing call started: $callAttemptId")
        }

        /**
         * End a call from Flutter
         */
        fun endCall(callAttemptId: String) {
            activeConnections[callAttemptId]?.setCallDisconnected()
            activeConnections.remove(callAttemptId)
        }

        /**
         * Update call to active state
         */
        fun setCallActive(callAttemptId: String) {
            activeConnections[callAttemptId]?.setCallActive()
        }
    }

    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): CallConnection? {
        Log.d(TAG, "onCreateIncomingConnection")

        val extras = request?.extras ?: return null
        val callAttemptId = extras.getString("callAttemptId") ?: return null
        val callerName = extras.getString("callerName", "Unknown")

        val connection = CallConnection(
            callAttemptId = callAttemptId,
            isIncoming = true,
            onAnswer = { id -> onAnswerCallback?.invoke(id) },
            onReject = { id ->
                onRejectCallback?.invoke(id)
                activeConnections.remove(id)
            },
            onDisconnect = { id ->
                onDisconnectCallback?.invoke(id)
                activeConnections.remove(id)
            },
            onMuteChanged = { id, muted -> onMuteChangedCallback?.invoke(id, muted) },
            onSpeakerChanged = { id, speaker -> onSpeakerChangedCallback?.invoke(id, speaker) }
        )

        connection.setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
        activeConnections[callAttemptId] = connection

        return connection
    }

    override fun onCreateOutgoingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): CallConnection? {
        Log.d(TAG, "onCreateOutgoingConnection")

        val extras = request?.extras ?: return null
        val callAttemptId = extras.getString("callAttemptId") ?: return null
        val recipientName = extras.getString("recipientName", "Unknown")

        val connection = CallConnection(
            callAttemptId = callAttemptId,
            isIncoming = false,
            onAnswer = { id -> onAnswerCallback?.invoke(id) },
            onReject = { id ->
                onRejectCallback?.invoke(id)
                activeConnections.remove(id)
            },
            onDisconnect = { id ->
                onDisconnectCallback?.invoke(id)
                activeConnections.remove(id)
            },
            onMuteChanged = { id, muted -> onMuteChangedCallback?.invoke(id, muted) },
            onSpeakerChanged = { id, speaker -> onSpeakerChangedCallback?.invoke(id, speaker) }
        )

        connection.setCallerDisplayName(recipientName, TelecomManager.PRESENTATION_ALLOWED)
        activeConnections[callAttemptId] = connection

        return connection
    }
}
