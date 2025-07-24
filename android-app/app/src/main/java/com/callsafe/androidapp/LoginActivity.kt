package com.callsafe.androidapp

import android.content.Intent
import android.content.SharedPreferences
import android.os.Bundle
import android.util.Log
import android.util.Patterns
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.callsafe.androidapp.models.LoginRequest
import com.callsafe.androidapp.models.SignupRequest
import com.callsafe.androidapp.network.RetrofitInstance
import com.callsafe.androidapp.utils.SessionManager
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textview.MaterialTextView
import com.google.gson.Gson
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {
    
    private lateinit var etEmail: TextInputEditText
    private lateinit var etPassword: TextInputEditText
    private lateinit var etName: TextInputEditText
    private lateinit var etConfirmPassword: TextInputEditText
    private lateinit var btnSubmit: MaterialButton
    private lateinit var tvToggleMode: MaterialTextView
    private lateinit var tvTitle: MaterialTextView
    private lateinit var sharedPreferences: SharedPreferences
    private lateinit var sessionManager: SessionManager
    
    companion object {
        private const val TAG = "LoginActivity"
    }
    
    private var isSignUpMode = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)
        
        sharedPreferences = getSharedPreferences("callsafe_prefs", MODE_PRIVATE)
        sessionManager = SessionManager.getInstance(this)
        
        // Check if user has valid session
        if (sessionManager.isSessionValid()) {
            Log.i(TAG, "Valid session found, session age: ${sessionManager.getSessionAgeInDays()} days")
            navigateToMainApp()
            return
        } else {
            // Clear any invalid session data
            sessionManager.clearSession()
            Log.i(TAG, "No valid session found, showing login screen")
        }
        
        initViews()
        setupClickListeners()
    }
    
    private fun isUserLoggedIn(): Boolean {
        return sessionManager.isSessionValid()
    }
    
    private fun navigateToMainApp() {
        // Use the new service-based activity
        startActivity(Intent(this, UserReceiveActivityNew::class.java))
        finish()
    }
    
    private fun initViews() {
        etEmail = findViewById(R.id.et_email)
        etPassword = findViewById(R.id.et_password)
        etName = findViewById(R.id.et_name)
        etConfirmPassword = findViewById(R.id.et_confirm_password)
        btnSubmit = findViewById(R.id.btn_submit)
        tvToggleMode = findViewById(R.id.tv_toggle_mode)
        tvTitle = findViewById(R.id.tv_title)
        
        updateUI()
    }
    
    private fun setupClickListeners() {
        btnSubmit.setOnClickListener {
            if (isSignUpMode) {
                handleSignUp()
            } else {
                handleLogin()
            }
        }
        
        tvToggleMode.setOnClickListener {
            toggleMode()
        }
    }
    
    private fun toggleMode() {
        isSignUpMode = !isSignUpMode
        updateUI()
        clearFields()
    }
    
    private fun updateUI() {
        if (isSignUpMode) {
            tvTitle.text = "Create Account"
            btnSubmit.text = "Sign Up"
            tvToggleMode.text = "Already have an account? Login"
            etName.visibility = View.VISIBLE
            etConfirmPassword.visibility = View.VISIBLE
        } else {
            tvTitle.text = "Login"
            btnSubmit.text = "Login"
            tvToggleMode.text = "Don't have an account? Sign Up"
            etName.visibility = View.GONE
            etConfirmPassword.visibility = View.GONE
        }
    }
    
    private fun clearFields() {
        etEmail.text?.clear()
        etPassword.text?.clear()
        etName.text?.clear()
        etConfirmPassword.text?.clear()
    }
    
    private fun handleLogin() {
        val email = etEmail.text.toString().trim()
        val password = etPassword.text.toString()
        
        if (!validateLoginInput(email, password)) return
        
        btnSubmit.isEnabled = false
        btnSubmit.text = "Logging in..."
        
        lifecycleScope.launch {
            try {
                val response = RetrofitInstance.api.login(LoginRequest(email, password))
                
                if (response.isSuccessful && response.body()?.success == true) {
                    val user = response.body()?.user
                    if (user != null) {
                        // Cache user data and handle during login
                        cacheUserDataAndHandle(user)
                    }
                } else {
                    val error = response.body()?.error ?: "Login failed"
                    Toast.makeText(this@LoginActivity, error, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@LoginActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(this@LoginActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
                btnSubmit.isEnabled = true
                btnSubmit.text = "Login"
            }
        }
    }
    
    private fun handleSignUp() {
        val email = etEmail.text.toString().trim()
        val password = etPassword.text.toString()
        val name = etName.text.toString().trim()
        val confirmPassword = etConfirmPassword.text.toString()
        
        if (!validateSignUpInput(email, password, name, confirmPassword)) return
        
        btnSubmit.isEnabled = false
        btnSubmit.text = "Creating Account..."
        
        lifecycleScope.launch {
            try {
                val response = RetrofitInstance.api.signup(SignupRequest(email, password, name))
                
                if (response.isSuccessful && response.body()?.success == true) {
                    val user = response.body()?.user
                    if (user != null) {
                        // Cache user data and handle during signup
                        cacheUserDataAndHandle(user)
                    }
                } else {
                    val error = response.body()?.error ?: "Sign up failed"
                    Toast.makeText(this@LoginActivity, error, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@LoginActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(this@LoginActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
                btnSubmit.isEnabled = true
                btnSubmit.text = "Sign Up"
            }
        }
    }
    
    private fun validateLoginInput(email: String, password: String): Boolean {
        if (email.isEmpty()) {
            Toast.makeText(this, "Please enter email", Toast.LENGTH_SHORT).show()
            return false
        }
        
        if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            Toast.makeText(this, "Please enter a valid email", Toast.LENGTH_SHORT).show()
            return false
        }
        
        if (password.isEmpty()) {
            Toast.makeText(this, "Please enter password", Toast.LENGTH_SHORT).show()
            return false
        }
        
        return true
    }
    
    private fun validateSignUpInput(email: String, password: String, name: String, confirmPassword: String): Boolean {
        if (name.isEmpty()) {
            Toast.makeText(this, "Please enter your name", Toast.LENGTH_SHORT).show()
            return false
        }
        
        if (!validateLoginInput(email, password)) return false
        
        if (password.length < 6) {
            Toast.makeText(this, "Password must be at least 6 characters", Toast.LENGTH_SHORT).show()
            return false
        }
        
        if (password != confirmPassword) {
            Toast.makeText(this, "Passwords do not match", Toast.LENGTH_SHORT).show()
            return false
        }
        
        return true
    }
    
    private fun cacheUserDataAndHandle(user: com.callsafe.androidapp.models.User) {
        lifecycleScope.launch {
            try {
                Log.i(TAG, "Caching user data for: ${user.email}")
                
                // Fetch user handle during login/signup
                val handlesResponse = RetrofitInstance.api.getUserHandles(user.id)
                if (handlesResponse.isSuccessful && handlesResponse.body()?.success == true) {
                    val handles = handlesResponse.body()?.handles ?: emptyList()
                    if (handles.isNotEmpty()) {
                        val handle = handles[0].handle
                        
                        // Cache everything using SessionManager
                        sessionManager.saveUserSession(user, handle)
                        Log.i(TAG, "Successfully cached user session with handle: $handle")
                        
                        Toast.makeText(this@LoginActivity, "Login successful!", Toast.LENGTH_SHORT).show()
                        navigateToMainApp()
                    } else {
                        Toast.makeText(this@LoginActivity, "No handles found for user. Please contact support.", Toast.LENGTH_LONG).show()
                    }
                } else {
                    Toast.makeText(this@LoginActivity, "Failed to load user data. Please try again.", Toast.LENGTH_LONG).show()
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Error caching user data", e)
                Toast.makeText(this@LoginActivity, "Error loading user data: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                btnSubmit.isEnabled = true
                btnSubmit.text = if (isSignUpMode) "Sign Up" else "Login"
            }
        }
    }
}