package com.callsafe.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import com.callsafe.mobile.channels.PushChannelHandler
import com.callsafe.mobile.channels.AudioChannelHandler
import com.callsafe.mobile.channels.CallChannelHandler

class MainActivity: FlutterActivity() {
    companion object {
        // Read by CallSafeFirebaseMessagingService to decide whether an
        // incoming-call push needs a notification (no resumed activity).
        @Volatile
        var isInForeground = false
            private set
    }

    private var pushHandler: PushChannelHandler? = null
    private var audioHandler: AudioChannelHandler? = null
    private var callHandler: CallChannelHandler? = null

    override fun onResume() {
        super.onResume()
        isInForeground = true
    }

    override fun onPause() {
        isInForeground = false
        super.onPause()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Register platform channel handlers
        pushHandler = PushChannelHandler(flutterEngine.dartExecutor.binaryMessenger, this)
        audioHandler = AudioChannelHandler(flutterEngine.dartExecutor.binaryMessenger)
        callHandler = CallChannelHandler(flutterEngine.dartExecutor.binaryMessenger, this)
    }

    override fun onDestroy() {
        pushHandler?.dispose()
        audioHandler?.dispose()
        callHandler?.dispose()
        super.onDestroy()
    }
}
