# Authentication and Rate Limiting

Security middleware layer for CallSafe signaling server.

## JWT Authentication

Pure functional JWT validation using HS256.

### Generate Token

```elixir
alias CallsafeSignaling.Auth.JWT

token = JWT.generate("device_123", "business_456", "secret_key")
# => "eyJhbGc..."
```

### Verify Token

```elixir
case JWT.verify(token) do
  {:ok, claims} ->
    # claims.device_id, claims.business_id, claims.exp, claims.iat
    :ok

  {:error, :expired} ->
    # Token expired
    :error

  {:error, :invalid_token} ->
    # Malformed or invalid signature
    :error

  {:error, :missing_secret} ->
    # JWT_SECRET not configured
    :error
end
```

## Rate Limiting

ETS-based request counters. No mutation - returns result as data.

### Check Device Limit

```elixir
alias CallsafeSignaling.Auth.RateLimiter

case RateLimiter.check_device("device_123") do
  :ok -> :allowed
  {:error, :rate_limit_exceeded} -> :blocked
end
```

### Check IP Limit

```elixir
case RateLimiter.check_ip("192.168.1.1") do
  :ok -> :allowed
  {:error, :rate_limit_exceeded} -> :blocked
end
```

### Check Both

```elixir
case RateLimiter.check("device_123", "192.168.1.1") do
  :ok -> :allowed
  {:error, :rate_limit_exceeded} -> :blocked
end
```

### Configuration

```elixir
# config/config.exs
config :callsafe_signaling,
  jwt_secret: System.get_env("JWT_SECRET"),
  max_requests_per_device: 100,
  max_requests_per_ip: 1000,
  rate_limit_window_seconds: 60
```

## Middleware Pipeline

Composable middleware following functional composition.

### Standard Pipeline

```elixir
alias CallsafeSignaling.Middleware.Pipeline

# Build context
context = Pipeline.build_context(token, ip_address)

# Execute standard pipeline (auth + rate limit)
case Pipeline.execute(Pipeline.standard_pipeline(), context) do
  {:ok, authenticated_context} ->
    # authenticated_context.device_id
    # authenticated_context.business_id
    # authenticated_context.claims
    :ok

  {:error, :missing_token} -> :error
  {:error, :invalid_token} -> :error
  {:error, :expired} -> :error
  {:error, :rate_limit_exceeded} -> :error
end
```

### Custom Pipeline

```elixir
pipeline = [
  Pipeline.authenticate_jwt(),
  Pipeline.rate_limit_device(),
  Pipeline.enrich_metadata(%{source: "websocket"}),
  Pipeline.log("Connection authenticated")
]

Pipeline.execute(pipeline, context)
```

### Compose Middleware

```elixir
# Create reusable composed middleware
auth_and_rate_limit = Pipeline.compose([
  Pipeline.authenticate_jwt(),
  Pipeline.rate_limit()
])

# Use it
auth_and_rate_limit.(context)
```

## Example: WebSocket Handler

```elixir
def handle_connect(%{token: token, ip: ip}) do
  context = Pipeline.build_context(token, ip)

  case Pipeline.execute(Pipeline.standard_pipeline(), context) do
    {:ok, ctx} ->
      # Store authenticated context
      state = %{
        device_id: ctx.device_id,
        business_id: ctx.business_id,
        authenticated: true
      }
      {:ok, state}

    {:error, reason} ->
      {:error, reason}
  end
end
```

## Testing

Use provided reset functions:

```elixir
# Reset device counter
RateLimiter.reset_device("device_123")

# Reset IP counter
RateLimiter.reset_ip("192.168.1.1")

# Check current counts
RateLimiter.get_device_count("device_123")
RateLimiter.get_ip_count("192.168.1.1")
```
