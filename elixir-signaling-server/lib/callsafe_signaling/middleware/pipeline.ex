defmodule CallsafeSignaling.Middleware.Pipeline do
  @moduledoc """
  Composable middleware pipeline following functional composition.
  Each middleware is a pure function: context -> {:ok, context} | {:error, reason}
  Pipeline composes these functions left-to-right.
  """

  alias CallsafeSignaling.Auth.{JWT, RateLimiter}

  @type context :: %{
          token: String.t() | nil,
          ip_address: String.t() | nil,
          device_id: String.t() | nil,
          business_id: String.t() | nil,
          claims: map() | nil,
          metadata: map()
        }

  @type middleware :: (context -> {:ok, context} | {:error, atom()})
  @type pipeline_result :: {:ok, context} | {:error, atom()}

  @doc """
  Execute a pipeline of middleware functions.
  Each middleware transforms context or returns error.
  Stops on first error.
  Pure functional composition.
  """
  @spec execute([middleware], context) :: pipeline_result
  def execute([], context), do: {:ok, context}

  def execute([middleware | rest], context) do
    case middleware.(context) do
      {:ok, new_context} -> execute(rest, new_context)
      {:error, _reason} = error -> error
    end
  end

  @doc """
  Compose multiple pipelines into one.
  """
  @spec compose([middleware]) :: middleware
  def compose(middlewares) do
    fn context -> execute(middlewares, context) end
  end

  # Built-in middleware functions

  @doc """
  JWT authentication middleware.
  Validates token and extracts claims into context.
  """
  @spec authenticate_jwt() :: middleware
  def authenticate_jwt do
    fn context ->
      case Map.get(context, :token) do
        nil ->
          {:error, :missing_token}

        token ->
          case JWT.verify(token) do
            {:ok, claims} ->
              {:ok,
               context
               |> Map.put(:claims, claims)
               |> Map.put(:device_id, claims.device_id)
               |> Map.put(:business_id, claims.business_id)
               |> Map.put(:role, claims.role)}

            {:error, reason} ->
              {:error, reason}
          end
      end
    end
  end

  @doc """
  Rate limiting middleware for device_id.
  Requires device_id in context.
  """
  @spec rate_limit_device() :: middleware
  def rate_limit_device do
    fn context ->
      case Map.get(context, :device_id) do
        nil ->
          {:error, :missing_device_id}

        device_id ->
          case RateLimiter.check_device(device_id) do
            :ok -> {:ok, context}
            {:error, reason} -> {:error, reason}
          end
      end
    end
  end

  @doc """
  Rate limiting middleware for IP address.
  Requires ip_address in context.
  """
  @spec rate_limit_ip() :: middleware
  def rate_limit_ip do
    fn context ->
      case Map.get(context, :ip_address) do
        nil ->
          {:error, :missing_ip_address}

        ip_address ->
          case RateLimiter.check_ip(ip_address) do
            :ok -> {:ok, context}
            {:error, reason} -> {:error, reason}
          end
      end
    end
  end

  @doc """
  Combined rate limiting middleware.
  Checks both device_id and IP address.
  """
  @spec rate_limit() :: middleware
  def rate_limit do
    fn context ->
      device_id = Map.get(context, :device_id)
      ip_address = Map.get(context, :ip_address)

      case {device_id, ip_address} do
        {nil, _} ->
          {:error, :missing_device_id}

        {_, nil} ->
          {:error, :missing_ip_address}

        {device_id, ip_address} ->
          case RateLimiter.check(device_id, ip_address) do
            :ok -> {:ok, context}
            {:error, reason} -> {:error, reason}
          end
      end
    end
  end

  @doc """
  Logging middleware - logs context transformation.
  Always succeeds, only adds side effect.
  """
  @spec log(String.t()) :: middleware
  def log(message) do
    fn context ->
      require Logger
      Logger.debug("#{message}: #{inspect(context)}")
      {:ok, context}
    end
  end

  @doc """
  Metadata enrichment middleware.
  Adds arbitrary metadata to context.
  """
  @spec enrich_metadata(map()) :: middleware
  def enrich_metadata(metadata) do
    fn context ->
      existing_metadata = Map.get(context, :metadata, %{})
      new_metadata = Map.merge(existing_metadata, metadata)
      {:ok, Map.put(context, :metadata, new_metadata)}
    end
  end

  # Standard pipelines

  @doc """
  Standard authentication and rate limiting pipeline.
  Use for most WebSocket connection scenarios.
  """
  @spec standard_pipeline() :: [middleware]
  def standard_pipeline do
    [
      authenticate_jwt(),
      rate_limit()
    ]
  end

  @doc """
  Authentication-only pipeline.
  Use when rate limiting is not required.
  """
  @spec auth_only_pipeline() :: [middleware]
  def auth_only_pipeline do
    [
      authenticate_jwt()
    ]
  end

  @doc """
  Rate limiting-only pipeline.
  Use when authentication is handled elsewhere.
  """
  @spec rate_limit_only_pipeline() :: [middleware]
  def rate_limit_only_pipeline do
    [
      rate_limit()
    ]
  end

  # Helper to build initial context

  @doc """
  Build initial context from connection parameters.
  """
  @spec build_context(String.t() | nil, String.t() | nil, map()) :: context
  def build_context(token, ip_address, metadata \\ %{}) do
    %{
      token: token,
      ip_address: ip_address,
      device_id: nil,
      business_id: nil,
      claims: nil,
      metadata: metadata
    }
  end
end
