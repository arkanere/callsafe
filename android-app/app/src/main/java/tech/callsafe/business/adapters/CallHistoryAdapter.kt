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
                sourceIdText.text = "From: ${callRecord.sourceId}"
                timestampText.text = dateFormat.format(Date(callRecord.timestamp))
                durationText.text = formatDuration(callRecord.duration)
                statusText.text = callRecord.status.capitalize()
                
                // Set status color based on call status
                val statusColor = when (callRecord.status) {
                    "completed" -> android.graphics.Color.GREEN
                    "missed" -> android.graphics.Color.RED
                    "rejected" -> android.graphics.Color.GRAY
                    else -> android.graphics.Color.BLACK
                }
                statusText.setTextColor(statusColor)
                
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