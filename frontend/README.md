# CallSafe Frontend

Next.js (App Router) app deployed on Vercel at [callsafe.tech](https://callsafe.tech).
It serves three roles for [CallSafe](../README.md):

- **Marketing site + business dashboard** — sign-up, call handling in the
  browser, widget configuration.
- **Embeddable call widget** — a tiny loader stub (`src/embed/`) that
  lazy-loads the call core on demand, so a host page pays almost nothing
  until a visitor starts a call.
- **Identity provider** — signs the socket JWTs (HS256, shared `JWT_SECRET`
  with the signaling server) and issues short-lived guest tokens for
  anonymous embed visitors.

System design: [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Development

```sh
npm install
npm run dev        # local dev server
npm run check      # tsc --noEmit
npm run lint       # prettier + eslint
npm run build      # production build
```

## Configuration

- `NEXT_PUBLIC_SIGNALING_SERVER_URL` — HTTPS base of the signaling server (the code
  derives `wss://…/ws` from it). Inlined at build time.
- `JWT_SECRET` — must equal the signaling server's secret, or the
  `device:connect` handshake fails with `invalid_signature`.

See [`../DEPLOY.md`](../DEPLOY.md) for the full frontend↔server wiring.
