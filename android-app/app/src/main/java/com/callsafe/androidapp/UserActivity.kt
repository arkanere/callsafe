package com.callsafe.androidapp

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.callsafe.androidapp.models.User
import com.callsafe.androidapp.models.UserHandle
import com.callsafe.androidapp.network.RetrofitInstance
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textview.MaterialTextView
import com.google.gson.Gson
import kotlinx.coroutines.launch

class UserActivity : AppCompatActivity() {
    
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var tvWelcome: MaterialTextView
    private lateinit var tvUserEmail: MaterialTextView
    private lateinit var tvSourceId: MaterialTextView
    private lateinit var tvHandle: MaterialTextView
    private lateinit var tvEmbedCode: MaterialTextView
    private lateinit var btnCopyHandle: MaterialButton
    private lateinit var btnCopyEmbed: MaterialButton
    private lateinit var btnMarkEmbedded: MaterialButton
    private lateinit var btnReceiveCalls: MaterialButton
    private lateinit var btnMakeCalls: MaterialButton
    private lateinit var btnLogout: MaterialButton
    private lateinit var cardEmbedPrompt: MaterialCardView
    private lateinit var cardEmbedSuccess: MaterialCardView
    
    private var currentUser: User? = null
    private var userHandle: String? = null
    private var hasEmbedded = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_user)
        
        sharedPreferences = getSharedPreferences("callsafe_prefs", MODE_PRIVATE)
        
        // Check if user is logged in
        if (!isUserLoggedIn()) {
            navigateToLogin()
            return
        }
        
        initViews()
        setupClickListeners()
        loadUserData()
    }
    
    private fun isUserLoggedIn(): Boolean {
        val userId = sharedPreferences.getInt("callsafe_userId", -1)
        val userJson = sharedPreferences.getString("callsafe_user", null)
        return userId != -1 && !userJson.isNullOrEmpty()
    }
    
    private fun navigateToLogin() {
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
    
    private fun initViews() {
        tvWelcome = findViewById(R.id.tv_welcome)
        tvUserEmail = findViewById(R.id.tv_user_email)
        tvSourceId = findViewById(R.id.tv_source_id)
        tvHandle = findViewById(R.id.tv_handle)
        tvEmbedCode = findViewById(R.id.tv_embed_code)
        btnCopyHandle = findViewById(R.id.btn_copy_handle)
        btnCopyEmbed = findViewById(R.id.btn_copy_embed)
        btnMarkEmbedded = findViewById(R.id.btn_mark_embedded)
        btnReceiveCalls = findViewById(R.id.btn_receive_calls)
        btnMakeCalls = findViewById(R.id.btn_make_calls)
        btnLogout = findViewById(R.id.btn_logout)
        cardEmbedPrompt = findViewById(R.id.card_embed_prompt)
        cardEmbedSuccess = findViewById(R.id.card_embed_success)
    }
    
    private fun setupClickListeners() {
        btnCopyHandle.setOnClickListener {
            userHandle?.let { copyToClipboard(it, "Handle copied!") }
        }
        
        btnCopyEmbed.setOnClickListener {
            userHandle?.let { handle ->
                val embedCode = "<script src=\"https://callsafe.tech/embed.js\" data-handle=\"$handle\" data-source-id=\"your-page-id\"></script>"
                copyToClipboard(embedCode, "Embed code copied!")
            }
        }
        
        btnMarkEmbedded.setOnClickListener {
            markAsEmbedded()
        }
        
        btnReceiveCalls.setOnClickListener {
            userHandle?.let { handle ->
                val intent = Intent(this, UserReceiveActivity::class.java)
                intent.putExtra("handle", handle)
                startActivity(intent)
            } ?: run {
                Toast.makeText(this, "Please wait for handle to load", Toast.LENGTH_SHORT).show()
            }
        }
        
        btnMakeCalls.setOnClickListener {
            userHandle?.let { handle ->
                // In a real implementation, this would open a WebView or external browser
                // For now, we'll just show the URL
                val callUrl = "https://callsafe.tech/user/call/$handle"
                copyToClipboard(callUrl, "Call URL copied! Open in browser to test.")
            } ?: run {
                Toast.makeText(this, "Please wait for handle to load", Toast.LENGTH_SHORT).show()
            }
        }
        
        btnLogout.setOnClickListener {
            logout()
        }
    }
    
    private fun loadUserData() {
        val userId = sharedPreferences.getInt("callsafe_userId", -1)
        if (userId == -1) return
        
        lifecycleScope.launch {
            try {
                // Load user data
                val userResponse = RetrofitInstance.api.getUser(userId)
                if (userResponse.isSuccessful && userResponse.body()?.success == true) {
                    currentUser = userResponse.body()?.user
                    updateUserInfo()
                }
                
                // Load user handles
                val handlesResponse = RetrofitInstance.api.getUserHandles(userId)
                if (handlesResponse.isSuccessful && handlesResponse.body()?.success == true) {
                    val handles = handlesResponse.body()?.handles ?: emptyList()
                    if (handles.isNotEmpty()) {
                        userHandle = handles[0].handle
                        updateHandleInfo()
                    }
                }
                
            } catch (e: Exception) {
                Toast.makeText(this@UserActivity, "Error loading data: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
    
    private fun updateUserInfo() {
        currentUser?.let { user ->
            tvWelcome.text = "Welcome, ${user.name}!"
            tvUserEmail.text = user.email
            tvSourceId.text = user.sourceId ?: "No source ID assigned"
            hasEmbedded = user.isEmbedded
            updateEmbedStatus()
        }
    }
    
    private fun updateHandleInfo() {
        userHandle?.let { handle ->
            tvHandle.text = handle
            val embedCode = "<script src=\"https://callsafe.tech/embed.js\" data-handle=\"$handle\" data-source-id=\"your-page-id\"></script>"
            tvEmbedCode.text = embedCode
        }
    }
    
    private fun updateEmbedStatus() {
        if (hasEmbedded) {
            cardEmbedPrompt.visibility = View.GONE
            cardEmbedSuccess.visibility = View.VISIBLE
        } else {
            cardEmbedPrompt.visibility = View.VISIBLE
            cardEmbedSuccess.visibility = View.GONE
        }
    }
    
    private fun markAsEmbedded() {
        val userId = sharedPreferences.getInt("callsafe_userId", -1)
        if (userId == -1) return
        
        btnMarkEmbedded.isEnabled = false
        btnMarkEmbedded.text = "Processing..."
        
        lifecycleScope.launch {
            try {
                val request = mapOf(
                    "userId" to userId,
                    "isEmbedded" to true
                )
                
                val response = RetrofitInstance.api.markAsEmbedded(request)
                
                if (response.isSuccessful && response.body()?.success == true) {
                    hasEmbedded = true
                    updateEmbedStatus()
                    
                    // Update stored user data
                    currentUser?.let { user ->
                        val updatedUser = user.copy(isEmbedded = true)
                        with(sharedPreferences.edit()) {
                            putString("callsafe_user", Gson().toJson(updatedUser))
                            apply()
                        }
                        currentUser = updatedUser
                    }
                    
                    Toast.makeText(this@UserActivity, "Successfully marked as embedded!", Toast.LENGTH_SHORT).show()
                } else {
                    val error = response.body()?.error ?: "Failed to update embed status"
                    Toast.makeText(this@UserActivity, error, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@UserActivity, "Error: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                btnMarkEmbedded.isEnabled = true
                btnMarkEmbedded.text = "I have embedded this code"
            }
        }
    }
    
    private fun copyToClipboard(text: String, message: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("CallSafe", text)
        clipboard.setPrimaryClip(clip)
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
    
    private fun logout() {
        // Clear user session
        with(sharedPreferences.edit()) {
            clear()
            apply()
        }
        
        Toast.makeText(this, "Logged out successfully", Toast.LENGTH_SHORT).show()
        navigateToLogin()
    }
}