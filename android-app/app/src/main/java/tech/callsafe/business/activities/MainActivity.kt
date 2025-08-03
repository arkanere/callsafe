package tech.callsafe.business.activities

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentPagerAdapter
import androidx.viewpager2.adapter.FragmentStateAdapter
import com.google.android.material.tabs.TabLayoutMediator
import tech.callsafe.business.R
import tech.callsafe.business.adapters.DashboardPagerAdapter
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
        
        Log.d(TAG, "[MAIN] Setting up UI and ViewPager")
        setupUI()
        setupViewPager()
        
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
        binding.apply {
            // Settings button
            settingsButton.setOnClickListener {
                Log.d(TAG, "[MAIN] Settings button clicked")
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
            }
            
            // Logout button
            logoutButton.setOnClickListener {
                Log.d(TAG, "[MAIN] Logout button clicked")
                performLogout()
            }
        }
        
        // Initialize as online and update UI
        initializeOnlineStatus()
        Log.d(TAG, "[MAIN] UI setup complete")
    }
    
    private fun setupViewPager() {
        Log.d(TAG, "[MAIN] Setting up ViewPager")
        val adapter = DashboardPagerAdapter(supportFragmentManager, lifecycle)
        binding.viewPager.adapter = adapter
        
        TabLayoutMediator(binding.tabLayout, binding.viewPager) { tab, position ->
            tab.text = when (position) {
                0 -> "Dashboard"
                1 -> "Call History"
                else -> "Settings"
            }
        }.attach()
        Log.d(TAG, "[MAIN] ViewPager setup complete")
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
}