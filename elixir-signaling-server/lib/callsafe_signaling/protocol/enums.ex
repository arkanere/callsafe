defmodule CallsafeSignaling.Protocol.Enums do
  @moduledoc """
  Protocol enum values, derived at compile time from protocol/protocol.json
  (via `CallsafeSignaling.Protocol.Spec`).

  String-to-atom conversion only ever maps values that exist in the spec, so
  unvalidated client input can never create new atoms.
  """

  alias CallsafeSignaling.Protocol.Spec

  @enums Spec.enums()
  @enum_values Map.new(@enums, fn {name, kv} -> {name, Map.values(kv)} end)

  # Fixed, spec-bounded string => atom table (safe: built at compile time).
  @value_atoms @enum_values
               |> Map.values()
               |> List.flatten()
               |> Enum.uniq()
               |> Map.new(&{&1, String.to_atom(&1)})

  @type call_type :: :voice | :video
  @type device_type :: :web | :mobile
  @type device_status :: :available | :unavailable
  @type role :: :customer | :business
  @type media_track_type :: :audio | :video
  @type media_toggle_action ::
          :enable_camera
          | :disable_camera
          | :enable_microphone
          | :disable_microphone
          | :flip_camera
  @type call_state ::
          :initiated
          | :ringing
          | :connecting
          | :connected
          | :escalation_pending
          | :ended
          | :failed
          | :cancelled
          | :busy
          | :unavailable
          | :timeout
  @type call_end_reason :: :normal | :customer_hangup | :business_hangup

  @doc """
  Check a value against a spec enum by name (e.g. `valid?("CallType", "voice")`).
  Accepts strings or atoms.
  """
  def valid?(enum_name, value) when is_binary(value),
    do: value in Map.get(@enum_values, enum_name, [])

  def valid?(enum_name, value) when is_atom(value),
    do: valid?(enum_name, Atom.to_string(value))

  def valid?(_enum_name, _value), do: false

  @doc """
  Convert a spec enum string to its atom. Returns nil for values not in the
  spec (never creates atoms). Atoms pass through unchanged.
  """
  def to_atom(value) when is_binary(value), do: Map.get(@value_atoms, value)
  def to_atom(value) when is_atom(value), do: value

  @doc "All valid string values for a spec enum name."
  def values(enum_name), do: Map.get(@enum_values, enum_name, [])

  # Named helpers (kept for handler/test readability)

  def valid_call_type?(v), do: valid?("CallType", v)
  def valid_device_type?(v), do: valid?("DeviceType", v)
  def valid_device_status?(v), do: valid?("DeviceStatus", v)
  def valid_role?(v), do: valid?("Role", v)
  def valid_call_state?(v), do: valid?("CallState", v)
  def valid_call_end_reason?(v), do: valid?("CallEndReason", v)
  def valid_call_fail_reason?(v), do: valid?("CallFailReason", v)
  def valid_media_track_type?(v), do: valid?("MediaTrackType", v)
  def valid_media_toggle_action?(v), do: valid?("MediaToggleAction", v)
  def valid_error_code?(v), do: valid?("ErrorCode", v)

  def to_call_type(v), do: to_atom(v)
  def to_device_type(v), do: to_atom(v)
  def to_device_status(v), do: to_atom(v)
  def to_role(v), do: to_atom(v)
  def to_call_state(v), do: to_atom(v)
  def to_call_end_reason(v), do: to_atom(v)
  def to_call_fail_reason(v), do: to_atom(v)
  def to_media_toggle_action(v), do: to_atom(v)
end
