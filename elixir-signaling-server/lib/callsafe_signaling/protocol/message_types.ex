defmodule CallsafeSignaling.Protocol.MessageTypes do
  @moduledoc """
  Protocol message type constants. The set of valid types is derived at
  compile time from protocol/protocol.json; the named accessors below exist
  for handler readability.
  """

  alias CallsafeSignaling.Protocol.Spec

  @all Spec.message_names()

  def version, do: Spec.version()

  # System
  def ping, do: "ping"
  def pong, do: "pong"
  def error, do: "error"
  def server_shutdown, do: "server:shutdown"

  # Device connection
  def device_connect, do: "device:connect"
  def device_connected, do: "device:connected"
  def device_disconnect, do: "device:disconnect"
  def device_disconnected, do: "device:disconnected"
  def device_status, do: "device:status"
  def device_status_updated, do: "device:status-updated"

  # Call lifecycle - client to server
  def call_initiate, do: "call:initiate"
  def call_cancel, do: "call:cancel"
  def call_accept, do: "call:accept"
  def call_reject, do: "call:reject"
  def call_end, do: "call:end"
  def call_reconnect, do: "call:reconnect"

  # Call lifecycle - server to client
  def call_initiated, do: "call:initiated"
  def call_incoming, do: "call:incoming"
  def call_cancelled, do: "call:cancelled"
  def call_accepted, do: "call:accepted"
  def call_unavailable, do: "call:unavailable"
  def call_busy, do: "call:busy"
  def call_ended, do: "call:ended"
  def call_failed, do: "call:failed"
  def call_timeout, do: "call:timeout"
  def call_reconnected, do: "call:reconnected"

  # WebRTC signaling
  def webrtc_offer, do: "webrtc:offer"
  def webrtc_answer, do: "webrtc:answer"
  def webrtc_ice_candidate, do: "webrtc:ice-candidate"

  # Media control & escalation
  def media_toggle, do: "media:toggle"
  def call_escalate, do: "call:escalate"
  def escalation_requested, do: "escalation:requested"
  def escalation_accept, do: "escalation:accept"
  def escalation_reject, do: "escalation:reject"
  def escalation_accepted, do: "escalation:accepted"
  def escalation_rejected, do: "escalation:rejected"
  def call_downgrade, do: "call:downgrade"
  def call_downgraded, do: "call:downgraded"

  @doc """
  Returns all valid message types as a list.
  """
  def all, do: @all

  @doc """
  Check if a string is a valid message type.
  """
  def valid?(type), do: type in @all
end
