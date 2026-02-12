defmodule CallsafeSignaling.Protocol.Enums do
  @moduledoc """
  Protocol enum types.
  Defines all enumerated values used across the protocol as atoms.
  """

  # CallType enum
  @type call_type :: :voice | :video
  @call_types [:voice, :video]

  # DeviceType enum
  @type device_type :: :web | :mobile
  @device_types [:web, :mobile]

  # DeviceStatus enum
  @type device_status :: :available | :unavailable
  @device_statuses [:available, :unavailable]

  # CallState enum
  @type call_state ::
          :initiated
          | :ringing
          | :connecting
          | :connected
          | :ended
          | :failed
          | :cancelled
          | :busy
          | :unavailable
          | :timeout
          | :camera_permission_denied
          | :video_paused_by_user
          | :video_paused_bandwidth
          | :escalation_pending

  @call_states [
    :initiated,
    :ringing,
    :connecting,
    :connected,
    :ended,
    :failed,
    :cancelled,
    :busy,
    :unavailable,
    :timeout,
    :camera_permission_denied,
    :video_paused_by_user,
    :video_paused_bandwidth,
    :escalation_pending
  ]

  # CallEndReason enum
  @type call_end_reason ::
          :normal
          | :customer_hangup
          | :business_hangup
          | :connection_failed
          | :timeout
          | :rejected

  @call_end_reasons [
    :normal,
    :customer_hangup,
    :business_hangup,
    :connection_failed,
    :timeout,
    :rejected
  ]

  # CallInitiator enum
  @type call_initiator :: :customer | :business
  @call_initiators [:customer, :business]

  # MediaTrackType enum
  @type media_track_type :: :audio | :video
  @media_track_types [:audio, :video]

  # MediaToggleAction enum
  @type media_toggle_action ::
          :enable_camera
          | :disable_camera
          | :enable_microphone
          | :disable_microphone
          | :flip_camera

  @media_toggle_actions [
    :enable_camera,
    :disable_camera,
    :enable_microphone,
    :disable_microphone,
    :flip_camera
  ]

  # Public API for validation

  def valid_call_type?(type) when is_atom(type), do: type in @call_types
  def valid_call_type?(type) when is_binary(type), do: String.to_atom(type) in @call_types
  def valid_call_type?(_), do: false

  def valid_device_type?(type) when is_atom(type), do: type in @device_types
  def valid_device_type?(type) when is_binary(type), do: String.to_atom(type) in @device_types
  def valid_device_type?(_), do: false

  def valid_device_status?(status) when is_atom(status), do: status in @device_statuses

  def valid_device_status?(status) when is_binary(status),
    do: String.to_atom(status) in @device_statuses

  def valid_device_status?(_), do: false

  def valid_call_state?(state) when is_atom(state), do: state in @call_states
  def valid_call_state?(state) when is_binary(state), do: String.to_atom(state) in @call_states
  def valid_call_state?(_), do: false

  def valid_call_end_reason?(reason) when is_atom(reason), do: reason in @call_end_reasons

  def valid_call_end_reason?(reason) when is_binary(reason),
    do: String.to_atom(reason) in @call_end_reasons

  def valid_call_end_reason?(_), do: false

  def valid_call_initiator?(initiator) when is_atom(initiator), do: initiator in @call_initiators

  def valid_call_initiator?(initiator) when is_binary(initiator),
    do: String.to_atom(initiator) in @call_initiators

  def valid_call_initiator?(_), do: false

  def valid_media_track_type?(type) when is_atom(type), do: type in @media_track_types

  def valid_media_track_type?(type) when is_binary(type),
    do: String.to_atom(type) in @media_track_types

  def valid_media_track_type?(_), do: false

  def valid_media_toggle_action?(action) when is_atom(action),
    do: action in @media_toggle_actions

  def valid_media_toggle_action?(action) when is_binary(action),
    do: String.to_atom(action) in @media_toggle_actions

  def valid_media_toggle_action?(_), do: false

  # String to atom conversion helpers
  def to_call_type(value) when is_binary(value), do: String.to_atom(value)
  def to_call_type(value) when is_atom(value), do: value

  def to_device_type(value) when is_binary(value), do: String.to_atom(value)
  def to_device_type(value) when is_atom(value), do: value

  def to_device_status(value) when is_binary(value), do: String.to_atom(value)
  def to_device_status(value) when is_atom(value), do: value

  def to_call_state(value) when is_binary(value), do: String.to_atom(value)
  def to_call_state(value) when is_atom(value), do: value

  def to_call_end_reason(value) when is_binary(value), do: String.to_atom(value)
  def to_call_end_reason(value) when is_atom(value), do: value

  def to_call_initiator(value) when is_binary(value), do: String.to_atom(value)
  def to_call_initiator(value) when is_atom(value), do: value

  def to_media_track_type(value) when is_binary(value), do: String.to_atom(value)
  def to_media_track_type(value) when is_atom(value), do: value

  def to_media_toggle_action(value) when is_binary(value), do: String.to_atom(value)
  def to_media_toggle_action(value) when is_atom(value), do: value
end
