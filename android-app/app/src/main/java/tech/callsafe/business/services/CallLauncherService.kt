package tech.callsafe.business.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import tech.callsafe.business.R
import tech.callsafe.business.activities.ActiveCallActivity

class CallLauncherService : Service() {
    
    companion object {
        private const val TAG = "CallLauncherService"
        private const val FOREGROUND_ID = 2001
        private const val CHANNEL_ID = "call_launcher"
        const val ACTION_LAUNCH_ACTIVE_CALL = "tech.callsafe.business.LAUNCH_ACTIVE_CALL"
        
        fun startActiveCall(context: Context, callAttemptId: String, sourceId: String?) {
            val intent = Intent(context, CallLauncherService::class.java).apply {
                action = ACTION_LAUNCH_ACTIVE_CALL
                putExtra("callAttemptId", callAttemptId)
                putExtra("sourceId", sourceId)
            }
            context.startForegroundService(intent)
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        android.util.Log.d(TAG, "[SERVICE] onCreate() - CallLauncherService created")
        createNotificationChannel()
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        android.util.Log.d(TAG, "[SERVICE] onStartCommand() - Service started with action: ${intent?.action}")
        
        // Start foreground immediately to get activity launch privileges
        startForeground(FOREGROUND_ID, createForegroundNotification())
        
        when (intent?.action) {
            ACTION_LAUNCH_ACTIVE_CALL -> {
                val callAttemptId = intent.getStringExtra("callAttemptId")
                val sourceId = intent.getStringExtra("sourceId")
                
                android.util.Log.d(TAG, "[SERVICE] Launching ActiveCallActivity - callAttemptId: $callAttemptId, sourceId: $sourceId")
                
                if (callAttemptId != null) {
                    launchActiveCallActivity(callAttemptId, sourceId)
                } else {
                    android.util.Log.e(TAG, "[SERVICE] ERROR: callAttemptId is null")
                }
                
                // Stop the service after launching activity
                stopSelf()
            }
        }
        
        return START_NOT_STICKY
    }
    
    private fun launchActiveCallActivity(callAttemptId: String, sourceId: String?) {
        try {
            val activityIntent = Intent(this, ActiveCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("callAttemptId", callAttemptId)
                putExtra("sourceId", sourceId)
                putExtra("autoAccept", true) // Auto-accept since user clicked answer
            }
            
            android.util.Log.d(TAG, "[SERVICE] Starting ActiveCallActivity from foreground service")
            startActivity(activityIntent)
            android.util.Log.d(TAG, "[SERVICE] ActiveCallActivity startActivity() called successfully")
            
        } catch (e: Exception) {
            android.util.Log.e(TAG, "[SERVICE] ERROR launching ActiveCallActivity", e)
        }
    }
    
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Call Launcher",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Temporary service to launch call screen"
            setShowBadge(false)
        }
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.createNotificationChannel(channel)
    }
    
    private fun createForegroundNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Connecting call...")
            .setContentText("Opening call screen")
            .setSmallIcon(R.drawable.ic_call)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }
}