package tech.callsafe.business.activities

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import tech.callsafe.business.R
import tech.callsafe.business.adapters.CallHistoryAdapter
import tech.callsafe.business.databinding.ActivityMainBinding
import tech.callsafe.business.managers.AuthenticationManager
import tech.callsafe.business.managers.CallHistoryManager
import tech.callsafe.business.managers.CallManager
import tech.callsafe.business.managers.SocketManager
import tech.callsafe.business.utils.getUniqueDeviceId

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var socketManager: SocketManager
    private lateinit var callHistoryManager: CallHistoryManager
    private lateinit var authenticationManager: AuthenticationManager
    private lateinit var callHistoryAdapter: CallHistoryAdapter
    private var isOnline = true
    
    companion object {
        private const val TAG = "MainActivity"
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "[MAIN] onCreate() called")
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        Log.d(TAG, "[MAIN] Creating notification channel")
        createNotificationChannel()
        
        Log.d(TAG, "[MAIN] Initializing managers")
        socketManager = SocketManager.getInstance(this)
        callHistoryManager = CallHistoryManager(this)
        authenticationManager = AuthenticationManager(this)
        
        Log.d(TAG, "[MAIN] Setting up toolbar")
        setSupportActionBar(binding.toolbar)
        
        Log.d(TAG, "[MAIN] Setting up UI and Call History")
        setupUI()
        setupCallHistory()
        
        Log.d(TAG, "[MAIN] Checking authentication and connecting")
        checkAuthenticationAndConnect()
    }
    
    private fun checkAuthenticationAndConnect() {
        Log.d(TAG, "[MAIN] checkAuthenticationAndConnect() called")
        // Check if user is authenticated via JWT token
        val isTokenValid = authenticationManager.isTokenValid()
        Log.d(TAG, "[MAIN] Token validation result: $isTokenValid")
        
        if (isTokenValid) {
            Log.d(TAG, "[MAIN] User is authenticated, connecting to socket")
            // User is authenticated, connect to socket
            socketManager.connect()
        } else {
            Log.d(TAG, "[MAIN] User not authenticated, redirecting to login")
            // User not authenticated, redirect to login
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }
    
    private fun setupUI() {
        Log.d(TAG, "[MAIN] Setting up UI elements")
        
        // Initialize as online and update UI
        initializeOnlineStatus()
        Log.d(TAG, "[MAIN] UI setup complete")
    }
    
    private fun setupCallHistory() {
        Log.d(TAG, "[MAIN] Setting up Call History")
        
        // Initialize adapter with click handler
        callHistoryAdapter = CallHistoryAdapter { callRecord ->
            Log.d(TAG, "[MAIN] Call history item clicked: ${callRecord.callAttemptId}")
            // Handle call record click if needed
        }
        
        // Setup RecyclerView
        binding.recyclerView.apply {
            adapter = callHistoryAdapter
            layoutManager = LinearLayoutManager(this@MainActivity)
        }
        
        // Load call history data
        loadCallHistory()
        
        Log.d(TAG, "[MAIN] Call History setup complete")
    }
    
    private fun loadCallHistory() {
        Log.d(TAG, "[MAIN] loadCallHistory() - ENTRY POINT - Loading call history")
        
        Log.d(TAG, "[MAIN] loadCallHistory() - Setting up observer for call history LiveData")
        callHistoryManager.getAllCalls().observe(this) { callRecords ->
            Log.d(TAG, "[MAIN] loadCallHistory() - Observer triggered with call records")
            Log.d(TAG, "[MAIN] loadCallHistory() - Received callRecords: ${callRecords?.size ?: 0} records")
            
            if (callRecords != null && callRecords.isNotEmpty()) {
                Log.d(TAG, "[MAIN] loadCallHistory() - Found ${callRecords.size} call records")
                Log.d(TAG, "[MAIN] loadCallHistory() - First few records:")
                callRecords.take(3).forEachIndexed { index, record ->
                    Log.d(TAG, "[MAIN] loadCallHistory() - Record $index: $record")
                }
                
                Log.d(TAG, "[MAIN] loadCallHistory() - Submitting list to adapter")
                callHistoryAdapter.submitList(callRecords)
                
                Log.d(TAG, "[MAIN] loadCallHistory() - Showing RecyclerView, hiding empty view")
                binding.recyclerView.visibility = android.view.View.VISIBLE
                binding.emptyView.visibility = android.view.View.GONE
            } else {
                Log.d(TAG, "[MAIN] loadCallHistory() - No call records found or empty list")
                Log.d(TAG, "[MAIN] loadCallHistory() - Hiding RecyclerView, showing empty view")
                binding.recyclerView.visibility = android.view.View.GONE
                binding.emptyView.visibility = android.view.View.VISIBLE
            }
            
            Log.d(TAG, "[MAIN] loadCallHistory() - Observer processing complete")
        }
        
        Log.d(TAG, "[MAIN] loadCallHistory() - EXIT POINT")
    }
    
    private fun initializeOnlineStatus() {
        Log.d(TAG, "[MAIN] Initializing online status")
        
        val deviceId = getUniqueDeviceId(this)
        val status = "available"
        Log.d(TAG, "[MAIN] Setting device status - deviceId: $deviceId, status: $status")
        
        CallManager.getInstance(this).updateDeviceStatus(
            deviceId = deviceId,
            status = status
        )
        
        Log.d(TAG, "[MAIN] Device status set to online")
        
        Log.d(TAG, "[MAIN] App ready to receive calls via FCM")
    }
    
    
    
    private fun performLogout() {
        Log.d(TAG, "[MAIN] performLogout() called")
        
        // Disconnect socket if connected
        Log.d(TAG, "[MAIN] Disconnecting socket")
        socketManager.disconnect()
        
        // Clear authentication data
        Log.d(TAG, "[MAIN] Clearing authentication data")
        authenticationManager.logout()
        
        // Redirect to login activity
        Log.d(TAG, "[MAIN] Redirecting to login activity")
        val intent = Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        finish()
        
        Log.d(TAG, "[MAIN] Logout complete")
    }
    
    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            "call_notifications",
            "Incoming Calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for incoming calls"
            setShowBadge(true)
        }
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.createNotificationChannel(channel)
    }
    
    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_settings -> {
                Log.d(TAG, "[MAIN] Settings menu item clicked")
                startActivity(Intent(this, SettingsActivity::class.java))
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}