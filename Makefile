# Manual test environment — P3.3.3.4 Phase 2
#
# Usage:
#   make server-up                            # start Elixir server
#   make web-up                               # start SvelteKit frontend (all interfaces)
#   make flutter-apk LOCAL_IP=192.168.1.42   # build debug APK pointing at local server
#   make flutter-ios-build LOCAL_IP=192.168.1.42
#   make server-health LOCAL_IP=192.168.1.42 # verify server is reachable

LOCAL_IP    ?= localhost
SERVER_PORT ?= 4000
WS_URL      ?= ws://$(LOCAL_IP):$(SERVER_PORT)/ws
HTTP_URL    ?= http://$(LOCAL_IP):$(SERVER_PORT)

.PHONY: help server-up server-health web-up flutter-apk flutter-ios-build

help:
	@echo "Targets:"
	@echo "  server-up                         Start Elixir signaling server (reads elixir-signaling-server/.env)"
	@echo "  server-health                     Check server health endpoint"
	@echo "  web-up                            Start SvelteKit frontend (bound to all interfaces)"
	@echo "  flutter-apk LOCAL_IP=<ip>         Build debug APK pointing at local server"
	@echo "  flutter-ios-build LOCAL_IP=<ip>   Build debug iOS app pointing at local server"
	@echo ""
	@echo "Example:"
	@echo "  make server-up"
	@echo "  make flutter-apk LOCAL_IP=\$$(ipconfig getifaddr en0)"

server-up:
	cd elixir-signaling-server && \
		set -a && [ -f .env ] && . .env; set +a && \
		mix run --no-halt

server-health:
	@curl -sf $(HTTP_URL)/health | python3 -m json.tool && \
		echo "Server reachable at $(HTTP_URL)" || \
		echo "Server not reachable at $(HTTP_URL)"

web-up:
	cd frontend && npm run dev -- --host

flutter-apk:
	cd flutter && flutter build apk --debug \
		--dart-define=SIGNALING_SERVER_URL=$(WS_URL)
	@echo "APK: flutter/build/app/outputs/flutter-apk/app-debug.apk"
	@echo "Install: adb install flutter/build/app/outputs/flutter-apk/app-debug.apk"

flutter-ios-build:
	cd flutter && flutter build ios --debug --no-codesign \
		--dart-define=SIGNALING_SERVER_URL=$(WS_URL)
	@echo "iOS build complete. Install via Xcode or ios-deploy."
