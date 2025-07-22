package com.callsafe.androidapp.utils

import android.content.Context
import android.media.MediaPlayer
import android.util.Log

class RingtonePlayer(private val context: Context) {
    
    companion object {
        private const val TAG = "RingtonePlayer"
    }
    
    private var mediaPlayer: MediaPlayer? = null
    
    fun startRinging() {
        try {
            stopRinging() // Stop any existing ringtone
            
            mediaPlayer = MediaPlayer.create(context, com.callsafe.androidapp.R.raw.ringtone)
            mediaPlayer?.apply {
                isLooping = true
                start()
                Log.d(TAG, "🔔 Ringtone started")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start ringtone", e)
        }
    }
    
    fun stopRinging() {
        try {
            mediaPlayer?.apply {
                if (isPlaying) {
                    stop()
                    Log.d(TAG, "🔇 Ringtone stopped")
                }
                release()
            }
            mediaPlayer = null
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to stop ringtone", e)
        }
    }
    
    fun isRinging(): Boolean {
        return mediaPlayer?.isPlaying == true
    }
    
    fun dispose() {
        stopRinging()
    }
}