package tech.callsafe.business.fragments

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.DividerItemDecoration
import androidx.recyclerview.widget.LinearLayoutManager
import tech.callsafe.business.adapters.CallHistoryAdapter
import tech.callsafe.business.database.CallRecord
import tech.callsafe.business.databinding.FragmentCallHistoryBinding
import tech.callsafe.business.managers.CallHistoryManager

class CallHistoryFragment : Fragment() {
    private var _binding: FragmentCallHistoryBinding? = null
    private val binding get() = _binding!!
    
    private lateinit var callHistoryManager: CallHistoryManager
    private lateinit var adapter: CallHistoryAdapter
    
    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCallHistoryBinding.inflate(inflater, container, false)
        return binding.root
    }
    
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        callHistoryManager = CallHistoryManager(requireContext())
        setupRecyclerView()
        observeCallHistory()
    }
    
    private fun setupRecyclerView() {
        adapter = CallHistoryAdapter { callRecord ->
            // Handle call record click (show details)
            showCallDetails(callRecord)
        }
        
        binding.recyclerView.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = this@CallHistoryFragment.adapter
            
            // Add item decoration for dividers
            addItemDecoration(DividerItemDecoration(requireContext(), DividerItemDecoration.VERTICAL))
        }
    }
    
    private fun observeCallHistory() {
        callHistoryManager.getAllCalls().observe(viewLifecycleOwner) { calls ->
            if (calls.isEmpty()) {
                binding.emptyView.visibility = View.VISIBLE
                binding.recyclerView.visibility = View.GONE
            } else {
                binding.emptyView.visibility = View.GONE
                binding.recyclerView.visibility = View.VISIBLE
                adapter.submitList(calls)
            }
        }
    }
    
    private fun showCallDetails(callRecord: CallRecord) {
        // Show call details dialog or navigate to details screen
        // For now, just a placeholder
    }
    
    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}