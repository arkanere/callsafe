package tech.callsafe.business.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import tech.callsafe.business.managers.AuthenticationManager
import tech.callsafe.business.services.CallReceptionService

class BootReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || 
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            
            // Check if user is authenticated
            val authManager = AuthenticationManager(context)
            if (authManager.isTokenValid()) {
                // Start call reception service automatically
                val serviceIntent = Intent(context, CallReceptionService::class.java).apply {
                    action = CallReceptionService.ACTION_START_SERVICE
                }
                ContextCompat.startForegroundService(context, serviceIntent)
            }
        }
    }
}