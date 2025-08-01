package tech.callsafe.business.activities

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import tech.callsafe.business.databinding.ActivityLoginBinding
import tech.callsafe.business.managers.AuthenticationManager

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding
    private lateinit var authManager: AuthenticationManager
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        authManager = AuthenticationManager(this)
        
        setupUI()
        setupClickListeners()
    }
    
    private fun setupUI() {
        binding.apply {
            // Set up UI elements
            loginButton.isEnabled = true
            emailEditText.setText("")
            passwordEditText.setText("")
        }
    }
    
    private fun setupClickListeners() {
        binding.loginButton.setOnClickListener {
            performLogin()
        }
    }
    
    private fun performLogin() {
        val email = binding.emailEditText.text.toString().trim()
        val password = binding.passwordEditText.text.toString()
        
        if (email.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Please enter email and password", Toast.LENGTH_SHORT).show()
            return
        }
        
        // Disable login button during authentication
        binding.loginButton.isEnabled = false
        binding.loginButton.text = "Logging in..."
        
        lifecycleScope.launch {
            try {
                val response = authManager.login(email, password)
                
                if (response.success) {
                    // Login successful, navigate to main activity
                    val intent = Intent(this@LoginActivity, MainActivity::class.java)
                    startActivity(intent)
                    finish()
                } else {
                    Toast.makeText(this@LoginActivity, "Login failed", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@LoginActivity, "Login error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                // Re-enable login button
                binding.loginButton.isEnabled = true
                binding.loginButton.text = "Login"
            }
        }
    }
}