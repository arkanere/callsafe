package com.callsafe.androidapp.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.callsafe.androidapp.service.CallSafeService
import com.callsafe.androidapp.utils.SessionManager

class BootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "🚀 Boot completed received")
        
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val sessionManager = SessionManager.getInstance(context)
            
            // Only start service if user has a valid session
            if (sessionManager.isSessionValid()) {
                Log.i(TAG, "✅ Starting CallSafe service on boot")
                CallSafeService.startService(context)
            } else {
                Log.i(TAG, "⚠️ No valid session, skipping service start")
            }
        }
    }
}