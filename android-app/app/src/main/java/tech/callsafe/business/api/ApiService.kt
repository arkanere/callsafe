package tech.callsafe.business.api

import retrofit2.http.Body
import retrofit2.http.POST
import tech.callsafe.business.models.LoginRequest
import tech.callsafe.business.models.LoginResponse

interface ApiService {
    @POST("api/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse
}