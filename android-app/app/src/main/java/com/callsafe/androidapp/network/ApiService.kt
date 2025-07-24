package com.callsafe.androidapp.network

import com.callsafe.androidapp.models.AuthResponse
import com.callsafe.androidapp.models.HandlesResponse
import com.callsafe.androidapp.models.LoginRequest
import com.callsafe.androidapp.models.SignupRequest
import com.callsafe.androidapp.models.UserResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

/**
 * API service interface for main server endpoints
 * Base URL: https://callsafe.tech/
 * 
 * Handles:
 * - User authentication (login, signup)
 * - User management (user data, handles)
 * - Account settings
 */
interface ApiService {
    
    @POST("api/login")
    suspend fun login(@Body loginRequest: LoginRequest): Response<AuthResponse>
    
    @POST("api/signup")
    suspend fun signup(@Body signupRequest: SignupRequest): Response<AuthResponse>
    
    @GET("api/user")
    suspend fun getUser(@Query("userId") userId: Int): Response<UserResponse>
    
    @GET("api/links")
    suspend fun getUserHandles(@Query("userId") userId: Int): Response<HandlesResponse>
    
    @PUT("api/user/embed")
    suspend fun markAsEmbedded(@Body request: Map<String, Any>): Response<AuthResponse>
}