package tech.callsafe.business

import android.app.Application
import tech.callsafe.business.managers.CallNotificationManager
import tech.callsafe.business.utils.RingtoneManager
import kotlin.concurrent.thread

class CallSafeApplication : Application() {
    
    override fun onCreate() {
        super.onCreate()
        android.util.Log.d("CallSafeApplication", "[APP] onCreate() - Initializing application")
        
        // Pre-initialize expensive singletons on background thread to reduce cold start delay
        thread(name = "PreWarm") {
            android.util.Log.d("CallSafeApplication", "[APP] Pre-warming critical components")
            try {
                // Pre-initialize RingtoneManager - prepares audio system
                RingtoneManager.getInstance(this@CallSafeApplication)
                android.util.Log.d("CallSafeApplication", "[APP] RingtoneManager pre-warmed")
                
                // Pre-initialize CallNotificationManager - creates notification channel
                CallNotificationManager.getInstance(this@CallSafeApplication)
                android.util.Log.d("CallSafeApplication", "[APP] CallNotificationManager pre-warmed")
                
                android.util.Log.d("CallSafeApplication", "[APP] Pre-warming completed successfully")
            } catch (e: Exception) {
                android.util.Log.e("CallSafeApplication", "[APP] Error during pre-warming", e)
            }
        }
    }
}