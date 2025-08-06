package tech.callsafe.business.adapters

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import tech.callsafe.business.database.CallRecord
import tech.callsafe.business.databinding.ItemCallHistoryBinding
import java.text.SimpleDateFormat
import java.util.*

class CallHistoryAdapter(
    private val onItemClick: (CallRecord) -> Unit
) : ListAdapter<CallRecord, CallHistoryAdapter.CallHistoryViewHolder>(CallHistoryDiffCallback()) {
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CallHistoryViewHolder {
        val binding = ItemCallHistoryBinding.inflate(
            LayoutInflater.from(parent.context),
            parent,
            false
        )
        return CallHistoryViewHolder(binding)
    }
    
    override fun onBindViewHolder(holder: CallHistoryViewHolder, position: Int) {
        val callRecord = getItem(position)
        holder.bind(callRecord, onItemClick)
    }
    
    class CallHistoryViewHolder(
        private val binding: ItemCallHistoryBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        
        private val dateFormat = SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.getDefault())
        
        fun bind(callRecord: CallRecord, onItemClick: (CallRecord) -> Unit) {
            binding.apply {
                // Source information - ensure it's visible and prominent
                sourceIdText.text = "From: ${callRecord.sourceId}"
                sourceIdText.visibility = android.view.View.VISIBLE
                
                // Timestamp formatting (matching frontend style)
                timestampText.text = dateFormat.format(Date(callRecord.timestamp))
                
                // Duration display - always show, even if 0
                durationText.text = formatDuration(callRecord.duration)
                durationText.visibility = android.view.View.VISIBLE
                
                // Status with better formatting (matching frontend categories)
                val statusDisplay = when (callRecord.status) {
                    "completed" -> "Completed"
                    "missed" -> "Missed Call"
                    "rejected" -> "Rejected"
                    "cancelled" -> "Cancelled"
                    "failed" -> "Failed"
                    "answered_elsewhere" -> "Answered on Another Device"
                    "timeout" -> "Timeout"
                    else -> callRecord.status.capitalize()
                }
                statusText.text = statusDisplay
                
                // Set status color based on call status (matching frontend colors)
                val statusColor = when (callRecord.status) {
                    "completed" -> android.graphics.Color.parseColor("#22C55E") // Green
                    "missed" -> android.graphics.Color.parseColor("#F97316") // Orange
                    "rejected" -> android.graphics.Color.parseColor("#6B7280") // Gray
                    "cancelled" -> android.graphics.Color.parseColor("#6B7280") // Gray
                    "failed" -> android.graphics.Color.parseColor("#EF4444") // Red
                    "answered_elsewhere" -> android.graphics.Color.parseColor("#3B82F6") // Blue
                    "timeout" -> android.graphics.Color.parseColor("#EAB308") // Yellow
                    else -> android.graphics.Color.BLACK
                }
                statusText.setTextColor(statusColor)
                
                // Device info and connection type TextViews removed from layout
                
                // Call ID (last 6 characters)
                callIdText.text = "#${callRecord.callAttemptId.takeLast(6)}"
                
                root.setOnClickListener {
                    onItemClick(callRecord)
                }
            }
        }
        
        private fun formatDuration(seconds: Int): String {
            val minutes = seconds / 60
            val remainingSeconds = seconds % 60
            return String.format("%02d:%02d", minutes, remainingSeconds)
        }
    }
    
    class CallHistoryDiffCallback : DiffUtil.ItemCallback<CallRecord>() {
        override fun areItemsTheSame(oldItem: CallRecord, newItem: CallRecord): Boolean {
            return oldItem.callAttemptId == newItem.callAttemptId
        }
        
        override fun areContentsTheSame(oldItem: CallRecord, newItem: CallRecord): Boolean {
            return oldItem == newItem
        }
    }
}