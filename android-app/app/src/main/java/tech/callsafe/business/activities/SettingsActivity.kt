package tech.callsafe.business.activities

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import tech.callsafe.business.databinding.ActivitySettingsBinding
import tech.callsafe.business.managers.AuthenticationManager
import tech.callsafe.business.managers.SocketManager
import tech.callsafe.business.utils.getUniqueDeviceId

class SettingsActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySettingsBinding
    private lateinit var authenticationManager: AuthenticationManager
    private lateinit var socketManager: SocketManager
    
    companion object {
        private const val TAG = "SettingsActivity"
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        Log.d(TAG, "[SETTINGS] onCreate() called")
        
        // Initialize managers
        authenticationManager = AuthenticationManager(this)
        socketManager = SocketManager.getInstance(this)
        
        setupUI()
        loadUserInformation()
    }
    
    private fun setupUI() {
        Log.d(TAG, "[SETTINGS] Setting up UI elements")
        
        binding.apply {
            settingsTitle.text = "Settings"
            
            // Logout button click listener
            logoutButton.setOnClickListener {
                Log.d(TAG, "[SETTINGS] Logout button clicked")
                performLogout()
            }
        }
        
        Log.d(TAG, "[SETTINGS] UI setup complete")
    }
    
    private fun loadUserInformation() {
        Log.d(TAG, "[SETTINGS] Loading user information")
        
        val user = authenticationManager.getStoredUser()
        
        binding.apply {
            if (user != null) {
                userEmailText.text = user.email
                userHandleText.text = user.handle
                Log.d(TAG, "[SETTINGS] Loaded user data - email: ${user.email}, handle: ${user.handle}")
            } else {
                userEmailText.text = "Not available"
                userHandleText.text = "Not available"
                Log.w(TAG, "[SETTINGS] No user data available")
            }
        }
        
        Log.d(TAG, "[SETTINGS] User information loaded")
    }
    
    private fun performLogout() {
        Log.d(TAG, "[SETTINGS] performLogout() called")
        
        // Disconnect socket if connected
        Log.d(TAG, "[SETTINGS] Disconnecting socket")
        socketManager.disconnect()
        
        // Clear authentication data
        Log.d(TAG, "[SETTINGS] Clearing authentication data")
        authenticationManager.logout()
        
        // Redirect to login activity
        Log.d(TAG, "[SETTINGS] Redirecting to login activity")
        val intent = Intent(this, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        finish()
        
        Log.d(TAG, "[SETTINGS] Logout complete")
    }
}