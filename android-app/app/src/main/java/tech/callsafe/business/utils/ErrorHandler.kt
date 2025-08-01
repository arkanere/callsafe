package tech.callsafe.business.utils

import android.content.Context
import androidx.appcompat.app.AlertDialog
import java.net.ConnectException
import java.net.SocketTimeoutException

class ErrorHandler {
    companion object {
        fun handleSocketError(error: Exception, context: Context) {
            when (error) {
                is ConnectException -> {
                    showErrorDialog(context, "Connection Failed", "Unable to connect to server. Please check your internet connection.")
                }
                is SocketTimeoutException -> {
                    showErrorDialog(context, "Connection Timeout", "Connection timed out. Please try again.")
                }
                else -> {
                    showErrorDialog(context, "Connection Error", "An unexpected error occurred. Please try again.")
                }
            }
        }
        
        fun handleCallError(reason: String, context: Context) {
            val message = when (reason) {
                // Server-emitted errors (from signaling server)
                "connection_failed" -> "Call connection failed. Please try again."
                "connection_timeout" -> "Call connection timed out. Please check your network."
                "webrtc_failed" -> "Call setup failed. Please try again."
                
                // Android-specific errors (handled locally, not from server)
                "media_access_failed" -> "Unable to access microphone. Please check permissions."
                "permission_denied" -> "Microphone permission required for calls."
                "audio_focus_failed" -> "Unable to access audio. Please close other audio apps."
                
                else -> "Call failed due to technical issues."
            }
            
            showErrorDialog(context, "Call Failed", message)
        }
        
        private fun showErrorDialog(context: Context, title: String, message: String) {
            AlertDialog.Builder(context)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton("OK", null)
                .show()
        }
    }
}