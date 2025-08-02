package tech.callsafe.business.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import tech.callsafe.business.activities.ActiveCallActivity
import tech.callsafe.business.managers.CallManager
import tech.callsafe.business.utils.getUniqueDeviceId
import tech.callsafe.business.utils.RingtoneManager

class CallActionReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        val callAttemptId = intent.getStringExtra("callAttemptId") ?: return
        val callManager = CallManager.getInstance(context)
        
        when (intent.action) {
            "ACCEPT_CALL" -> {
                // Stop ringtone
                RingtoneManager.getInstance(context).stopRingtone()
                
                // Accept the call
                callManager.acceptCall(
                    callAttemptId = callAttemptId,
                    deviceType = "mobile",
                    deviceId = getUniqueDeviceId(context)
                )
                
                // Start active call activity
                val activeCallIntent = Intent(context, ActiveCallActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("callAttemptId", callAttemptId)
                }
                context.startActivity(activeCallIntent)
                
                // Cancel notification
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                notificationManager.cancel(callAttemptId.hashCode())
            }
            
            "DECLINE_CALL" -> {
                // Stop ringtone
                RingtoneManager.getInstance(context).stopRingtone()
                
                // Decline the call
                callManager.rejectCall(
                    callAttemptId = callAttemptId,
                    deviceType = "mobile"
                )
                
                // Cancel notification
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                notificationManager.cancel(callAttemptId.hashCode())
            }
        }
    }
}