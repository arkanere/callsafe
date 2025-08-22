package tech.callsafe.business.activities

import android.content.Intent
import android.os.Bundle
import android.view.MotionEvent
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import tech.callsafe.business.databinding.ActivityIncomingCallBinding
import tech.callsafe.business.managers.CallManager
import tech.callsafe.business.utils.getUniqueDeviceId
import tech.callsafe.business.utils.RingtoneManager

class IncomingCallActivity : AppCompatActivity() {
    private lateinit var binding: ActivityIncomingCallBinding
    private lateinit var callManager: CallManager
    private var callAttemptId: String? = null
    private var sourceId: String? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        android.util.Log.d("IncomingCallActivity", "[FLOW] onCreate() - IncomingCallActivity started")
        
        // Configure full-screen incoming call
        window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )
        
        binding = ActivityIncomingCallBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        callManager = CallManager.getInstance(this)
        
        // Extract call data from intent
        callAttemptId = intent.getStringExtra("callAttemptId")
        sourceId = intent.getStringExtra("sourceId")
        val timestamp = intent.getLongExtra("timestamp", 0)
        
        android.util.Log.d("IncomingCallActivity", "[FLOW] onCreate() - Call data: callAttemptId=$callAttemptId, sourceId=$sourceId")
        android.util.Log.d("IncomingCallActivity", "[FLOW] onCreate() - Calling setupUI()")
        setupUI()
        android.util.Log.d("IncomingCallActivity", "[FLOW] onCreate() - Calling setupClickListeners()")
        setupClickListeners()
    }
    
    private fun setupUI() {
        android.util.Log.d("IncomingCallActivity", "[FLOW] setupUI() - Setting up incoming call UI")
        binding.apply {
            callerInfo.text = sourceId ?: "Customer"
            callTime.text = "Incoming call..."
            
            // Set up ripple effects for all buttons
            acceptButton.setOnTouchListener { view, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        view.animate().scaleX(0.9f).scaleY(0.9f).setDuration(100).start()
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        view.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start()
                    }
                }
                false
            }
            
            declineButton.setOnTouchListener { view, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        view.animate().scaleX(0.9f).scaleY(0.9f).setDuration(100).start()
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        view.animate().scaleX(1.0f).scaleY(1.0f).setDuration(100).start()
                    }
                }
                false
            }
            
        }
    }
    
    private fun setupClickListeners() {
        android.util.Log.d("IncomingCallActivity", "[FLOW] setupClickListeners() - Setting up button click handlers")
        binding.acceptButton.setOnClickListener {
            android.util.Log.d("IncomingCallActivity", "[FLOW] Accept button clicked - Calling acceptCall()")
            acceptCall()
        }
        
        binding.declineButton.setOnClickListener {
            android.util.Log.d("IncomingCallActivity", "[FLOW] Decline button clicked - Calling declineCall()")
            declineCall()
        }
        
    }
    
    private fun acceptCall() {
        android.util.Log.d("IncomingCallActivity", "[FLOW] acceptCall() - User accepted the call")
        // Stop ringtone
        RingtoneManager.getInstance(this).stopRingtone()
        
        callAttemptId?.let { id ->
            // Route through ActiveCallActivity with autoAccept to ensure proper socket connection handling
            android.util.Log.d("IncomingCallActivity", "[FLOW] acceptCall() - Routing to ActiveCallActivity with autoAccept")
            val intent = Intent(this, ActiveCallActivity::class.java).apply {
                putExtra("callAttemptId", id)
                putExtra("sourceId", sourceId)
                putExtra("autoAccept", true) // This triggers ensureSocketConnectionAndAccept()
            }
            startActivity(intent)
            finish()
        }
    }
    
    private fun declineCall() {
        android.util.Log.d("IncomingCallActivity", "[FLOW] declineCall() - User declined the call")
        // Stop ringtone
        RingtoneManager.getInstance(this).stopRingtone()
        
        callAttemptId?.let { id ->
            android.util.Log.d("IncomingCallActivity", "[FLOW] declineCall() - Calling CallManager.rejectCall()")
            callManager.rejectCall(
                callAttemptId = id,
                deviceType = "mobile"
            )
            finish()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        android.util.Log.d("IncomingCallActivity", "[FLOW] onDestroy() - IncomingCallActivity destroyed")
        
        // Stop ringtone if activity is destroyed
        RingtoneManager.getInstance(this).stopRingtone()
        
        // Cancel notification if activity is destroyed via CallNotificationManager
        callAttemptId?.let { id ->
            val notificationManager = tech.callsafe.business.managers.CallNotificationManager.getInstance(this)
            notificationManager.cancelNotification(id)
        }
    }
}