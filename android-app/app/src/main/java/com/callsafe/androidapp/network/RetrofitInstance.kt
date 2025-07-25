package com.callsafe.androidapp.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitInstance {
    
    // Main API server - User management (login, signup, user data, handles)
    private const val BASE_URL = "https://callsafe.tech/"
    
    // Signaling server - Real-time features (FCM tokens, WebRTC, notifications)  
    private const val SIGNALING_BASE_URL = "https://tunnel.callsafe.tech/"
    
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }
    
    private val client = OkHttpClient.Builder()
        .addInterceptor(loggingInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    
    // Main API service for user management
    val api: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
    
    // Signaling API service for real-time features
    val signalingApi: SignalingApiService by lazy {
        Retrofit.Builder()
            .baseUrl(SIGNALING_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(SignalingApiService::class.java)
    }
    
    // Getter methods for external access
    fun getApiService(): ApiService = api
    fun getSignalingApiService(): SignalingApiService = signalingApi
}