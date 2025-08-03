package tech.callsafe.business.activities

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import android.content.Context
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import tech.callsafe.business.databinding.ActivityLoginBinding
import tech.callsafe.business.managers.AuthenticationManager

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding
    private lateinit var authManager: AuthenticationManager
    
    companion object {
        private const val TAG = "LoginActivity"
        private const val MICROPHONE_PERMISSION_REQUEST_CODE = 1001
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "[LOGIN] onCreate() called")
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        Log.d(TAG, "[LOGIN] Initializing AuthenticationManager")
        authManager = AuthenticationManager(this)
        
        Log.d(TAG, "[LOGIN] Setting up UI and click listeners")
        setupUI()
        setupClickListeners()
        Log.d(TAG, "[LOGIN] Initialization complete")
    }
    
    private fun setupUI() {
        Log.d(TAG, "[LOGIN] Setting up UI elements")
        binding.apply {
            // Set up UI elements
            loginButton.isEnabled = true
            emailEditText.setText("")
            passwordEditText.setText("")
        }
        Log.d(TAG, "[LOGIN] UI setup complete")
    }
    
    private fun setupClickListeners() {
        Log.d(TAG, "[LOGIN] Setting up click listeners")
        binding.loginButton.setOnClickListener {
            Log.d(TAG, "[LOGIN] Login button clicked")
            performLogin()
        }
        
        binding.signupLinkText.setOnClickListener {
            Log.d(TAG, "[LOGIN] Signup link clicked, opening browser")
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://callsafe.tech"))
            startActivity(intent)
        }
        Log.d(TAG, "[LOGIN] Click listeners setup complete")
    }
    
    private fun performLogin() {
        Log.d(TAG, "[LOGIN] performLogin() called")
        val email = binding.emailEditText.text.toString().trim()
        val password = binding.passwordEditText.text.toString()
        
        Log.d(TAG, "[LOGIN] Credentials entered - email: $email, passwordLength: ${password.length}")
        
        if (email.isEmpty() || password.isEmpty()) {
            Log.w(TAG, "[LOGIN] Validation failed: empty email or password")
            Toast.makeText(this, "Please enter email and password", Toast.LENGTH_SHORT).show()
            return
        }
        
        Log.d(TAG, "[LOGIN] Starting authentication process")
        // Disable login button during authentication
        binding.loginButton.isEnabled = false
        binding.loginButton.text = "Logging in..."
        
        lifecycleScope.launch {
            try {
                Log.d(TAG, "[LOGIN] Calling authManager.login()")
                val response = authManager.login(email, password)
                
                Log.d(TAG, "[LOGIN] Authentication response received - success: ${response.success}")
                if (response.success) {
                    Log.d(TAG, "[LOGIN] Login successful, checking microphone permission")
                    // Login successful, check microphone permission before navigating
                    checkAndRequestMicrophonePermission()
                } else {
                    Log.w(TAG, "[LOGIN] Login failed - response.success = false")
                    Toast.makeText(this@LoginActivity, "Login failed: ${response.message}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Log.e(TAG, "[LOGIN] Login error occurred", e)
                Toast.makeText(this@LoginActivity, "Login error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                Log.d(TAG, "[LOGIN] Re-enabling login button")
                // Re-enable login button
                binding.loginButton.isEnabled = true
                binding.loginButton.text = "Login"
            }
        }
    }
    
    private fun checkAndRequestMicrophonePermission() {
        Log.d(TAG, "[LOGIN] checkAndRequestMicrophonePermission() - Checking RECORD_AUDIO permission")
        
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) 
            == PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, "[LOGIN] checkAndRequestMicrophonePermission() - Permission already granted, navigating to MainActivity")
            navigateToMainActivity()
        } else {
            Log.d(TAG, "[LOGIN] checkAndRequestMicrophonePermission() - Permission not granted, requesting permission")
            Toast.makeText(this, "Microphone permission is required for making calls", Toast.LENGTH_LONG).show()
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                MICROPHONE_PERMISSION_REQUEST_CODE
            )
        }
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        when (requestCode) {
            MICROPHONE_PERMISSION_REQUEST_CODE -> {
                if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                    Log.d(TAG, "[LOGIN] onRequestPermissionsResult() - Microphone permission granted, navigating to MainActivity")
                    navigateToMainActivity()
                } else {
                    Log.w(TAG, "[LOGIN] onRequestPermissionsResult() - Microphone permission denied, closing app")
                    Toast.makeText(this, "Microphone permission is required for the app to function. App will close.", Toast.LENGTH_LONG).show()
                    // Close the app if permission denied
                    finishAffinity()
                }
            }
        }
    }
    
    private fun navigateToMainActivity() {
        Log.d(TAG, "[LOGIN] navigateToMainActivity() - Registering FCM token and navigating to MainActivity")
        
        // Register FCM token immediately after successful login
        registerFCMTokenAfterLogin()
        
        val intent = Intent(this@LoginActivity, MainActivity::class.java)
        startActivity(intent)
        finish()
    }
    
    private fun registerFCMTokenAfterLogin() {
        Log.d(TAG, "[LOGIN] registerFCMTokenAfterLogin() - Registering FCM token with server")
        
        // Get stored FCM token
        val sharedPreferences = getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
        val fcmToken = sharedPreferences.getString("fcm_token", null)
        
        if (fcmToken != null) {
            Log.d(TAG, "[LOGIN] registerFCMTokenAfterLogin() - FCM token found, sending to server")
            try {
                val socketManager = tech.callsafe.business.managers.SocketManager.getInstance(this)
                socketManager.registerFCMTokenOnly(fcmToken)
            } catch (e: Exception) {
                Log.e(TAG, "[LOGIN] registerFCMTokenAfterLogin() - Failed to register FCM token", e)
            }
        } else {
            Log.w(TAG, "[LOGIN] registerFCMTokenAfterLogin() - No FCM token found, will register when token arrives")
        }
    }
}