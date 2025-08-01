package tech.callsafe.business.fragments

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import tech.callsafe.business.databinding.FragmentDashboardBinding
import tech.callsafe.business.managers.AuthenticationManager

class DashboardFragment : Fragment() {
    private var _binding: FragmentDashboardBinding? = null
    private val binding get() = _binding!!
    private lateinit var authManager: AuthenticationManager
    
    companion object {
        private const val TAG = "DashboardFragment"
    }
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        Log.d(TAG, "[DASHBOARD] onCreateView() called")
        _binding = FragmentDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        Log.d(TAG, "[DASHBOARD] onViewCreated() called")
        authManager = AuthenticationManager(requireContext())
        
        setupUI()
        loadUserData()
    }
    
    private fun setupUI() {
        Log.d(TAG, "[DASHBOARD] Setting up UI elements")
        binding.apply {
            // Setup dashboard UI elements
            dashboardTitle.text = "CallSafe Dashboard"
        }
        Log.d(TAG, "[DASHBOARD] UI setup complete")
    }
    
    private fun loadUserData() {
        Log.d(TAG, "[DASHBOARD] Loading user data")
        val user = authManager.getStoredUser()
        
        if (user != null) {
            Log.d(TAG, "[DASHBOARD] User data found - email: ${user.email}, handle: ${user.handle}")
            binding.apply {
                userEmailText.text = user.email
                userHandleText.text = user.handle
            }
        } else {
            Log.w(TAG, "[DASHBOARD] No user data found")
            binding.apply {
                userEmailText.text = "Not available"
                userHandleText.text = "Not available"
            }
        }
        Log.d(TAG, "[DASHBOARD] User data loading complete")
    }
    
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}