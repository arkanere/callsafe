package com.callsafe.androidapp.service

/**
 * Contract for communication between CallSafeService and UI components
 * Defines all broadcast actions and extra keys for service communication
 */
object CallSafeServiceContract {
    
    // Broadcast Actions (Service → UI)
    const val ACTION_STATE_CHANGED = "com.callsafe.androidapp.STATE_CHANGED"
    const val ACTION_CONNECTION_STATUS = "com.callsafe.androidapp.CONNECTION_STATUS"
    const val ACTION_INCOMING_CALL = "com.callsafe.androidapp.INCOMING_CALL"
    const val ACTION_CALL_STARTED = "com.callsafe.androidapp.CALL_STARTED"
    const val ACTION_CALL_ENDED = "com.callsafe.androidapp.CALL_ENDED"
    const val ACTION_ERROR = "com.callsafe.androidapp.ERROR"
    
    // Multi-device Actions
    const val ACTION_MULTI_DEVICE_STATE_CHANGED = "com.callsafe.androidapp.MULTI_DEVICE_STATE_CHANGED"
    const val ACTION_CALL_ACCEPTED_OTHER_DEVICE = "com.callsafe.androidapp.CALL_ACCEPTED_OTHER_DEVICE"
    const val ACTION_CALL_ANSWERED_ELSEWHERE = "com.callsafe.androidapp.CALL_ANSWERED_ELSEWHERE"
    
    // Intent Actions (UI → Service)
    const val ACTION_CONNECT = "com.callsafe.androidapp.CONNECT"
    const val ACTION_DISCONNECT = "com.callsafe.androidapp.DISCONNECT"
    const val ACTION_ACCEPT_CALL = "com.callsafe.androidapp.ACCEPT_CALL"  
    const val ACTION_DECLINE_CALL = "com.callsafe.androidapp.DECLINE_CALL"
    const val ACTION_END_CALL = "com.callsafe.androidapp.END_CALL"
    const val ACTION_MUTE_CALL = "com.callsafe.androidapp.MUTE_CALL"
    const val ACTION_UNMUTE_CALL = "com.callsafe.androidapp.UNMUTE_CALL"
    const val ACTION_GET_STATE = "com.callsafe.androidapp.GET_STATE"
    
    // Bundle Extra Keys
    const val EXTRA_CALL_STATE = "call_state"
    const val EXTRA_CALL_ID = "call_id"
    const val EXTRA_SOURCE_ID = "source_id"
    const val EXTRA_CONNECTION_STATUS = "connection_status"
    const val EXTRA_ERROR_MESSAGE = "error_message"
    const val EXTRA_IS_MUTED = "is_muted"
    const val EXTRA_HANDLE = "handle"
    
    // Multi-device Extra Keys
    const val EXTRA_MULTI_DEVICE_STATE = "multi_device_state"
    const val EXTRA_DEVICE_TYPE = "device_type"
    const val EXTRA_DEVICE_ID = "device_id"
    
    // Notification IDs
    const val NOTIFICATION_ID_SERVICE = 2001
    const val NOTIFICATION_ID_INCOMING_CALL = 2002
    
    // Notification Channels
    const val CHANNEL_ID_SERVICE = "callsafe_service"
    const val CHANNEL_ID_INCOMING_CALLS = "callsafe_incoming_calls"
}