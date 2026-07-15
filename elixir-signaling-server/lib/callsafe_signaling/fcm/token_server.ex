defmodule CallsafeSignaling.FCM.TokenServer do
  @moduledoc """
  GenServer that caches OAuth2 bearer tokens for the FCM HTTP v2 API.

  Reads a Google service account JSON from the FCM_SERVICE_ACCOUNT_FILE env var
  (path to the JSON file, preferred — systemd EnvironmentFile mangles the inline
  JSON's backslashes) or FCM_SERVICE_ACCOUNT_JSON (inline JSON), signs JWT
  assertions with RS256, and exchanges them for short-lived access tokens via
  Google's OAuth2 token endpoint. Tokens are cached until 5 minutes before expiry.
  """

  use GenServer
  require Logger

  @token_endpoint "https://oauth2.googleapis.com/token"
  @scope "https://www.googleapis.com/auth/firebase.messaging"
  @expiry_buffer_seconds 300

  # --- Public API ---

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @doc "Return a cached bearer token or refresh if expired. Returns {:ok, token, project_id} | {:error, reason}."
  def get_token do
    GenServer.call(__MODULE__, :get_token)
  end

  @doc "Return the project_id parsed from the service account, or {:error, reason}."
  def project_id do
    GenServer.call(__MODULE__, :project_id)
  end

  # --- GenServer callbacks ---

  @impl true
  def init(:ok) do
    case parse_service_account() do
      {:ok, creds} ->
        Logger.info("FCM TokenServer initialized",
          project_id: creds.project_id,
          client_email: creds.client_email
        )

        {:ok, %{creds: creds, token: nil, expires_at: 0}}

      {:error, reason} ->
        Logger.warning(
          "FCM TokenServer: service account not configured (#{inspect(reason)}). Push notifications disabled."
        )

        {:ok, %{creds: nil, token: nil, expires_at: 0}}
    end
  end

  @impl true
  def handle_call(:get_token, _from, %{creds: nil} = state) do
    {:reply, {:error, :fcm_not_configured}, state}
  end

  def handle_call(:get_token, _from, state) do
    now = System.system_time(:second)

    if state.token && now < state.expires_at - @expiry_buffer_seconds do
      {:reply, {:ok, state.token, state.creds.project_id}, state}
    else
      case refresh_token(state.creds) do
        {:ok, access_token, expires_in} ->
          new_state = %{state | token: access_token, expires_at: now + expires_in}
          {:reply, {:ok, access_token, state.creds.project_id}, new_state}

        {:error, reason} = err ->
          Logger.error("FCM TokenServer: token refresh failed: #{inspect(reason)}")
          {:reply, err, state}
      end
    end
  end

  def handle_call(:project_id, _from, %{creds: nil} = state) do
    {:reply, {:error, :fcm_not_configured}, state}
  end

  def handle_call(:project_id, _from, state) do
    {:reply, {:ok, state.creds.project_id}, state}
  end

  # --- Token refresh ---

  defp refresh_token(creds) do
    now = System.system_time(:second)

    jwt_claims = %{
      "iss" => creds.client_email,
      "scope" => @scope,
      "aud" => @token_endpoint,
      "iat" => now,
      "exp" => now + 3600
    }

    signer = Joken.Signer.create("RS256", %{"pem" => creds.private_key})

    case Joken.Signer.sign(jwt_claims, signer) do
      {:ok, signed_jwt} ->
        exchange_jwt_for_token(signed_jwt)

      {:error, reason} ->
        {:error, {:jwt_sign_failed, reason}}
    end
  end

  defp exchange_jwt_for_token(signed_jwt) do
    body =
      URI.encode_query(%{
        "grant_type" => "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion" => signed_jwt
      })

    headers = [{"content-type", "application/x-www-form-urlencoded"}]

    case Req.post(token_endpoint(), headers: headers, body: body) do
      {:ok, %{status: 200, body: %{"access_token" => token, "expires_in" => expires_in}}} ->
        {:ok, token, expires_in}

      {:ok, %{status: status, body: resp_body}} ->
        {:error, {:token_exchange_failed, status, resp_body}}

      {:error, reason} ->
        {:error, {:token_exchange_error, reason}}
    end
  end

  # --- Service account parsing ---

  defp parse_service_account do
    with {:ok, json_str} <- read_service_account_json() do
      case Jason.decode(json_str) do
        {:ok, %{"client_email" => email, "private_key" => key, "project_id" => project}} ->
          {:ok, %{client_email: email, private_key: key, project_id: project}}

        {:ok, _} ->
          {:error, :missing_required_fields}

        {:error, _} ->
          {:error, :invalid_json}
      end
    end
  end

  # FCM_SERVICE_ACCOUNT_FILE (path) takes precedence over the inline JSON.
  defp read_service_account_json do
    file = System.get_env("FCM_SERVICE_ACCOUNT_FILE")

    cond do
      is_binary(file) and file != "" ->
        case File.read(file) do
          {:ok, content} -> {:ok, content}
          {:error, reason} -> {:error, {:file_read_failed, file, reason}}
        end

      true ->
        case System.get_env("FCM_SERVICE_ACCOUNT_JSON") do
          nil -> {:error, :env_var_missing}
          "" -> {:error, :env_var_empty}
          json_str -> {:ok, json_str}
        end
    end
  end

  defp token_endpoint do
    Application.get_env(:callsafe_signaling, :fcm_token_endpoint, @token_endpoint)
  end
end
