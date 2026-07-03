defmodule CallsafeSignaling.Protocol.Validator do
  @moduledoc """
  Schema-driven message validation. Required fields and field types come
  from protocol/protocol.json at compile time (via Protocol.Spec) — nothing
  here is hand-mirrored from the spec.
  """

  alias CallsafeSignaling.Protocol.{Enums, MessageTypes, Spec}

  @type validation_result :: :ok | {:error, [String.t()]}

  # RFC 4122 version 4 UUID (the spec requires client-generated UUIDv4).
  @uuid_v4 ~r/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  @message_fields Map.new(Spec.message_names(), &{&1, Spec.fields(&1)})
  @type_fields Map.new(Map.keys(Spec.types()), &{&1, Spec.type_fields(&1)})

  @doc """
  Validate a message against its schema.
  Returns :ok or {:error, reasons}.
  """
  @spec validate(String.t(), map) :: validation_result
  def validate(message_type, payload) do
    if MessageTypes.valid?(message_type) do
      schema = Map.fetch!(@message_fields, message_type)

      errors =
        []
        |> check_required(schema, payload)
        |> check_field_types(schema, payload)

      case errors do
        [] -> :ok
        errors -> {:error, errors}
      end
    else
      {:error, ["Invalid message type: #{message_type}"]}
    end
  end

  defp check_required(errors, schema, payload) do
    missing =
      for {field, %{"required" => true}} <- schema,
          not Map.has_key?(payload, field),
          do: field

    case Enum.sort(missing) do
      [] -> errors
      fields -> ["Missing required fields: #{Enum.join(fields, ", ")}" | errors]
    end
  end

  defp check_field_types(errors, schema, payload) do
    Enum.reduce(payload, errors, fn {field, value}, acc ->
      case Map.get(schema, field) do
        # "type" itself and unknown fields are not validated (forward compatible)
        nil -> acc
        %{"type" => type} -> collect(acc, field, check_type(value, type))
      end
    end)
  end

  defp collect(errors, _field, :ok), do: errors
  defp collect(errors, field, {:error, reason}), do: ["#{field}: #{reason}" | errors]

  # Type checkers, keyed by the spec's type language

  defp check_type(value, "uuid") do
    if is_binary(value) and Regex.match?(@uuid_v4, value) do
      :ok
    else
      {:error, "must be a UUIDv4 string"}
    end
  end

  defp check_type(value, "string") when is_binary(value), do: :ok
  defp check_type(_value, "string"), do: {:error, "must be a string"}

  defp check_type(value, "number") when is_number(value), do: :ok
  defp check_type(_value, "number"), do: {:error, "must be a number"}

  defp check_type(value, "boolean") when is_boolean(value), do: :ok
  defp check_type(_value, "boolean"), do: {:error, "must be a boolean"}

  defp check_type(value, "string|null") when is_binary(value) or is_nil(value), do: :ok
  defp check_type(_value, "string|null"), do: {:error, "must be a string or null"}

  defp check_type(value, "number|null") when is_number(value) or is_nil(value), do: :ok
  defp check_type(_value, "number|null"), do: {:error, "must be a number or null"}

  defp check_type(value, "enum:" <> enum_name) do
    if is_binary(value) and Enums.valid?(enum_name, value) do
      :ok
    else
      {:error, "must be one of: #{Enum.join(Enums.values(enum_name), ", ")}"}
    end
  end

  defp check_type(value, "array<enum:" <> rest) do
    enum_name = String.trim_trailing(rest, ">")

    if is_list(value) and Enum.all?(value, &(is_binary(&1) and Enums.valid?(enum_name, &1))) do
      :ok
    else
      {:error, "must be an array of: #{Enum.join(Enums.values(enum_name), ", ")}"}
    end
  end

  defp check_type(value, "object:" <> type_name) when is_map(value) do
    schema = Map.fetch!(@type_fields, type_name)

    errors =
      []
      |> check_required(schema, value)
      |> check_field_types(schema, value)

    case errors do
      [] -> :ok
      errors -> {:error, "invalid #{type_name} (#{Enum.join(Enum.reverse(errors), "; ")})"}
    end
  end

  defp check_type(_value, "object:" <> type_name), do: {:error, "must be a #{type_name} object"}
end
