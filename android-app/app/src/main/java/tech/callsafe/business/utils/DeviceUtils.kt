package tech.callsafe.business.utils

import android.content.Context

// Global utility function for device ID
fun getUniqueDeviceId(context: Context): String {
    val sharedPreferences = context.getSharedPreferences("CallSafePrefs", Context.MODE_PRIVATE)
    val existingDeviceId = sharedPreferences.getString("device_id", null)
    
    return if (existingDeviceId != null) {
        existingDeviceId
    } else {
        val newDeviceId = java.util.UUID.randomUUID().toString()
        sharedPreferences.edit().putString("device_id", newDeviceId).apply()
        newDeviceId
    }
}