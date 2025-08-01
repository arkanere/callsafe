package tech.callsafe.business.activities

import android.content.Intent
import android.os.Bundle
import android.view.MotionEvent
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import tech.callsafe.business.databinding.ActivityIncomingCallBinding
import tech.callsafe.business.managers.CallManager
import tech.callsafe.business.utils.getUniqueDeviceId

class IncomingCallActivity : AppCompatActivity() {
    private lateinit var binding: ActivityIncomingCallBinding
    private lateinit var callManager: CallManager
    private var callAttemptId: String? = null
    private var sourceId: String? = null
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
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
        
        setupUI()
        setupClickListeners()
    }
    
    private fun setupUI() {
        binding.apply {
            callerInfo.text = "Customer calling from $sourceId"
            callTime.text = "Incoming call..."
            
            // Set up ripple effects for call buttons
            acceptButton.setOnTouchListener { view, event ->
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        view.animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).start()
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
                        view.animate().scaleX(0.95f).scaleY(0.95f).setDuration(100).start()
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
        binding.acceptButton.setOnClickListener {
            acceptCall()
        }
        
        binding.declineButton.setOnClickListener {
            declineCall()
        }
    }
    
    private fun acceptCall() {
        callAttemptId?.let { id ->
            callManager.acceptCall(
                callAttemptId = id,
                deviceType = "mobile",
                deviceId = getUniqueDeviceId(this)
            )
            
            // Navigate to active call activity
            val intent = Intent(this, ActiveCallActivity::class.java).apply {
                putExtra("callAttemptId", id)
                putExtra("sourceId", sourceId)
            }
            startActivity(intent)
            finish()
        }
    }
    
    private fun declineCall() {
        callAttemptId?.let { id ->
            callManager.rejectCall(
                callAttemptId = id,
                deviceType = "mobile"
            )
            finish()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Cancel notification if activity is destroyed
        callAttemptId?.let { id ->
            val notificationManager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            notificationManager.cancel(id.hashCode())
        }
    }
}