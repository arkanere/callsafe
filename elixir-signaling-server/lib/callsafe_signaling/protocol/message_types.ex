defmodule CallsafeSignaling.Protocol.MessageTypes do
  @moduledoc """
  Protocol message type constants.
  Single source of truth for all WebSocket message types in the system.
  """

  @version "1.0.0"

  # Call lifecycle messages - client to server
  @call_initiate "call:initiate"
  @call_accept "call:accept"
  @call_reject "call:reject"
  @call_end "call:end"

  # Call lifecycle messages - server to client
  @call_failed "call:failed"
  @call_incoming "call:incoming"
  @call_accepted "call:accepted"
  @call_cancelled "call:cancelled"
  @call_ended "call:ended"
  @call_busy "call:busy"
  @call_unavailable "call:unavailable"
  @call_timeout "call:timeout"

  # WebRTC signaling messages
  @webrtc_offer "webrtc:offer"
  @webrtc_answer "webrtc:answer"
  @webrtc_ice_candidate "webrtc:ice-candidate"

  # Device connection messages
  @device_connect "device:connect"
  @device_disconnect "device:disconnect"
  @device_status "device:status"
  @device_connected "device:connected"
  @device_disconnected "device:disconnected"
  @device_status_updated "device:status-updated"

  # Media control messages
  @media_toggle "media:toggle"
  @call_escalate "call:escalate"
  @call_downgrade "call:downgrade"
  @escalation_accepted "escalation:accepted"
  @escalation_rejected "escalation:rejected"

  # WebSocket lifecycle messages
  @open "open"
  @close "close"
  @error "error"
  @server_shutdown "server:shutdown"

  def version, do: @version

  # Call lifecycle - client to server
  def call_initiate, do: @call_initiate
  def call_accept, do: @call_accept
  def call_reject, do: @call_reject
  def call_end, do: @call_end

  # Call lifecycle - server to client
  def call_failed, do: @call_failed
  def call_incoming, do: @call_incoming
  def call_accepted, do: @call_accepted
  def call_cancelled, do: @call_cancelled
  def call_ended, do: @call_ended
  def call_busy, do: @call_busy
  def call_unavailable, do: @call_unavailable
  def call_timeout, do: @call_timeout

  # WebRTC signaling
  def webrtc_offer, do: @webrtc_offer
  def webrtc_answer, do: @webrtc_answer
  def webrtc_ice_candidate, do: @webrtc_ice_candidate

  # Device connection
  def device_connect, do: @device_connect
  def device_disconnect, do: @device_disconnect
  def device_status, do: @device_status
  def device_connected, do: @device_connected
  def device_disconnected, do: @device_disconnected
  def device_status_updated, do: @device_status_updated

  # Media control
  def media_toggle, do: @media_toggle
  def call_escalate, do: @call_escalate
  def call_downgrade, do: @call_downgrade
  def escalation_accepted, do: @escalation_accepted
  def escalation_rejected, do: @escalation_rejected

  # WebSocket lifecycle
  def open, do: @open
  def close, do: @close
  def error, do: @error
  def server_shutdown, do: @server_shutdown

  @doc """
  Returns all valid message types as a list.
  """
  def all do
    [
      @call_initiate,
      @call_accept,
      @call_reject,
      @call_end,
      @call_failed,
      @call_incoming,
      @call_accepted,
      @call_cancelled,
      @call_ended,
      @call_busy,
      @call_unavailable,
      @call_timeout,
      @webrtc_offer,
      @webrtc_answer,
      @webrtc_ice_candidate,
      @device_connect,
      @device_disconnect,
      @device_status,
      @device_connected,
      @device_disconnected,
      @device_status_updated,
      @media_toggle,
      @call_escalate,
      @call_downgrade,
      @escalation_accepted,
      @escalation_rejected,
      @open,
      @close,
      @error,
      @server_shutdown
    ]
  end

  @doc """
  Check if a string is a valid message type.
  """
  def valid?(type), do: type in all()
end
