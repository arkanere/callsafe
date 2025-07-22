package com.callsafe.androidapp.models

data class SignupRequest(
    val email: String,
    val password: String,
    val name: String
)