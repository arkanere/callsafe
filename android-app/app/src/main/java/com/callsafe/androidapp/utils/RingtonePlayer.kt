package com.callsafe.androidapp.utils

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.util.Log

class RingtonePlayer(private val context: Context) : AudioManager.OnAudioFocusChangeListener {
    
    companion object {
        private const val TAG = "RingtonePlayer"
    }
    
    private var mediaPlayer: MediaPlayer? = null
    private var audioManager: AudioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false
    
    fun startRinging() {
        Log.d(TAG, "🎵 startRinging() called")
        
        try {
            stopRinging() // Stop any existing ringtone
            
            // Check if device is in silent mode
            val ringerMode = audioManager.ringerMode
            Log.d(TAG, "📱 Device ringer mode: $ringerMode (SILENT=${AudioManager.RINGER_MODE_SILENT}, VIBRATE=${AudioManager.RINGER_MODE_VIBRATE}, NORMAL=${AudioManager.RINGER_MODE_NORMAL})")
            
            if (ringerMode == AudioManager.RINGER_MODE_SILENT) {
                Log.w(TAG, "🔇 Device is in silent mode - ringtone will not play")
                return
            }
            
            // Request audio focus
            if (!requestAudioFocus()) {
                Log.e(TAG, "❌ Failed to get audio focus - cannot play ringtone")
                return
            }
            
            Log.d(TAG, "🎵 Creating MediaPlayer for ringtone")
            mediaPlayer = MediaPlayer().apply {
                // Set audio attributes for ringtone
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    val audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setLegacyStreamType(AudioManager.STREAM_RING)
                        .build()
                    setAudioAttributes(audioAttributes)
                    Log.d(TAG, "🎵 Audio attributes set for API >= 21")
                } else {
                    @Suppress("DEPRECATION")
                    setAudioStreamType(AudioManager.STREAM_RING)
                    Log.d(TAG, "🎵 Audio stream type set for API < 21")
                }
                
                // Set data source
                val afd = context.resources.openRawResourceFd(com.callsafe.androidapp.R.raw.ringtone)
                if (afd != null) {
                    setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                    afd.close()
                    Log.d(TAG, "🎵 Data source set successfully")
                } else {
                    Log.e(TAG, "❌ Failed to open ringtone resource")
                    return
                }
                
                // Configure playback
                isLooping = true
                
                // Prepare and start
                prepare()
                Log.d(TAG, "🎵 MediaPlayer prepared")
                
                start()
                Log.i(TAG, "🔔 Ringtone started successfully! Volume: ${audioManager.getStreamVolume(AudioManager.STREAM_RING)}/${audioManager.getStreamMaxVolume(AudioManager.STREAM_RING)}")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start ringtone", e)
            e.printStackTrace()
            releaseAudioFocus()
        }
    }
    
    fun stopRinging() {
        Log.d(TAG, "🔇 stopRinging() called")
        
        try {
            mediaPlayer?.apply {
                if (isPlaying) {
                    stop()
                    Log.d(TAG, "🔇 MediaPlayer stopped")
                } else {
                    Log.d(TAG, "🔇 MediaPlayer was not playing")
                }
                release()
                Log.d(TAG, "🔇 MediaPlayer released")
            }
            mediaPlayer = null
            
            // Release audio focus
            releaseAudioFocus()
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to stop ringtone", e)
            e.printStackTrace()
        }
    }
    
    fun isRinging(): Boolean {
        val isPlaying = mediaPlayer?.isPlaying == true
        Log.d(TAG, "🎵 isRinging() = $isPlaying")
        return isPlaying
    }
    
    fun dispose() {
        Log.d(TAG, "🧹 dispose() called")
        stopRinging()
    }
    
    private fun requestAudioFocus(): Boolean {
        Log.d(TAG, "🎧 Requesting audio focus")
        
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // API 26+ - use AudioFocusRequest
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
                
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(audioAttributes)
                .setAcceptsDelayedFocusGain(false)
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener(this)
                .build()
                
            val result = audioManager.requestAudioFocus(audioFocusRequest!!)
            hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            
            Log.d(TAG, "🎧 Audio focus request result (API 26+): $result, hasAudioFocus: $hasAudioFocus")
            hasAudioFocus
        } else {
            // API < 26 - use deprecated method
            @Suppress("DEPRECATION")
            val result = audioManager.requestAudioFocus(
                this,
                AudioManager.STREAM_RING,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            )
            hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            
            Log.d(TAG, "🎧 Audio focus request result (API < 26): $result, hasAudioFocus: $hasAudioFocus")
            hasAudioFocus
        }
    }
    
    private fun releaseAudioFocus() {
        Log.d(TAG, "🎧 Releasing audio focus")
        
        if (hasAudioFocus) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest?.let { request ->
                    val result = audioManager.abandonAudioFocusRequest(request)
                    Log.d(TAG, "🎧 Audio focus release result (API 26+): $result")
                }
                audioFocusRequest = null
            } else {
                @Suppress("DEPRECATION")
                val result = audioManager.abandonAudioFocus(this)
                Log.d(TAG, "🎧 Audio focus release result (API < 26): $result")
            }
            hasAudioFocus = false
        } else {
            Log.d(TAG, "🎧 No audio focus to release")
        }
    }
    
    override fun onAudioFocusChange(focusChange: Int) {
        Log.d(TAG, "🎧 onAudioFocusChange: $focusChange")
        
        when (focusChange) {
            AudioManager.AUDIOFOCUS_GAIN -> {
                Log.d(TAG, "🎧 Audio focus gained")
                hasAudioFocus = true
                // Resume ringtone if it was paused
                mediaPlayer?.let { player ->
                    if (!player.isPlaying) {
                        try {
                            player.start()
                            Log.d(TAG, "🔔 Ringtone resumed after gaining focus")
                        } catch (e: Exception) {
                            Log.e(TAG, "❌ Failed to resume ringtone", e)
                        }
                    }
                }
            }
            AudioManager.AUDIOFOCUS_LOSS -> {
                Log.d(TAG, "🎧 Audio focus lost permanently")
                hasAudioFocus = false
                stopRinging()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                Log.d(TAG, "🎧 Audio focus lost temporarily")
                hasAudioFocus = false
                mediaPlayer?.let { player ->
                    if (player.isPlaying) {
                        player.pause()
                        Log.d(TAG, "🔇 Ringtone paused due to transient focus loss")
                    }
                }
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                Log.d(TAG, "🎧 Audio focus lost temporarily (can duck)")
                // Keep playing but at lower volume - MediaPlayer doesn't support ducking directly
                // So we'll just log it and continue playing
            }
            else -> {
                Log.w(TAG, "🎧 Unknown audio focus change: $focusChange")
            }
        }
    }
}