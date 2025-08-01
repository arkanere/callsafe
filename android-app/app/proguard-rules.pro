# Keep CallSafe classes
-keep class tech.callsafe.business.** { *; }

# Keep Socket.IO classes
-keep class io.socket.** { *; }
-keep class io.socket.client.** { *; }

# Keep WebRTC classes
-keep class org.webrtc.** { *; }

# Keep Firebase classes
-keep class com.google.firebase.** { *; }

# Keep Retrofit classes
-keep class retrofit2.** { *; }
-keep class com.google.gson.** { *; }

# Keep Room classes
-keep class androidx.room.** { *; }

# Obfuscate everything else
-obfuscate
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*