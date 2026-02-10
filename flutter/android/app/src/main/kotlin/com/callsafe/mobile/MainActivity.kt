package com.callsafe.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import com.callsafe.mobile.channels.WebRTCChannelHandler
import com.callsafe.mobile.channels.PushChannelHandler
import com.callsafe.mobile.channels.AudioChannelHandler
import com.callsafe.mobile.channels.CallChannelHandler
import com.callsafe.mobile.socket.SocketChannelHandler

class MainActivity: FlutterActivity() {
    private var webrtcHandler: WebRTCChannelHandler? = null
    private var pushHandler: PushChannelHandler? = null
    private var audioHandler: AudioChannelHandler? = null
    private var callHandler: CallChannelHandler? = null
    private var socketHandler: SocketChannelHandler? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Register platform channel handlers
        webrtcHandler = WebRTCChannelHandler(flutterEngine.dartExecutor.binaryMessenger, this)
        pushHandler = PushChannelHandler(flutterEngine.dartExecutor.binaryMessenger, this)
        audioHandler = AudioChannelHandler(flutterEngine.dartExecutor.binaryMessenger)
        callHandler = CallChannelHandler(flutterEngine.dartExecutor.binaryMessenger, this)
        socketHandler = SocketChannelHandler(flutterEngine.dartExecutor.binaryMessenger, this)
    }

    override fun onDestroy() {
        webrtcHandler?.dispose()
        pushHandler?.dispose()
        audioHandler?.dispose()
        callHandler?.dispose()
        socketHandler?.dispose()
        super.onDestroy()
    }
}
