package com.callsafe.mobile.call

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.callsafe.mobile.MainActivity
import com.callsafe.mobile.R

/**
 * Foreground service to keep call alive when app is backgrounded
 * Required on Android 8.0+ for background WebRTC connections
 */
class CallForegroundService : Service() {

    companion object {
        private const val TAG = "CallForegroundService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "callsafe_active_call"
        private const val CHANNEL_NAME = "Active Calls"

        private var isServiceRunning = false

        /**
         * Start foreground service for an active call
         */
        fun startService(context: Context, callAttemptId: String, callerName: String) {
            if (isServiceRunning) {
                Log.d(TAG, "Service already running, updating notification")
                updateNotification(context, callAttemptId, callerName)
                return
            }

            val intent = Intent(context, CallForegroundService::class.java).apply {
                putExtra("callAttemptId", callAttemptId)
                putExtra("callerName", callerName)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            Log.d(TAG, "Foreground service started")
        }

        /**
         * Stop foreground service
         */
        fun stopService(context: Context) {
            val intent = Intent(context, CallForegroundService::class.java)
            context.stopService(intent)
            isServiceRunning = false
            Log.d(TAG, "Foreground service stopped")
        }

        /**
         * Update notification with new call info
         */
        private fun updateNotification(context: Context, callAttemptId: String, callerName: String) {
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val notification = buildNotification(context, callAttemptId, callerName)
            notificationManager.notify(NOTIFICATION_ID, notification)
        }

        private fun buildNotification(
            context: Context,
            callAttemptId: String,
            callerName: String
        ): Notification {
            createNotificationChannel(context)

            // Intent to open app when notification is tapped
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("callAttemptId", callAttemptId)
            }

            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle("CallSafe - Active Call")
                .setContentText("In call with $callerName")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
        }

        private fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Notification for active calls"
                    setSound(null, null)
                }

                val notificationManager =
                    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.createNotificationChannel(channel)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand")

        val callAttemptId = intent?.getStringExtra("callAttemptId") ?: "Unknown"
        val callerName = intent?.getStringExtra("callerName") ?: "Unknown"

        val notification = buildNotification(this, callAttemptId, callerName)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        isServiceRunning = true

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceRunning = false
        Log.d(TAG, "Service destroyed")
    }
}
