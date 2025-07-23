package com.callsafe.androidapp

import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import android.widget.Toast
import com.callsafe.androidapp.models.User
import com.callsafe.androidapp.utils.SessionManager
import com.google.android.material.button.MaterialButton
import com.google.android.material.textview.MaterialTextView

class MainActivity : AppCompatActivity() {
    
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var sessionManager: SessionManager
    private lateinit var tvWelcome: MaterialTextView
    private lateinit var tvUserEmail: MaterialTextView
    private lateinit var tvUserHandle: MaterialTextView
    private lateinit var tvSourceId: MaterialTextView
    private lateinit var tvSessionAge: MaterialTextView
    private lateinit var btnReceiveCalls: MaterialButton
    private lateinit var btnLogout: MaterialButton
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        sharedPreferences = getSharedPreferences("callsafe_prefs", MODE_PRIVATE)
        sessionManager = SessionManager.getInstance(this)
        
        // Check if user has valid session
        if (!sessionManager.isSessionValid()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        
        initViews()
        setupClickListeners()
        loadUserCredentials()
    }
    
    private fun initViews() {
        tvWelcome = findViewById(R.id.tv_welcome)
        tvUserEmail = findViewById(R.id.tv_user_email)
        tvUserHandle = findViewById(R.id.tv_user_handle)
        tvSourceId = findViewById(R.id.tv_source_id)
        tvSessionAge = findViewById(R.id.tv_session_age)
        btnReceiveCalls = findViewById(R.id.btn_receive_calls)
        btnLogout = findViewById(R.id.btn_logout)
    }
    
    private fun setupClickListeners() {
        btnReceiveCalls.setOnClickListener {
            startActivity(Intent(this, UserReceiveActivity::class.java))
        }
        
        btnLogout.setOnClickListener {
            logout()
        }
    }
    
    private fun loadUserCredentials() {
        // Load all user data from cache
        val user = sessionManager.getUser()
        val userHandle = sessionManager.getUserHandle()
        val userSourceId = sessionManager.getSourceId()
        val sessionAge = sessionManager.getSessionAgeInDays()
        
        if (user != null) {
            tvWelcome.text = "Welcome, ${user.name}!"
            tvUserEmail.text = user.email
            tvUserHandle.text = userHandle ?: "No handle"
            tvSourceId.text = if (!userSourceId.isNullOrEmpty()) userSourceId else "No source ID"
            tvSessionAge.text = "Session: $sessionAge days old"
        } else {
            Toast.makeText(this, "Session data corrupted. Please login again.", Toast.LENGTH_LONG).show()
            sessionManager.clearSession()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }
    
    private fun logout() {
        // Clear session using SessionManager
        sessionManager.clearSession()
        
        // Also clear old SharedPreferences for backward compatibility
        with(sharedPreferences.edit()) {
            clear()
            apply()
        }
        
        Toast.makeText(this, "Logged out successfully", Toast.LENGTH_SHORT).show()
        
        // Navigate back to login
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
}