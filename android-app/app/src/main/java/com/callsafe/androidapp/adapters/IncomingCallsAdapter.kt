package com.callsafe.androidapp.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.callsafe.androidapp.R
import com.callsafe.androidapp.models.IncomingCall
import com.google.android.material.button.MaterialButton
import com.google.android.material.textview.MaterialTextView
import java.text.SimpleDateFormat
import java.util.*

class IncomingCallsAdapter(
    private val onCallAction: (IncomingCall) -> Unit
) : RecyclerView.Adapter<IncomingCallsAdapter.ViewHolder>() {
    
    private var calls = listOf<IncomingCall>()
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    
    fun updateCalls(newCalls: List<IncomingCall>) {
        calls = newCalls
        notifyDataSetChanged()
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_incoming_call, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(calls[position])
    }
    
    override fun getItemCount(): Int = calls.size
    
    inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val tvCallId: MaterialTextView = itemView.findViewById(R.id.tv_call_id)
        private val tvSourceId: MaterialTextView = itemView.findViewById(R.id.tv_source_id)
        private val tvTimestamp: MaterialTextView = itemView.findViewById(R.id.tv_timestamp)
        private val btnAccept: MaterialButton = itemView.findViewById(R.id.btn_accept)
        private val btnDecline: MaterialButton = itemView.findViewById(R.id.btn_decline)
        
        fun bind(call: IncomingCall) {
            tvCallId.text = "Call ID: ${call.callId}"
            tvSourceId.text = "Source: ${call.sourceId}"
            tvTimestamp.text = timeFormat.format(Date(call.timestamp))
            
            btnAccept.setOnClickListener {
                call.action = "accept"
                onCallAction(call)
            }
            
            btnDecline.setOnClickListener {
                call.action = "decline"
                onCallAction(call)
            }
        }
    }
}