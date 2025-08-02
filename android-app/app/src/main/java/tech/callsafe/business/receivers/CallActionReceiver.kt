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
        android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Notification action received")
        val callAttemptId = intent.getStringExtra("callAttemptId") ?: return
        val callManager = CallManager.getInstance(context)
        android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Action: ${intent.action}, callAttemptId: $callAttemptId")
        
        when (intent.action) {
            "ACCEPT_CALL" -> {
                android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Processing ACCEPT_CALL action")
                // Stop ringtone
                RingtoneManager.getInstance(context).stopRingtone()
                
                // Accept the call
                android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Calling CallManager.acceptCall()")
                callManager.acceptCall(
                    callAttemptId = callAttemptId,
                    deviceType = "mobile",
                    deviceId = getUniqueDeviceId(context)
                )
                
                // Start active call activity
                android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Starting ActiveCallActivity from notification")
                val activeCallIntent = Intent(context, ActiveCallActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("callAttemptId", callAttemptId)
                }
                context.startActivity(activeCallIntent)
                
                // Cancel notification
                android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Cancelling notification after accept")
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                notificationManager.cancel(callAttemptId.hashCode())
            }
            
            "DECLINE_CALL" -> {
                android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Processing DECLINE_CALL action")
                // Stop ringtone
                RingtoneManager.getInstance(context).stopRingtone()
                
                // Decline the call
                android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Calling CallManager.rejectCall()")
                callManager.rejectCall(
                    callAttemptId = callAttemptId,
                    deviceType = "mobile"
                )
                
                // Cancel notification
                android.util.Log.d("CallActionReceiver", "[FLOW] onReceive() - Cancelling notification after decline")
                val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                notificationManager.cancel(callAttemptId.hashCode())
            }
        }
    }
}