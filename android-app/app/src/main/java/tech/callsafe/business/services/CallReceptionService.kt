package tech.callsafe.business.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import tech.callsafe.business.R
import tech.callsafe.business.activities.MainActivity
import tech.callsafe.business.managers.SocketManager

class CallReceptionService : Service() {
    private lateinit var socketManager: SocketManager
    private lateinit var notificationManager: NotificationManager
    private var isServiceStarted = false
    
    companion object {
        const val ACTION_START_SERVICE = "START_SERVICE"
        const val ACTION_STOP_SERVICE = "STOP_SERVICE"
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = "call_service_channel"
    }
    
    override fun onCreate() {
        super.onCreate()
        socketManager = SocketManager.getInstance(this)
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SERVICE -> startService()
            ACTION_STOP_SERVICE -> stopService()
        }
        
        return START_STICKY // Restart if killed
    }
    
    private fun startService() {
        if (isServiceStarted) return
        
        isServiceStarted = true
        
        // Connect to signaling server
        socketManager.connect()
        
        // Run as background service without persistent notification
        // FCM will handle incoming call notifications
    }
    
    private fun stopService() {
        isServiceStarted = false
        socketManager.disconnect()
        stopSelf()
    }
    
    private fun createServiceNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CallSafe")
            .setContentText("Ready to receive calls")
            .setSmallIcon(R.drawable.ic_call)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Call Reception Service",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Keeps the app connected to receive calls"
            setShowBadge(false)
        }
        
        notificationManager.createNotificationChannel(channel)
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
}