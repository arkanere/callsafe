package com.callsafe.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import com.callsafe.mobile.channels.WebRTCChannelHandler
import com.callsafe.mobile.channels.PushChannelHandler
import com.callsafe.mobile.channels.AudioChannelHandler

class MainActivity: FlutterActivity() {
    private var webrtcHandler: WebRTCChannelHandler? = null
    private var pushHandler: PushChannelHandler? = null
    private var audioHandler: AudioChannelHandler? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Register platform channel handlers
        webrtcHandler = WebRTCChannelHandler(flutterEngine.dartExecutor.binaryMessenger)
        pushHandler = PushChannelHandler(flutterEngine.dartExecutor.binaryMessenger)
        audioHandler = AudioChannelHandler(flutterEngine.dartExecutor.binaryMessenger)
    }

    override fun onDestroy() {
        webrtcHandler?.dispose()
        pushHandler?.dispose()
        audioHandler?.dispose()
        super.onDestroy()
    }
}
