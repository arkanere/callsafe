package com.callsafe.androidapp.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.callsafe.androidapp.R
import com.callsafe.androidapp.models.CallHistoryItem
import com.google.android.material.textview.MaterialTextView
import java.text.SimpleDateFormat
import java.util.*

class CallHistoryAdapter : RecyclerView.Adapter<CallHistoryAdapter.ViewHolder>() {
    
    private var history = listOf<CallHistoryItem>()
    private val dateFormat = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
    
    fun updateHistory(newHistory: List<CallHistoryItem>) {
        history = newHistory
        notifyDataSetChanged()
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_call_history, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(history[position])
    }
    
    override fun getItemCount(): Int = history.size
    
    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvCallStatus: MaterialTextView = itemView.findViewById(R.id.tv_call_status)
        private val tvCallId: MaterialTextView = itemView.findViewById(R.id.tv_call_id_history)
        private val tvSourceId: MaterialTextView = itemView.findViewById(R.id.tv_source_id_history)
        private val tvTimestamp: MaterialTextView = itemView.findViewById(R.id.tv_timestamp_history)
        private val tvDuration: MaterialTextView = itemView.findViewById(R.id.tv_duration)
        private val tvReason: MaterialTextView = itemView.findViewById(R.id.tv_reason)
        
        fun bind(item: CallHistoryItem) {
            tvCallStatus.text = when (item.status) {
                "completed" -> "Completed"
                "missed" -> "Missed Call"
                "failed" -> "Failed"
                "cancelled" -> "Cancelled"
                "timeout" -> "Timeout"
                else -> item.status.capitalize()
            }
            
            // Set status color
            val colorRes = when (item.status) {
                "completed" -> android.R.color.holo_green_dark
                "missed" -> android.R.color.holo_orange_dark
                "failed" -> android.R.color.holo_red_dark
                "cancelled" -> android.R.color.darker_gray
                "timeout" -> android.R.color.holo_orange_light
                else -> android.R.color.black
            }
            tvCallStatus.setTextColor(itemView.context.getColor(colorRes))
            
            tvCallId.text = "#${item.callId.takeLast(6)}"
            tvSourceId.text = "Source: ${item.sourceId}"
            tvTimestamp.text = dateFormat.format(Date(item.timestamp))
            
            if (item.duration > 0) {
                val minutes = item.duration / 60
                val seconds = item.duration % 60
                tvDuration.text = String.format("%02d:%02d", minutes, seconds)
                tvDuration.visibility = View.VISIBLE
            } else {
                tvDuration.visibility = View.GONE
            }
            
            if (item.reason.isNotEmpty()) {
                tvReason.text = "(${item.reason})"
                tvReason.visibility = View.VISIBLE
            } else {
                tvReason.visibility = View.GONE
            }
        }
    }
}