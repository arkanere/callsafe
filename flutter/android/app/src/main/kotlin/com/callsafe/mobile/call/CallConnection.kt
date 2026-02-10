package com.callsafe.mobile.call

import android.net.Uri
import android.os.Build
import android.telecom.CallAudioState
import android.telecom.Connection
import android.telecom.DisconnectCause
import android.util.Log

/**
 * Represents a single call connection in the system
 * Bridges Android Telecom framework with Flutter call logic
 */
class CallConnection(
    private val callAttemptId: String,
    private val isIncoming: Boolean,
    private val onAnswer: (String) -> Unit,
    private val onReject: (String) -> Unit,
    private val onDisconnect: (String) -> Unit,
    private val onMuteChanged: (String, Boolean) -> Unit,
    private val onSpeakerChanged: (String, Boolean) -> Unit
) : Connection() {

    companion object {
        private const val TAG = "CallConnection"
    }

    init {
        Log.d(TAG, "CallConnection created for $callAttemptId (incoming: $isIncoming)")

        // Set initial connection capabilities
        connectionCapabilities = CAPABILITY_SUPPORT_HOLD or
                CAPABILITY_MUTE or
                CAPABILITY_SUPPORTS_VT_LOCAL_BIDIRECTIONAL or
                CAPABILITY_SUPPORTS_VT_REMOTE_BIDIRECTIONAL

        // Set initial connection properties
        connectionProperties = PROPERTY_SELF_MANAGED

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioModeIsVoip = true
        }

        // Set initial state
        if (isIncoming) {
            setRinging()
        } else {
            setDialing()
        }
    }

    override fun onShowIncomingCallUi() {
        Log.d(TAG, "onShowIncomingCallUi for $callAttemptId")
        // Android system wants us to show incoming call UI
        // Flutter UI will handle this
    }

    override fun onAnswer() {
        Log.d(TAG, "onAnswer for $callAttemptId")
        setActive()
        onAnswer(callAttemptId)
    }

    override fun onReject() {
        Log.d(TAG, "onReject for $callAttemptId")
        setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
        destroy()
        onReject(callAttemptId)
    }

    override fun onDisconnect() {
        Log.d(TAG, "onDisconnect for $callAttemptId")
        setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
        destroy()
        onDisconnect(callAttemptId)
    }

    override fun onAbort() {
        Log.d(TAG, "onAbort for $callAttemptId")
        setDisconnected(DisconnectCause(DisconnectCause.CANCELED))
        destroy()
        onDisconnect(callAttemptId)
    }

    override fun onCallAudioStateChanged(state: CallAudioState) {
        Log.d(TAG, "onCallAudioStateChanged: muted=${state.isMuted}, route=${state.route}")

        // Notify Flutter of audio state changes
        onMuteChanged(callAttemptId, state.isMuted)

        val isSpeakerOn = state.route == CallAudioState.ROUTE_SPEAKER
        onSpeakerChanged(callAttemptId, isSpeakerOn)
    }

    override fun onStateChanged(state: Int) {
        Log.d(TAG, "Connection state changed to $state for $callAttemptId")
    }

    // Called from Flutter to update connection state
    fun setCallActive() {
        Log.d(TAG, "setCallActive for $callAttemptId")
        setActive()
    }

    fun setCallDisconnected(cause: Int = DisconnectCause.LOCAL) {
        Log.d(TAG, "setCallDisconnected for $callAttemptId")
        setDisconnected(DisconnectCause(cause))
        destroy()
    }

    fun setCallRinging() {
        Log.d(TAG, "setCallRinging for $callAttemptId")
        setRinging()
    }

    fun setCallDialing() {
        Log.d(TAG, "setCallDialing for $callAttemptId")
        setDialing()
    }
}
