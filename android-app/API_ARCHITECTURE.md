# CallSafe Android App - API Architecture

This document explains the API architecture and server separation for the CallSafe Android app.

## 🌐 Server Architecture

### Main Server - `https://callsafe.tech/`
**Purpose**: User management and authentication
- **Database**: PostgreSQL (Neon)  
- **Technology**: SvelteKit
- **Usage**: Web frontend + Android user APIs

**Endpoints**:
- `POST /api/login` - User authentication
- `POST /api/signup` - User registration  
- `GET /api/user` - Get user data
- `GET /api/links` - Get user handles/links
- `PUT /api/user/embed` - Update embed status

### Signaling Server - `https://tunnel.callsafe.tech/`
**Purpose**: Real-time communication and notifications
- **Database**: SQLite (local)
- **Technology**: Node.js + Socket.IO + Express  
- **Usage**: WebRTC signaling + FCM notifications

**Endpoints**:
- `POST /api/fcm-token` - Register/update FCM token
- `GET /api/fcm-token/{handle}` - Get FCM token
- `DELETE /api/fcm-token/{handle}` - Delete FCM token
- `GET /api/stats` - Server statistics
- `GET /health` - Health check
- **WebSocket**: Socket.IO for real-time signaling

## 📱 Android App Configuration

### API Services

1. **ApiService** (`RetrofitInstance.api`)
   - Base URL: `https://callsafe.tech/`
   - Purpose: User management APIs
   - Usage: Login, signup, user data, handles

2. **SignalingApiService** (`RetrofitInstance.signalingApi`) 
   - Base URL: `https://tunnel.callsafe.tech/`
   - Purpose: Real-time features
   - Usage: FCM tokens, notifications

### Usage Examples

```kotlin
// User authentication - use main API
val response = RetrofitInstance.api.login(loginRequest)

// FCM token registration - use signaling API  
val response = RetrofitInstance.signalingApi.updateFCMToken(fcmRequest)

// WebSocket connection - also goes to signaling server
val socket = IO.socket("https://tunnel.callsafe.tech")
```

## 🔄 Data Flow

### User Registration/Login
1. Android app → `callsafe.tech/api/login`
2. User data stored in PostgreSQL
3. Return user info + handles

### FCM Token Registration  
1. Android app → `tunnel.callsafe.tech/api/fcm-token`
2. Token stored in SQLite (signaling server)
3. Used for push notifications during calls

### Incoming Call Flow
1. Customer calls → Signaling server  
2. Signaling server checks FCM tokens
3. Push notification sent to Android app
4. App shows incoming call UI

## 🏗️ Why This Architecture?

**Separation of Concerns**:
- **Main server**: Persistent user data, web interface
- **Signaling server**: Real-time, session-based features

**Scalability**:
- User management scales with web app
- Real-time features can be scaled independently  

**Technology Match**:
- PostgreSQL for persistent user data
- SQLite + Node.js for fast real-time operations

## 📚 File Structure

```
android-app/src/main/java/com/callsafe/androidapp/network/
├── RetrofitInstance.kt        # Both API configurations
├── ApiService.kt             # Main server endpoints  
├── SignalingApiService.kt    # Signaling server endpoints
└── SocketManager.kt          # WebSocket connection
```

## ⚠️ Important Notes

1. **Never mix endpoints** - Each API service talks to its designated server
2. **FCM tokens go to signaling server** - They're needed for real-time notifications  
3. **User data goes to main server** - It's persistent and shared with web app
4. **WebSocket connection** - Always connects to `tunnel.callsafe.tech`

## 🔍 Troubleshooting

**404 Errors**: Check which server the endpoint should hit
- User APIs → `callsafe.tech`  
- FCM/Real-time → `tunnel.callsafe.tech`

**Authentication Issues**: Login/signup only work on main server
**FCM Issues**: Token registration only works on signaling server
**Connection Issues**: WebSocket must connect to signaling server