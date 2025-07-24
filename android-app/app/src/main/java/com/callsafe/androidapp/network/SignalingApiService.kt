package com.callsafe.androidapp.network

import com.callsafe.androidapp.models.FCMTokenRequest
import com.callsafe.androidapp.models.FCMTokenResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * API service interface for signaling server endpoints
 * Base URL: https://tunnel.callsafe.tech/
 * 
 * Handles:
 * - FCM token management
 * - Real-time notifications
 * - WebRTC signaling related APIs
 */
interface SignalingApiService {
    
    /**
     * Register/Update FCM token for push notifications
     * POST /api/fcm-token
     */
    @POST("api/fcm-token")
    suspend fun updateFCMToken(@Body request: FCMTokenRequest): Response<FCMTokenResponse>
    
    /**
     * Get FCM token for a specific handle
     * GET /api/fcm-token/{handle}
     */
    @GET("api/fcm-token/{handle}")
    suspend fun getFCMToken(@Path("handle") handle: String): Response<FCMTokenResponse>
    
    /**
     * Delete FCM token for a specific handle
     * DELETE /api/fcm-token/{handle}
     */
    @DELETE("api/fcm-token/{handle}")
    suspend fun deleteFCMToken(@Path("handle") handle: String): Response<FCMTokenResponse>
}