package tech.callsafe.business.utils

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log

class RingtoneManager private constructor(private val context: Context) {
    
    companion object {
        private const val TAG = "RingtoneManager"
        
        @Volatile
        private var INSTANCE: RingtoneManager? = null
        
        fun getInstance(context: Context): RingtoneManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: RingtoneManager(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    private var mediaPlayer: MediaPlayer? = null
    private var audioManager: AudioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private var isPlaying = false
    
    private val audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        Log.d(TAG, "Audio focus changed: $focusChange")
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                Log.d(TAG, "Audio focus lost, stopping ringtone")
                stopRingtone()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                Log.d(TAG, "Audio focus lost with duck, lowering volume")
                mediaPlayer?.setVolume(0.3f, 0.3f)
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                Log.d(TAG, "Audio focus gained, restoring volume")
                mediaPlayer?.setVolume(1.0f, 1.0f)
            }
        }
    }
    
    fun startRingtone() {
        Log.d(TAG, "startRingtone() called, isPlaying: $isPlaying")
        
        if (isPlaying) {
            Log.d(TAG, "Ringtone already playing, ignoring")
            return
        }
        
        try {
            // Check if device is in silent mode
            if (audioManager.ringerMode == AudioManager.RINGER_MODE_SILENT) {
                Log.d(TAG, "Device is in silent mode, not playing ringtone")
                return
            }
            
            // Request audio focus
            if (!requestAudioFocus()) {
                Log.w(TAG, "Failed to get audio focus, not playing ringtone")
                return
            }
            
            // Use default ringtone if custom ringtone is not available
            val ringtoneUri = Settings.System.DEFAULT_RINGTONE_URI
            Log.d(TAG, "Using default ringtone: $ringtoneUri")
            
            mediaPlayer = MediaPlayer().apply {
                setDataSource(context, ringtoneUri)
                
                // Set audio attributes for ringtone
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                } else {
                    @Suppress("DEPRECATION")
                    setAudioStreamType(AudioManager.STREAM_RING)
                }
                
                isLooping = true
                setVolume(1.0f, 1.0f)
                
                setOnPreparedListener { player ->
                    Log.d(TAG, "MediaPlayer prepared, starting ringtone")
                    player.start()
                    this@RingtoneManager.isPlaying = true
                }
                
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaPlayer error: what=$what, extra=$extra")
                    stopRingtone()
                    false
                }
                
                prepareAsync()
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting ringtone", e)
            stopRingtone()
        }
    }
    
    fun stopRingtone() {
        Log.d(TAG, "stopRingtone() called, isPlaying: $isPlaying")
        
        try {
            mediaPlayer?.let { player ->
                if (player.isPlaying) {
                    player.stop()
                }
                player.release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping ringtone", e)
        } finally {
            mediaPlayer = null
            isPlaying = false
            releaseAudioFocus()
        }
    }
    
    private fun requestAudioFocus(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener(audioFocusChangeListener)
                .build()
            
            audioManager.requestAudioFocus(audioFocusRequest!!) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                audioFocusChangeListener,
                AudioManager.STREAM_RING,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
    }
    
    private fun releaseAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { request ->
                audioManager.abandonAudioFocusRequest(request)
                audioFocusRequest = null
            }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(audioFocusChangeListener)
        }
    }
    
    fun isRingtonePlaying(): Boolean = isPlaying
}