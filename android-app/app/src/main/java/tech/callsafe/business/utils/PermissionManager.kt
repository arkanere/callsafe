package tech.callsafe.business.utils

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class PermissionManager(private val activity: Activity) {
    companion object {
        const val MICROPHONE_PERMISSION_REQUEST = 1001
        const val NOTIFICATION_PERMISSION_REQUEST = 1002
        const val PHONE_PERMISSION_REQUEST = 1003
    }
    
    fun requestAllPermissions() {
        val permissions = mutableListOf<String>()
        
        // Microphone permission (required)
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) 
            != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.RECORD_AUDIO)
        }
        
        // Notification permission (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) 
                != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        
        // Phone permission for call handling
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.USE_FULL_SCREEN_INTENT) 
            != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.USE_FULL_SCREEN_INTENT)
        }
        
        if (permissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(activity, permissions.toTypedArray(), MICROPHONE_PERMISSION_REQUEST)
        }
    }
    
    fun hasAllRequiredPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }
}