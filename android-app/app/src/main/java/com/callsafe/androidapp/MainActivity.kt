package com.callsafe.androidapp

import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import android.widget.Button
import android.widget.Toast

class MainActivity : AppCompatActivity() {
    
    private lateinit var sharedPreferences: SharedPreferences
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        sharedPreferences = getSharedPreferences("callsafe_prefs", MODE_PRIVATE)
        
        val userButton = findViewById<Button>(R.id.btn_user)
        val receiveButton = findViewById<Button>(R.id.btn_receive)
        val logoutButton = findViewById<Button>(R.id.btn_logout)
        
        userButton.setOnClickListener {
            startActivity(Intent(this, UserActivity::class.java))
        }
        
        receiveButton.setOnClickListener {
            startActivity(Intent(this, UserReceiveActivity::class.java))
        }
        
        logoutButton.setOnClickListener {
            logout()
        }
    }
    
    private fun logout() {
        // Clear user session
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