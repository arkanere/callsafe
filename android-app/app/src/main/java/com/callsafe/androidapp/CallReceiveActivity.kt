package com.callsafe.androidapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.callsafe.androidapp.base.CallSafeBaseActivity
import com.callsafe.androidapp.models.*
import com.callsafe.androidapp.service.CallSafeServiceContract

/**
 * Consolidated activity for handling all call reception scenarios
 * Replaces the fragmented UserReceiveActivity and IncomingCallActivity
 * Designed with multi-device coordination awareness
 */
class CallReceiveActivity : CallSafeBaseActivity() {
    
    companion object {
        private const val TAG = "CallReceiveActivity"
    }
    
    // UI Components
    private lateinit var statusText: TextView
    private lateinit var callerInfoText: TextView
    private lateinit var deviceStatusText: TextView
    private lateinit var acceptButton: Button
    private lateinit var declineButton: Button
    private lateinit var endButton: Button
    private lateinit var muteButton: Button
    
    // Multi-device broadcast receiver
    private val multiDeviceBroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                CallSafeServiceContract.ACTION_MULTI_DEVICE_STATE_CHANGED -> {
                    val state = intent.getParcelableExtra<MultiDeviceCallState>(
                        CallSafeServiceContract.EXTRA_MULTI_DEVICE_STATE
                    )
                    if (state != null) {
                        handleMultiDeviceStateChange(state)
                    }
                }
                CallSafeServiceContract.ACTION_CALL_ANSWERED_ELSEWHERE -> {
                    val deviceType = intent.getStringExtra(CallSafeServiceContract.EXTRA_DEVICE_TYPE) ?: "web"
                    val callId = intent.getStringExtra(CallSafeServiceContract.EXTRA_CALL_ID) ?: ""
                    handleCallAcceptedOnOtherDevice(callId, deviceType)
                }
            }
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_call_receive)
        
        Log.i(TAG, "🏗️ CallReceiveActivity created")
        
        initializeViews()
        setupEventListeners()
        
        // Start the service when activity is created
        startCallSafeService()
        
        // Process any intent data (for FCM launches)
        processIntent(intent)
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        Log.i(TAG, "🔄 New intent received")
        processIntent(intent)
    }
    
    override fun onResume() {
        super.onResume()
        
        // Register for multi-device broadcasts
        val filter = IntentFilter().apply {
            addAction(CallSafeServiceContract.ACTION_MULTI_DEVICE_STATE_CHANGED)
            addAction(CallSafeServiceContract.ACTION_CALL_ANSWERED_ELSEWHERE)
        }
        LocalBroadcastManager.getInstance(this)
            .registerReceiver(multiDeviceBroadcastReceiver, filter)
        
        // Update UI with current state
        updateUI()
    }
    
    override fun onPause() {
        super.onPause()
        
        // Unregister multi-device broadcasts
        LocalBroadcastManager.getInstance(this)
            .unregisterReceiver(multiDeviceBroadcastReceiver)
    }
    
    private fun initializeViews() {
        statusText = findViewById(R.id.statusText)
        callerInfoText = findViewById(R.id.callerInfoText)
        deviceStatusText = findViewById(R.id.deviceStatusText)
        acceptButton = findViewById(R.id.acceptButton)
        declineButton = findViewById(R.id.declineButton)
        endButton = findViewById(R.id.endButton)
        muteButton = findViewById(R.id.muteButton)
    }
    
    private fun setupEventListeners() {
        acceptButton.setOnClickListener {
            handleAcceptCall()
        }
        
        declineButton.setOnClickListener {
            handleDeclineCall()
        }
        
        endButton.setOnClickListener {
            handleEndCall()
        }
        
        muteButton.setOnClickListener {
            toggleMute()
            updateMuteButton()
        }
    }
    
    private fun processIntent(intent: Intent?) {
        if (intent == null) return
        
        val callId = intent.getStringExtra("callId")
        val sourceId = intent.getStringExtra("sourceId")
        val callerName = intent.getStringExtra("callerName")
        val fromFCM = intent.getBooleanExtra("fromFCM", false)
        
        Log.i(TAG, "📞 Processing intent - CallId: $callId, Source: $sourceId, FCM: $fromFCM")
        
        if (callId != null && fromFCM) {
            // This was launched from FCM - check if call is still available
            checkCallAvailabilityAndShow(callId, sourceId, callerName)
        }
    }
    
    private fun checkCallAvailabilityAndShow(callId: String, sourceId: String?, callerName: String?) {
        // In a multi-device scenario, the call might have been accepted on web
        // The service's multi-device coordinator will handle the validation
        Log.i(TAG, "🔍 Checking call availability for: $callId")
        
        // For now, we'll let the service state updates handle showing appropriate UI
        // The multi-device coordinator will notify us if call was accepted elsewhere
    }
    
    // Override base activity methods
    
    override fun handleStateChange(state: CallState) {
        Log.d(TAG, "🔄 Call state changed: ${state.connectionStatus}")
        runOnUiThread {
            updateUI()
        }
    }
    
    override fun handleMultiDeviceStateChange(state: MultiDeviceCallState) {
        super.handleMultiDeviceStateChange(state)
        Log.d(TAG, "🌐 Multi-device state changed")
        
        runOnUiThread {
            updateUI()
            updateDeviceStatus(state)
        }
    }
    
    override fun handleIncomingCall(callId: String, sourceId: String) {
        Log.i(TAG, "📞 Incoming call: $callId from $sourceId")
        runOnUiThread {
            showIncomingCallUI(callId, sourceId)
        }
    }
    
    override fun handleCallStarted(callId: String, sourceId: String) {
        Log.i(TAG, "📱 Call started: $callId")
        runOnUiThread {
            showActiveCallUI(callId, sourceId)
        }
    }
    
    override fun handleCallEnded(callId: String) {
        Log.i(TAG, "📱 Call ended: $callId")
        runOnUiThread {
            showReadyUI()
        }
    }
    
    override fun handleCallAcceptedOnOtherDevice(callId: String, deviceType: String) {
        super.handleCallAcceptedOnOtherDevice(callId, deviceType)
        Log.i(TAG, "📱 Call accepted on $deviceType: $callId")
        
        runOnUiThread {
            showCallActiveOnOtherDeviceUI(deviceType)
        }
    }
    
    override fun handleError(message: String) {
        Log.e(TAG, "❌ Error: $message")
        runOnUiThread {
            showError(message)
        }
    }
    
    // UI State Management Methods
    
    private fun updateUI() {
        when {
            // Check multi-device state first
            currentMultiDeviceState.callAcceptedByDevice == "web" -> {
                showCallActiveOnOtherDeviceUI("web")
            }
            currentMultiDeviceState.callAcceptedByDevice == "android" -> {
                currentMultiDeviceState.localDeviceState.currentCall?.let { call ->
                    showActiveCallUI(call.callId, call.sourceId)
                }
            }
            
            // Check local device state
            currentState.currentCall != null -> {
                val call = currentState.currentCall!!
                showActiveCallUI(call.callId, call.sourceId)
            }
            currentState.incomingCalls.isNotEmpty() -> {
                val call = currentState.incomingCalls.first()
                showIncomingCallUI(call.callId, call.sourceId)
            }
            currentState.isAgentRegistered -> {
                showReadyUI()
            }
            currentState.isConnected -> {
                showConnectingUI()
            }
            else -> {
                showDisconnectedUI()
            }
        }
    }
    
    private fun showIncomingCallUI(callId: String, sourceId: String) {
        Log.d(TAG, "📞 Showing incoming call UI")
        
        statusText.text = "Incoming Call"
        callerInfoText.text = "From: $sourceId"
        callerInfoText.visibility = View.VISIBLE
        
        acceptButton.visibility = View.VISIBLE
        declineButton.visibility = View.VISIBLE
        endButton.visibility = View.GONE
        muteButton.visibility = View.GONE
        
        // Store current call info for button handlers
        acceptButton.tag = callId
        declineButton.tag = callId
    }
    
    private fun showActiveCallUI(callId: String, sourceId: String) {
        Log.d(TAG, "📱 Showing active call UI")
        
        statusText.text = "In Call"
        callerInfoText.text = "With: $sourceId"
        callerInfoText.visibility = View.VISIBLE
        
        acceptButton.visibility = View.GONE
        declineButton.visibility = View.GONE
        endButton.visibility = View.VISIBLE
        muteButton.visibility = View.VISIBLE
        
        endButton.tag = callId
        updateMuteButton()
    }
    
    private fun showCallActiveOnOtherDeviceUI(deviceType: String) {
        Log.d(TAG, "📱 Showing call active on $deviceType UI")
        
        val deviceName = when (deviceType) {
            "web" -> "Web Browser"
            "desktop" -> "Desktop App"
            else -> "Another Device"
        }
        
        statusText.text = "Call Active on $deviceName"
        callerInfoText.text = "Your call is active on another device"
        callerInfoText.visibility = View.VISIBLE
        
        acceptButton.visibility = View.GONE
        declineButton.visibility = View.GONE
        endButton.visibility = View.GONE
        muteButton.visibility = View.GONE
    }
    
    private fun showReadyUI() {
        Log.d(TAG, "✅ Showing ready UI")
        
        statusText.text = MultiDeviceStateHelper.getStatusMessage(currentMultiDeviceState)
        callerInfoText.visibility = View.GONE
        
        acceptButton.visibility = View.GONE
        declineButton.visibility = View.GONE
        endButton.visibility = View.GONE
        muteButton.visibility = View.GONE
    }
    
    private fun showConnectingUI() {
        statusText.text = "Connecting..."
        callerInfoText.visibility = View.GONE
        hideAllButtons()
    }
    
    private fun showDisconnectedUI() {
        statusText.text = "Disconnected"
        callerInfoText.visibility = View.GONE
        hideAllButtons()
    }
    
    private fun hideAllButtons() {
        acceptButton.visibility = View.GONE
        declineButton.visibility = View.GONE
        endButton.visibility = View.GONE
        muteButton.visibility = View.GONE
    }
    
    private fun updateDeviceStatus(state: MultiDeviceCallState) {
        val deviceCount = state.otherDevicesActive.size
        val onlineDevices = state.otherDevicesActive.count { it.isOnline }
        
        deviceStatusText.text = when {
            deviceCount == 0 -> "Single device mode"
            onlineDevices == 0 -> "$deviceCount other devices (offline)"
            onlineDevices == deviceCount -> "$onlineDevices other devices online"
            else -> "$onlineDevices/$deviceCount other devices online"
        }
        deviceStatusText.visibility = View.VISIBLE
    }
    
    private fun updateMuteButton() {
        val isMuted = currentState.currentCall?.isMuted ?: false
        muteButton.text = if (isMuted) "Unmute" else "Mute"
    }
    
    private fun showError(message: String) {
        statusText.text = "Error: $message"
        callerInfoText.visibility = View.GONE
    }
    
    // Button Handler Methods
    
    private fun handleAcceptCall() {
        val callId = acceptButton.tag as? String
        if (callId != null) {
            Log.i(TAG, "✅ Accepting call: $callId")
            
            // Check if call is still available (not accepted on other device)
            if (!isCallAcceptedOnOtherDevice(callId)) {
                acceptCall(callId)
            } else {
                Log.w(TAG, "⚠️ Cannot accept - call already accepted on another device")
                showError("Call was already answered on another device")
            }
        } else {
            Log.e(TAG, "❌ No call ID found for accept button")
        }
    }
    
    private fun handleDeclineCall() {
        val callId = declineButton.tag as? String
        if (callId != null) {
            Log.i(TAG, "❌ Declining call: $callId")
            declineCall(callId)
        } else {
            Log.e(TAG, "❌ No call ID found for decline button")
        }
    }
    
    private fun handleEndCall() {
        val callId = endButton.tag as? String
        if (callId != null) {
            Log.i(TAG, "🔚 Ending call: $callId")
            endCall(callId)
        } else {
            Log.e(TAG, "❌ No call ID found for end button")
        }
    }
}