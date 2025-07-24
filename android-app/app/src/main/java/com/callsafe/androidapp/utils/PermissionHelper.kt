package com.callsafe.androidapp.utils

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat

object PermissionHelper {
    
    private const val TAG = "PermissionHelper"
    
    /**
     * Check if the app can use full-screen intents
     * Note: canUseFullScreenIntent() is only available on Android 14+ (API 34)
     * For older versions, we assume permission is granted if overlay permission exists
     */
    fun canUseFullScreenIntent(context: Context): Boolean {
        return when {
            Build.VERSION.SDK_INT >= 34 -> {
                // Android 14+ has explicit method to check
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notificationManager.canUseFullScreenIntent()
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> {
                // Android 10-13: Full-screen intents work but may be restricted by system
                // Check if we can draw overlays as a proxy
                canDrawOverlays(context)
            }
            else -> {
                // Android 9 and below: Full-screen intents work without special permission
                true
            }
        }
    }
    
    /**
     * Check if the app can show notifications
     */
    fun canShowNotifications(context: Context): Boolean {
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }
    
    /**
     * Check if the app can draw over other apps (system alert window)
     */
    fun canDrawOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true // Not required on older versions
        }
    }
    
    /**
     * Open the full-screen intent permission settings
     */
    fun openFullScreenIntentSettings(context: Context) {
        try {
            when {
                Build.VERSION.SDK_INT >= 34 -> {
                    // Android 14+: Try to open specific full-screen intent settings
                    // Note: There might not be a direct intent for this, fallback to app settings
                    openAppSettings(context)
                    Log.i(TAG, "📱 Opening app settings for full-screen intent permission")
                }
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> {
                    // Android 10-13: Open overlay permission as it affects full-screen notifications
                    openOverlaySettings(context)
                    Log.i(TAG, "📱 Opening overlay settings for full-screen notifications")
                }
                else -> {
                    // Older versions: Just open notification settings
                    openNotificationSettings(context)
                    Log.i(TAG, "📱 Opening notification settings")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to open full-screen intent settings", e)
            openAppSettings(context)
        }
    }
    
    /**
     * Open the notification settings for the app
     */
    fun openNotificationSettings(context: Context) {
        try {
            val intent = Intent().apply {
                when {
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
                        action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    }
                    else -> {
                        action = "android.settings.APP_NOTIFICATION_SETTINGS"
                        putExtra("app_package", context.packageName)
                        putExtra("app_uid", context.applicationInfo.uid)
                    }
                }
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            Log.i(TAG, "📱 Opening notification settings")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to open notification settings", e)
            openAppSettings(context)
        }
    }
    
    /**
     * Open the overlay permission settings
     */
    fun openOverlaySettings(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
                Log.i(TAG, "📱 Opening overlay permission settings")
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to open overlay settings", e)
            openAppSettings(context)
        }
    }
    
    /**
     * Open the general app settings page
     */
    fun openAppSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            Log.i(TAG, "📱 Opening app settings")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to open app settings", e)
        }
    }
    
    /**
     * Get a human-readable summary of missing permissions
     */
    fun getPermissionStatus(context: Context): String {
        val issues = mutableListOf<String>()
        
        if (!canShowNotifications(context)) {
            issues.add("Notifications disabled")
        }
        
        if (!canUseFullScreenIntent(context)) {
            issues.add("Full-screen notifications disabled")
        }
        
        if (!canDrawOverlays(context)) {
            issues.add("Display over other apps disabled")
        }
        
        return if (issues.isEmpty()) {
            "All permissions granted"
        } else {
            "Issues: ${issues.joinToString(", ")}"
        }
    }
    
    /**
     * Log the current permission status
     */
    fun logPermissionStatus(context: Context) {
        Log.i(TAG, "📋 Permission Status:")
        Log.i(TAG, "  - Notifications: ${canShowNotifications(context)}")
        Log.i(TAG, "  - Full-screen intents: ${canUseFullScreenIntent(context)}")
        Log.i(TAG, "  - Draw overlays: ${canDrawOverlays(context)}")
        Log.i(TAG, "  - Summary: ${getPermissionStatus(context)}")
    }
}