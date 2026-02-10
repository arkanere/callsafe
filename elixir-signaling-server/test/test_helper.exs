# Stop the application if it's running to allow tests to control supervision
Application.stop(:callsafe_signaling)

ExUnit.start()
