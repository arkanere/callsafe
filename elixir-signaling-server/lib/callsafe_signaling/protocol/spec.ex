defmodule CallsafeSignaling.Protocol.Spec do
  @moduledoc """
  Canonical protocol specification, loaded from protocol/protocol.json at
  COMPILE TIME. protocol.json is the single hand-edited source of truth for
  the wire protocol (see protocol/README.md); this module embeds it so the
  validator, enums, state machine and handlers never hand-mirror the spec.

  Recompiles automatically when protocol.json changes (@external_resource).
  """

  @protocol_path Path.expand("../../../../protocol/protocol.json", __DIR__)
  @external_resource @protocol_path
  @spec_data Jason.decode!(File.read!(@protocol_path))

  @doc "Protocol semver string, e.g. \"2.0.0\"."
  def version, do: @spec_data["version"]

  @doc "Major version integer of the protocol."
  def major_version do
    @spec_data["version"] |> String.split(".") |> hd() |> String.to_integer()
  end

  @doc "Map of message name => message definition."
  def messages, do: @spec_data["messages"]

  @doc "All message type names."
  def message_names, do: Map.keys(@spec_data["messages"])

  @doc "Message definition for a type, or nil."
  def message(type), do: @spec_data["messages"][type]

  @doc "Direction of a message: \"c2s\" | \"s2c\" | \"both\" | nil."
  def direction(type), do: get_in(@spec_data, ["messages", type, "direction"])

  @doc "Required sender role for a c2s message (\"customer\" | \"business\" | nil = any)."
  def sender_role(type), do: get_in(@spec_data, ["messages", type, "senderRole"])

  @doc "Whether a c2s message requires an authenticated connection (default true)."
  def requires_auth?(type) do
    case get_in(@spec_data, ["messages", type, "requiresAuth"]) do
      nil -> true
      value -> value
    end
  end

  @doc "Call states (strings) in which a call-scoped message is valid, or nil."
  def valid_states(type), do: get_in(@spec_data, ["messages", type, "validStates"])

  @doc "Field schema map for a message type."
  def fields(type), do: get_in(@spec_data, ["messages", type, "fields"]) || %{}

  @doc "Map of enum name => %{CONSTANT => value} from the spec."
  def enums, do: @spec_data["enums"]

  @doc "Valid string values for an enum name, or nil for unknown enums."
  def enum_values(enum_name) do
    case @spec_data["enums"][enum_name] do
      nil -> nil
      values -> Map.values(values)
    end
  end

  @doc "Structured type definitions (MediaCapabilities, SessionDescription, IceCandidate)."
  def types, do: @spec_data["types"]

  @doc "Field schema map for a structured type."
  def type_fields(type_name), do: get_in(@spec_data, ["types", type_name, "fields"]) || %{}

  @doc "State machine transitions: %{from_state => [%{\"to\" => ..., \"on\" => ...}]}."
  def transitions, do: @spec_data["stateMachine"]["transitions"]

  @doc "Terminal call states (strings)."
  def terminal_states, do: @spec_data["stateMachine"]["terminalStates"]

  @doc "Initial call state (string)."
  def initial_state, do: @spec_data["stateMachine"]["initialState"]

  @doc "Timer definitions: %{name => %{\"defaultMs\" => ..., \"description\" => ...}}."
  def timers, do: @spec_data["timers"]

  @doc "Default duration in ms for a spec timer name."
  def timer_default_ms(name), do: get_in(@spec_data, ["timers", name, "defaultMs"])

  @doc "Transport parameters (heartbeat intervals etc.)."
  def transport, do: @spec_data["transport"]
end
