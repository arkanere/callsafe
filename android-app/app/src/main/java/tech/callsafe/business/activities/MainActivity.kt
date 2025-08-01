package tech.callsafe.business.activities

import android.content.Intent
import android.os.Bundle
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
import tech.callsafe.business.services.CallReceptionService
import tech.callsafe.business.utils.getUniqueDeviceId

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var socketManager: SocketManager
    private lateinit var callHistoryManager: CallHistoryManager
    private lateinit var authenticationManager: AuthenticationManager
    private var isOnline = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        socketManager = SocketManager.getInstance(this)
        callHistoryManager = CallHistoryManager(this)
        authenticationManager = AuthenticationManager(this)
        
        setupUI()
        setupViewPager()
        checkAuthenticationAndConnect()
    }
    
    private fun checkAuthenticationAndConnect() {
        // Check if user is authenticated via JWT token
        if (authenticationManager.getStoredToken() != null) {
            // User is authenticated, connect to socket
            socketManager.connect()
        } else {
            // User not authenticated, redirect to login
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }
    
    private fun setupUI() {
        binding.apply {
            // Status indicator
            statusIndicator.setOnClickListener {
                toggleOnlineStatus()
            }
            
            // Settings button
            settingsButton.setOnClickListener {
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
            }
        }
    }
    
    private fun setupViewPager() {
        val adapter = DashboardPagerAdapter(supportFragmentManager, lifecycle)
        binding.viewPager.adapter = adapter
        
        TabLayoutMediator(binding.tabLayout, binding.viewPager) { tab, position ->
            tab.text = when (position) {
                0 -> "Dashboard"
                1 -> "Call History"
                else -> "Settings"
            }
        }.attach()
    }
    
    private fun toggleOnlineStatus() {
        isOnline = !isOnline
        
        CallManager.getInstance(this).updateDeviceStatus(
            deviceId = getUniqueDeviceId(this),
            status = if (isOnline) "available" else "unavailable"
        )
        
        updateStatusUI(isOnline)
        
        if (isOnline) {
            startCallReceptionService()
        } else {
            stopCallReceptionService()
        }
    }
    
    private fun updateStatusUI(online: Boolean) {
        binding.apply {
            if (online) {
                statusIndicator.setImageResource(R.drawable.ic_online)
                statusText.text = "Online - Ready for calls"
                statusText.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.green))
            } else {
                statusIndicator.setImageResource(R.drawable.ic_offline)
                statusText.text = "Offline - Not receiving calls"
                statusText.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.gray))
            }
        }
    }
    
    private fun startCallReceptionService() {
        val intent = Intent(this, CallReceptionService::class.java).apply {
            action = CallReceptionService.ACTION_START_SERVICE
        }
        ContextCompat.startForegroundService(this, intent)
    }
    
    private fun stopCallReceptionService() {
        val intent = Intent(this, CallReceptionService::class.java).apply {
            action = CallReceptionService.ACTION_STOP_SERVICE
        }
        startService(intent)
    }
}