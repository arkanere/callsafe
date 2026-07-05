# Deploying the Signaling Server

Operational runbook for the Elixir signaling server (`elixir-signaling-server/`)
that powers real-time call signaling for CallSafe.

> **No secrets in this file.** Only variable *names* and procedures live here.
> Actual values live in the server's `/opt/callsafe/env` (chmod 600) and in the
> Vercel project settings — never in git.

## Architecture

```
Browser / mobile client
        │  wss://signal.callsafe.tech/ws   (TLS)
        ▼
   Caddy (:443, :80)         ← auto Let's Encrypt cert, HTTP→HTTPS redirect
        │  reverse_proxy 127.0.0.1:4000
        ▼
   Elixir release (:4000)    ← systemd service `callsafe-signaling`
```

- **Host:** DigitalOcean droplet, region `sgp1`, hostname `signal.callsafe.tech`.
- **DNS:** Cloudflare, an **A record** for `signal` → droplet IP, set to
  **DNS-only (grey cloud)** so Caddy can issue its own cert and WebSockets pass
  through untouched.
- **TLS:** terminated by Caddy with an auto-renewing Let's Encrypt certificate.
- **Process:** an Elixir/OTP release run by systemd (`Restart=always`), as the
  non-root `callsafe` user.
- **Runtime:** Erlang/OTP **27.3+** and Elixir **1.19**.

## Prerequisites

- Ubuntu 24.04 (noble) droplet, with your SSH key installed for `root`.
- A Cloudflare-managed zone for the domain, with permission to edit DNS records.
- The frontend (Vercel) must sign socket tokens with the **same `JWT_SECRET`**
  as this server (see [Secrets](#secrets)).

## Environment variables (`/opt/callsafe/env`)

Loaded by systemd via `EnvironmentFile`. Names only — set real values on the host.

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | HMAC-SHA256 key for verifying socket tokens. **Must match Vercel's `JWT_SECRET`.** |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service-account JSON for push notifications. |
| `TURN_SERVER_URL` | Comma-separated TURN URLs (optional). |
| `TURN_SECRET` | TURN shared secret (optional). |
| `PORT` | App HTTP port (default `4000`; Caddy proxies to it). |
| `MIX_ENV` | `prod`. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated web origins allowed to call the HTTP API. |

## One-time provisioning

Run as `root` on the droplet.

```sh
# 1. Swap (helps on small droplets) + firewall
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo "/swapfile none swap sw 0 0" >> /etc/fstab
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# 2. App user + directory
useradd -r -m -d /opt/callsafe -s /usr/sbin/nologin callsafe
mkdir -p /opt/callsafe

# 3. Erlang/OTP 27.3+  (27.1.3–27.2 have a TLS bug — see Gotchas)
#    Official precompiled package from Erlang Solutions (binaries2):
curl -fsSL https://binaries2.erlang-solutions.com/GPG-KEY-pmanager.asc \
  | gpg --dearmor -o /usr/share/keyrings/erlang.gpg
echo "deb [signed-by=/usr/share/keyrings/erlang.gpg] \
  https://binaries2.erlang-solutions.com/ubuntu noble-esl-erlang-27 contrib" \
  > /etc/apt/sources.list.d/erlang.list
apt-get update && apt-get install -y esl-erlang    # installs OTP 27.3.x

# 4. Elixir 1.19 (precompiled for OTP 27)
curl -fsSL -o /tmp/elixir.zip \
  https://github.com/elixir-lang/elixir/releases/download/v1.19.5/elixir-otp-27.zip
mkdir -p /usr/local/lib/elixir && unzip -oq /tmp/elixir.zip -d /usr/local/lib/elixir
for b in elixir elixirc mix iex; do ln -sf /usr/local/lib/elixir/bin/$b /usr/local/bin/$b; done
```

Then create `/opt/callsafe/env` (chmod 600, owned by `callsafe`) with the
variables above, and install the systemd unit and Caddy (below).

### systemd unit — `/etc/systemd/system/callsafe-signaling.service`

```ini
[Unit]
Description=CallSafe Elixir signaling server
After=network-online.target
Wants=network-online.target

[Service]
User=callsafe
Group=callsafe
WorkingDirectory=/opt/callsafe/app
EnvironmentFile=/opt/callsafe/env
ExecStart=/opt/callsafe/app/bin/callsafe_signaling start
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```sh
systemctl daemon-reload && systemctl enable callsafe-signaling
```

### Caddy — `/etc/caddy/Caddyfile`

```
signal.callsafe.tech {
	reverse_proxy 127.0.0.1:4000
}
```

```sh
systemctl enable --now caddy   # obtains the Let's Encrypt cert on first start
```

Caddy needs the DNS A record to already resolve to the droplet before it can
complete the ACME HTTP-01 challenge.

## Build & deploy a new version

The release must be built **on the droplet** (native amd64). Cross-building on
Apple Silicon fails — see [Gotchas](#gotchas).

```sh
# On the droplet, with the source tree at /opt/callsafe/build/src
cd /opt/callsafe/build/src
export MIX_ENV=prod
mix deps.get
mix release --overwrite

# Swap the release in and restart
rm -rf /opt/callsafe/app
cp -r _build/prod/rel/callsafe_signaling /opt/callsafe/app
chown -R callsafe:callsafe /opt/callsafe/app
systemctl restart callsafe-signaling
```

> The app reads `protocol/protocol.json` at **compile time** from a sibling
> directory (`../protocol/` relative to the project root), so that folder must
> be present in the build tree alongside `elixir-signaling-server/`.

## Frontend wiring (Vercel)

The SvelteKit frontend derives the WebSocket URL from an HTTPS base:

- `VITE_SIGNALING_SERVER_URL = https://signal.callsafe.tech`
  (the code converts `https://` → `wss://…/ws` and reuses the base for the
  guest-token / TURN-credential HTTP calls — do **not** put `wss://` here).
- `VITE_*` values are inlined at **build time**, so changing this requires a
  redeploy.
- `JWT_SECRET` on Vercel **must equal** the server's `JWT_SECRET`, or the
  `device:connect` handshake fails with `auth_failed: invalid_signature`.

## Verify

```sh
curl https://signal.callsafe.tech/health          # -> {"status":"ok",...}
# WebSocket upgrade (force HTTP/1.1; ws upgrade is invalid over HTTP/2):
curl --http1.1 -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://signal.callsafe.tech/ws                  # -> HTTP/1.1 101
```

Logs: `journalctl -u callsafe-signaling -f` and `journalctl -u caddy -f`.

## Gotchas

- **OTP TLS bug (why 27.3+):** OTP 27.1.3–27.2 reject hex.pm's CDN certificate
  with `key_usage_mismatch`, breaking `mix deps.get`. Fixed in **OTP 27.3**.
  Use a precompiled 27.3.x package; do not hand-build an older 27.x.
- **No cross-building from Apple Silicon:** building the amd64 release under
  Docker/Rosetta emulation on an M-series Mac crashes the BEAM
  (`prim_tty:isatty` NIF). Build on the droplet (native amd64) instead.
- **`JWT_SECRET` must match Vercel** (see above) — `invalid_signature` = mismatch.
- **DNS record must be DNS-only** (grey cloud) on Cloudflare, so Caddy can issue
  its own cert and WebSockets aren't proxied/buffered by Cloudflare.
- **Negative DNS cache after first creating the record:** a machine that looked
  up the hostname *before* the record existed may cache the NXDOMAIN for up to
  the zone's SOA minimum (e.g. 30 min). Flush locally with
  `sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder` (macOS).
  New end users are unaffected.
- **WebSocket upgrade needs HTTP/1.1:** the `Upgrade`/`Connection` headers are
  invalid in HTTP/2, so `curl` over HTTPS negotiates h2 and returns `426` unless
  you pass `--http1.1`. Browsers handle this automatically.
