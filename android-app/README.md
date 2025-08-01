# CallSafe v2: Business Android App

## Overview
The CallSafe v2 Business Android App is a native mobile application that enables businesses to receive and manage customer calls on their mobile devices. It provides seamless integration with the web dashboard through multi-device synchronization and real-time push notifications.

## Features
- **JWT-based Authentication**: Secure business login with token-based authentication
- **Real-time Call Reception**: Socket.IO integration for instant call notifications
- **WebRTC Audio Calls**: High-quality audio calling with Android WebRTC APIs
- **Push Notifications**: Firebase Cloud Messaging for background call notifications
- **Call History**: Local Room database for call record management
- **Multi-device Coordination**: Seamless switching between web dashboard and mobile app
- **Background Service**: Always-on call reception service
- **Material Design 3**: Modern Android UI with Material Design components

## Architecture
- **MVVM Architecture**: Model-View-ViewModel pattern with LiveData/StateFlow
- **Kotlin**: Modern Android development with Kotlin
- **Room Database**: Local data persistence for call history
- **Retrofit**: RESTful API communication
- **Socket.IO**: Real-time bidirectional communication
- **WebRTC**: Peer-to-peer audio communication
- **Firebase**: Push notifications and analytics

## Security Features
- **JWT Token Management**: Secure token storage and validation
- **Server-side Handle Extraction**: No local JWT decoding for enhanced security
- **Input Validation**: Comprehensive validation of all user inputs
- **Secure Storage**: Encrypted local data storage
- **Privacy-first Architecture**: Minimal data collection and processing

## Setup Instructions

### Prerequisites
- Android Studio Arctic Fox or later
- Android SDK 24 (Android 7.0) or higher
- Kotlin 1.9.20 or later
- Firebase project setup

### Installation
1. Clone the repository
2. Open the project in Android Studio
3. Add your `google-services.json` file to the `app` directory
4. Update the server URLs in `build.gradle` if needed
5. Build and run the application

### Configuration
- Update `SIGNALING_SERVER_URL` and `API_BASE_URL` in build.gradle
- Configure Firebase project for push notifications
- Set up proper signing configuration for release builds

## Key Components

### Managers
- `AuthenticationManager`: JWT authentication and token management
- `SocketManager`: Real-time communication with signaling server
- `WebRTCManager`: WebRTC peer connection and audio management
- `CallManager`: Call state management and signaling
- `CallHistoryManager`: Local call history storage

### Activities
- `LoginActivity`: Business authentication
- `MainActivity`: Main dashboard with tabs
- `IncomingCallActivity`: Full-screen incoming call interface
- `ActiveCallActivity`: In-call controls and WebRTC management

### Services
- `CallReceptionService`: Background service for call reception
- `CallSafeFirebaseMessagingService`: Push notification handling

## Implementation Status
✅ Core infrastructure and project setup
✅ Authentication system with JWT
✅ Socket.IO client integration
✅ WebRTC implementation
✅ Push notifications with Firebase
✅ Call management and state handling
✅ Room database for call history
✅ Background service implementation
✅ Material Design UI components
✅ Security utilities and error handling

## Next Steps
- Add comprehensive unit and integration tests
- Implement advanced call features (hold, transfer)
- Add battery optimization handling
- Implement accessibility features
- Add analytics and crash reporting
- Performance optimization and monitoring

## Building for Release
1. Update version code and name in `app/build.gradle`
2. Configure signing keys
3. Run `./gradlew assembleRelease`
4. Test on multiple devices and Android versions
5. Upload to Google Play Console

## License
This project is part of the CallSafe v2 system and follows the same licensing terms.