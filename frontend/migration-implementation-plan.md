# Migration Implementation Plan: SvelteKit → Next.js

**Parent document:** `plan.md` (read it first — goals, non-goals, and risks are defined there and are binding).
**Audience:** the implementing agent/developer. This document is decision-complete: every
file has a disposition and every open question from `plan.md` is resolved below. Do not
re-litigate decisions here; if something turns out to be impossible as written, stop and ask.

---

## Progress log (updated as work lands — read this first on a cold start)

**Branch:** `next-migration` (created off `main` @ `4852a3f`).

| Phase | Status |
|---|---|
| 0 Scaffold | ✅ done |
| 1 Port `src/lib/` | ✅ done |
| 2 API route handlers | ⬜ not started |
| 3 `middleware.ts` | ⬜ not started |
| 4 Marketing RSC | ⬜ not started |
| 5 Dashboard | ⬜ not started |
| 6 `receive/[handle]` | ⬜ not started |
| 7 `embed/[handle]` | ⬜ not started |
| 8 Embed builds → `public/` | ⬜ not started |
| 9 Deletion & cleanup | ⬜ not started |
| 10 E2E + cutover | ⬜ not started |

### Notes / deviations from the plan as written

- **`plan.md` (the parent document) does not exist** in this repo or anywhere in git
  history. This implementation plan is being followed as the sole source of truth.
- **Next.js 16 / React 19** are what `npm install next` resolved to (plan said "latest stable").
- **`next lint` was removed in Next 16.** The `lint` script is
  `prettier --check . && eslint .` instead of `next lint`. `eslint-config-next` is
  installed; the flat config swap still happens in Phase 9.
- **`tsconfig.json` temporarily excludes the legacy SvelteKit sources**
  (`src/routes/**`, `src/hooks.server.ts`, `src/app.d.ts`) so `next build` can typecheck
  while both stacks coexist. **Remove those exclusions in Phase 9** when the files are deleted.
- `src/app/page.tsx` is a **placeholder** home page — delete it in Phase 4 when
  `app/(marketing)/page.tsx` lands (they would otherwise conflict on `/`).
- `.env.local` now carries **both** `VITE_SIGNALING_SERVER_URL` and
  `NEXT_PUBLIC_SIGNALING_SERVER_URL` (same value) so both stacks run locally.
- Phase 0/1 verification actually run and passing: `npm run build` (Next, typecheck clean),
  `npm run build:embed` (both bundles, **zero** `process.env` occurrences in the output).

---

## Rules for the implementer

1. **Behaviour parity only.** Same responses, same status codes, same cookie attributes,
   same redirects, same log lines. Do not refactor, rename, deduplicate, or "improve"
   while porting. The existing verbose `console.log` statements stay.
2. **Do not touch** `../protocol/`, the Elixir signaling server, `src/embed/stub.js`,
   or `src/embed/core.js` (except zero code changes — only their build output directory moves).
3. **Work on a branch** (`next-migration`). The SvelteKit app keeps serving production
   until final cutover (Phase 10).
4. **Migrate in place** inside `frontend/`. Old SvelteKit files are deleted in the same
   phase that their replacement is verified, not before.
5. When a step's verification fails, fix it before moving to the next phase.

---

## Resolved decisions

These were the open questions in `plan.md` §"Next step". They are now decided:

### D1. State management for `call-state`

**Decision: no external store. Local React state per page.**

`src/lib/stores/call-state.ts` exports two Svelte writables (`callState`,
`customerCallState`). A grep confirms they are consumed **only** by their respective page
components (`user/receive/[handle]` and `embed/[handle]`) — no manager, transport, or
embed file imports them. Therefore:

- Delete `src/lib/stores/call-state.ts`.
- Keep `src/lib/types/call-state.ts` unchanged (types only).
- Each page holds its state with `useState` / `useRef` (see the per-page sections).
  No Zustand, no Redux, no context. The dev-mode `subscribe` logging in the store file
  is replaced by an equivalent `useEffect` log guarded by `process.env.NODE_ENV === 'development'`.

### D2. JWT verification in middleware

**Decision: use `jose` for *verification only* inside `middleware.ts`.**

Next.js middleware runs on the Edge runtime, where `jsonwebtoken` (Node `crypto`) does
not work. `jose` is Edge-compatible and verifies the exact same HS256 tokens. This is
**not** an auth change under the non-goals: tokens are still minted by `jsonwebtoken`
with the same secret, same claims, same expiry; the signaling server contract is
untouched. `jose` is used in exactly one file (`middleware.ts`) and only to decide
redirects. All route handlers keep `jsonwebtoken`.

### D3. Server Actions vs. route handlers

**Decision: keep all 9 API route handlers; add Server Actions as thin wrappers for the three web forms.**

`/api/socket-token` is explicitly consumed by the mobile app (Bearer header path), and we
cannot prove other endpoints are web-only. So the public API surface is preserved 1:1.
For the web forms (`signup`, `login`, `unsubscribe`), per `plan.md` §Approach 1:

- Extract the core logic of login/signup/unsubscribe into `src/lib/server/auth-service.ts`
  and `src/lib/server/unsubscribe-service.ts` (pure functions taking parsed input,
  returning `{ status, body, token? }`).
- `route.ts` files and `actions.ts` Server Actions are both thin wrappers over these.
- Cookie setting (`auth_token`, httpOnly/secure/strict/24 h) happens in the wrapper via
  `cookies()` (action) or `NextResponse` (route handler), identical attributes.

### D4. React StrictMode

**Decision: `reactStrictMode: false` in `next.config.ts`, with a code comment linking to
`plan.md` risk #1.** Dev-mode double-invoked effects would tear down and recreate the
WebSocket/RTCPeerConnection mid-negotiation. Disabling StrictMode gives dev/prod parity
with the current app. Revisit after migration if desired — not now.

### D5. Path alias

**Decision: keep the `$lib` alias.** All of `src/lib/` imports internally via `$lib/...`,
and `vite.embed-core.config.ts` also aliases `$lib`. Next.js honours `tsconfig.json`
`paths`, so add:

```jsonc
"paths": { "$lib": ["./src/lib"], "$lib/*": ["./src/lib/*"] }
```

This means zero import rewrites inside `src/lib/` and no embed-config change beyond `outDir`.

### D6. Directory layout

Use the Next.js `src/` directory convention so `src/lib` and `src/embed` stay where they are:

```
frontend/
├── next.config.ts
├── middleware.ts                  # NOTE: at src/middleware.ts (must sit beside app/)
├── vite.embed.config.ts           # outDir: 'static' → 'public'
├── vite.embed-core.config.ts      # outDir: 'static' → 'public'
├── public/                        # renamed from static/ (minus sitemap.xml, robots.txt)
└── src/
    ├── middleware.ts
    ├── app/
    │   ├── layout.tsx             # root: <html>, globals.css, umami script, favicon
    │   ├── globals.css            # moved from src/app.css, content unchanged
    │   ├── sitemap.ts             # replaces static/sitemap.xml
    │   ├── robots.ts              # replaces static/robots.txt
    │   ├── (marketing)/
    │   │   ├── layout.tsx         # Hotjar loader + self-embed widget script
    │   │   ├── page.tsx           # home (RSC) + AuthModal client island
    │   │   ├── auth-modal.tsx     # "use client" — login/signup modal from home page
    │   │   ├── actions.ts         # loginAction, signupAction (Server Actions)
    │   │   ├── pricing/page.tsx
    │   │   ├── privacy-policy/page.tsx
    │   │   ├── terms-of-service/page.tsx
    │   │   └── unsubscribe/
    │   │       ├── page.tsx       # RSC shell + client form island
    │   │       ├── unsubscribe-form.tsx   # "use client"
    │   │       └── actions.ts     # unsubscribeAction
    │   ├── (app)/
    │   │   ├── layout.tsx         # Hotjar loader only (no self-embed script)
    │   │   ├── user/page.tsx                       # "use client"
    │   │   ├── user/receive/[handle]/page.tsx      # "use client"
    │   │   └── embed/[handle]/page.tsx             # "use client"
    │   └── api/
    │       ├── links/route.ts
    │       ├── login/route.ts
    │       ├── logout/route.ts
    │       ├── me/route.ts
    │       ├── refresh/route.ts
    │       ├── signup/route.ts
    │       ├── socket-token/route.ts
    │       ├── unsubscribe/route.ts
    │       └── user/route.ts
    ├── embed/                     # UNCHANGED (stub.js, core.js)
    └── lib/                       # unchanged except the two files noted below
```

Route groups `(marketing)` / `(app)` mirror the current `(layout-1)` / `(layout-2)`.

---

## Environment variable renames

`VITE_*` → `NEXT_PUBLIC_*` for browser-exposed vars. Server-only vars keep their names
and are read via `process.env`.

| Old | New | Read by |
|---|---|---|
| `VITE_SIGNALING_SERVER_URL` | `NEXT_PUBLIC_SIGNALING_SERVER_URL` | connection-manager, embed page, middleware CSP |
| `VITE_STUN_SERVER_1` / `_2` | `NEXT_PUBLIC_STUN_SERVER_1` / `_2` | webrtc-manager |
| `VITE_TURN_SERVER_URL` / `_USERNAME` / `_CREDENTIAL` | `NEXT_PUBLIC_TURN_*` | webrtc-manager |
| `POSTGRES_URL` | unchanged | route handlers, actions |
| `JWT_SECRET` | unchanged | route handlers, actions, middleware (via jose) |

Mechanics:

- In `src/lib/` and pages: replace `import.meta.env.VITE_X` → `process.env.NEXT_PUBLIC_X`
  and `import.meta.env.DEV` → `process.env.NODE_ENV === 'development'`.
- **Exception — `src/embed/` is NOT touched.** The embed core is built by Vite, not Next.
  Its `vite.embed-core.config.ts` `define` block already hardcodes `import.meta.env.*`
  replacements — leave those keys as-is.
- **Conflict this creates:** `webrtc-manager.ts` and `ws-transport`-adjacent lib files are
  imported by BOTH the Next app and the Vite-built embed core. After switching lib files
  to `process.env.NEXT_PUBLIC_*`, the embed-core Vite build must define those too. Update
  the `define` block in `vite.embed-core.config.ts` to define **both** spellings
  (`import.meta.env.VITE_*` keys can be dropped if no lib file reads them anymore;
  add `process.env.NEXT_PUBLIC_STUN_SERVER_1` etc. and `process.env.NODE_ENV`).
  Verify with `npm run build:embed` + grepping the output bundle for `process.env`
  (there must be **no** unreplaced occurrences).
- Update `.env.example` comments/names accordingly; user updates `.env.local` and Vercel
  project env vars at cutover.

---

## Phase 0 — Scaffold (≈ half a day)

1. On branch `next-migration`, remove SvelteKit build config only when replaced (see
   deletion list, Phase 9). Start by adding Next alongside.
2. Dependencies:
   - **Add:** `next` (latest stable), `react`, `react-dom`, `jose`,
     `@types/react`, `@types/react-dom`, `eslint-config-next`.
   - **Keep:** `@callsafe/protocol`, `@vercel/postgres`, `bcryptjs`, `jsonwebtoken`,
     `uuid`, `validator`, `tailwindcss` 4, `@tailwindcss/forms`, `@tailwindcss/typography`,
     `typescript`, `prettier` (+tailwind plugin).
   - **Remove (Phase 9):** `@sveltejs/*`, `svelte`, `svelte-check`, `eslint-plugin-svelte`,
     `prettier-plugin-svelte`, `@tailwindcss/vite` (Next uses PostCSS: add `@tailwindcss/postcss`), `vite` stays **only** if needed for the embed builds — it is, so keep `vite` as a devDependency.
3. Scripts:
   ```jsonc
   "dev": "next dev",
   "build": "next build",
   "start": "next start",
   "build:embed": "vite build --config vite.embed.config.ts && vite build --config vite.embed-core.config.ts",
   "check": "tsc --noEmit",
   "lint": "prettier --check . && next lint",
   "format": "prettier --write ."
   ```
4. `next.config.ts`: `reactStrictMode: false` (see D4). No custom headers here — all
   headers live in middleware for parity with `hooks.server.ts` (single place, path-dependent
   logic for embed routes).
5. `tsconfig.json`: Next defaults + the `$lib` paths (D5). Preserve `strict` settings
   currently in effect.
6. Tailwind 4 via PostCSS (`postcss.config.mjs` with `@tailwindcss/postcss`).
   `src/app/globals.css` = current `src/app.css` verbatim.
7. Root `src/app/layout.tsx` reproduces `src/app.html`:
   - `<html lang="en">`, viewport meta (Next default covers it), favicon via
     `metadata.icons` pointing at `/favicon.svg`.
   - Umami: `<Script defer src="https://cloud.umami.is/script.js" data-website-id="09dc7b8b-ba5b-4228-ae79-577f2b9504df" strategy="afterInteractive" />`.
   - Note (pre-existing anomaly, do NOT fix): the current CSP (`script-src 'self' 'unsafe-inline'`)
     does not whitelist `cloud.umami.is` or `static.hotjar.com`. Replicate the CSP
     exactly anyway — parity over correctness; flag it in the PR description.
   - Global `Window.hj` typing from `app.d.ts` moves to a `src/types/global.d.ts`.
8. Vercel: the existing project builds `frontend/`. Branch preview deploys will pick up
   Next automatically (framework auto-detect). Confirm the first preview build succeeds.

**Verify:** `npm run dev` serves a placeholder home page; `npm run build` passes.

---

## Phase 1 — Port `src/lib/` (≈ half a day)

Copy as-is, then make exactly these changes:

| File | Change |
|---|---|
| `lib/managers/auth-manager.ts` | **Only framework-coupled lib file.** Remove `import { goto } from '$app/navigation'`; in `logout()`, replace `goto('/')` with `window.location.href = '/'`. Everything else unchanged. |
| `lib/managers/connection-manager.ts` | `import.meta.env.VITE_SIGNALING_SERVER_URL` → `process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL` |
| `lib/managers/webrtc-manager.ts` | Same env-var swap for STUN/TURN vars; `import.meta.env.DEV` → `process.env.NODE_ENV === 'development'` |
| `lib/stores/call-state.ts` | **Delete** (D1) |
| `lib/server/auth.js` | `import { JWT_SECRET } from '$env/static/private'` → `const JWT_SECRET = process.env.JWT_SECRET` (add a startup throw if unset, matching current fail-fast behaviour of `$env/static`) |
| `lib/transport/ws-transport.ts`, `lib/types/*`, `lib/utils/*`, `lib/index.ts` | Unchanged |

New files: `lib/server/auth-service.ts`, `lib/server/unsubscribe-service.ts` (D3) —
extracted verbatim bodies of login/signup/unsubscribe logic, parameterised over input,
returning result objects. The extraction must not alter queries, validation, log lines,
or error messages.

**Verify:** `tsc --noEmit` clean; `npm run build:embed` still produces working
`public/embed.js` + `public/embed.core.js` with no unreplaced `process.env` (see env section).

---

## Phase 2 — API route handlers (≈ 1 day)

Mechanical mapping, one file at a time. Pattern:

| SvelteKit | Next.js |
|---|---|
| `export async function POST({ request, cookies })` | `export async function POST(request: NextRequest)` + `import { cookies } from 'next/headers'` |
| `json(data, { status })` | `NextResponse.json(data, { status })` |
| `cookies.set('auth_token', token, {...})` | `(await cookies()).set('auth_token', token, {...})` — identical attributes: `httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 86400` |
| `cookies.get('auth_token')` | `(await cookies()).get('auth_token')?.value` |
| `cookies.delete('auth_token', { path: '/' })` | `(await cookies()).delete('auth_token')` (path defaults compatible; verify the Set-Cookie clears it) |
| `url.searchParams.get('x')` | `request.nextUrl.searchParams.get('x')` |
| `request.headers.get('authorization')` | same |
| `$env/static/private` imports | `process.env.POSTGRES_URL!`, `process.env.JWT_SECRET!` |

Per-route notes:

- `api/login/route.ts` + `api/signup/route.ts` — bodies call the Phase 1 services; the
  route file only parses JSON, invokes the service, sets the cookie, returns the response.
- `api/logout/route.ts`, `api/me/route.ts`, `api/refresh/route.ts` — direct ports.
- `api/socket-token/route.ts` — direct port. **Must keep the dual auth path** (cookie OR
  `Authorization: Bearer`) and the `deviceId` UUID-v4 validation. This endpoint serves the
  mobile app; test it with a Bearer header, not just a cookie.
- `api/links/route.ts` — GET/POST/PUT in one file (Next allows multiple verbs per `route.ts`).
- `api/user/route.ts`, `api/unsubscribe/route.ts` — direct ports (unsubscribe via service).
- Keep the `createDbPool()` / `pool.end()` per-request pattern exactly as-is.
- All handlers: `export const runtime = 'nodejs'` explicitly (bcryptjs, jsonwebtoken, pg).

**Verify:** with `npm run dev`, exercise each endpoint via `curl` against the old and new
apps side by side; compare status codes, JSON bodies, and `Set-Cookie` headers.

---

## Phase 3 — `middleware.ts` (≈ 1 day, security-critical)

Single `src/middleware.ts` reproducing `hooks.server.ts` plus the auth-redirect
improvement. Order of checks:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const isEmbedRoute = (p: string) => p.startsWith('/embed/');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // 1. Embed CORS preflight (parity with corsHandle)
  if (method === 'OPTIONS' && isEmbedRoute(pathname)) {
    return new NextResponse(null, { headers: EMBED_CORS_HEADERS });
  }

  // 2. CSRF: same-origin Origin check on state-mutating /api requests.
  //    SvelteKit did this automatically; Next does NOT (plan.md §Approach 4).
  //    Reject when an Origin header is present and its host !== request host.
  //    (Absent Origin => allow: preserves curl/mobile Bearer flows, matching
  //    SvelteKit, which only rejects cross-origin browser submissions.)
  if (['POST', 'PUT', 'DELETE'].includes(method) && pathname.startsWith('/api')) {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.nextUrl.host) {
      return new NextResponse('Cross-site request forbidden', { status: 403 });
    }
    // 3. Content-Type gate, parity with routeAcceptsBody(): only /api/login
    if (pathname === '/api/login' &&
        !request.headers.get('content-type')?.includes('application/json')) {
      return new NextResponse('Content-Type must be application/json', { status: 400 });
    }
  }

  // 4. Auth redirects (replaces onMount checks; plan.md §Approach 3)
  //    /user and /user/receive/*: no valid token -> redirect '/'
  //    /   : valid token -> redirect '/user' (parity with home onMount)
  //    Verify with jose (HS256, same JWT_SECRET). Invalid/expired = no token.
  // ... (const token = request.cookies.get('auth_token')?.value; jwtVerify(...))

  // 5. Response security headers (parity with withSecurityHeaders + generateCSP)
  const response = NextResponse.next();
  applySecurityHeaders(response, pathname);       // CSP w/ frame-ancestors * on /embed/*
  if (isEmbedRoute(pathname)) applyEmbedCors(response);
  return response;
}
```

Requirements:

- `generateCSP` ported verbatim, including the `NEXT_PUBLIC_SIGNALING_SERVER_URL`
  wss/https `connect-src`, `frame-ancestors *` for `/embed/*` vs `'none'` elsewhere,
  and X-Frame-Options omitted on embed routes.
- HSTS only when `process.env.NODE_ENV === 'production'`.
- Matcher: run on everything except Next internals and static assets, e.g.
  `matcher: ['/((?!_next/static|_next/image|favicon.svg|embed.js|embed.core.js|ringtone.mp3|CallsafeLive.gif).*)']`.
  Note: assets in `public/` served directly won't get the CSP header — same as the
  SvelteKit `static/` behaviour. Pages and API routes must all be covered.
- Keep the client-side `onMount` auth checks in the ported pages **as a fallback**
  (they also handle the token-expires-while-open case). The middleware removes the
  unauthenticated flash; the client check is unchanged behaviour.

**Verify (explicit security checklist):**
- `curl -X POST -H "Origin: https://evil.example" https://<preview>/api/logout` → 403.
- Same-origin POST works; POST with no Origin (curl default) works.
- `/api/login` without JSON content-type → 400 with exact message.
- `curl -I` on `/`, `/pricing`, `/user`, `/embed/x`: compare **every** security header
  byte-for-byte against the production SvelteKit responses (CSP, XFO, XCTO,
  Referrer-Policy, Permissions-Policy, HSTS, and CORS on /embed/*).
- OPTIONS on `/embed/x` returns the four CORS headers incl. `Access-Control-Max-Age: 86400`.
- `/user` without cookie → 307 to `/`; with valid cookie → renders; `/` with valid
  cookie → 307 to `/user`.

---

## Phase 4 — Marketing pages as RSC (≈ 2 days)

General rules: markup converts `class=` → `className=`, Svelte `{#if}`/`{#each}` →
JSX conditionals/`map`, `on:click` → `onClick`. Interactive fragments become small
`"use client"` child components; static markup stays server-rendered.

- **`(marketing)/layout.tsx`** — ports `(layout-1)/+layout.svelte`: a client component
  (or a client `<AnalyticsLoader/>` child) that on mount schedules the 3-second-delayed
  Hotjar loader (identical snippet, hjid 5045118), plus the window-load injection of the
  site's own embed widget (`/embed.js`, `data-handle="eb37507909fa43ff"`,
  `data-source-id="callsafe"`). Keep the layout itself a server component and isolate
  both scripts in one small `"use client"` child.
- **`page.tsx` (home, 553 LOC)** — split:
  - Server component: all static marketing sections. `export const dynamic = 'force-static'`
    is unnecessary (static by default), but note the middleware still runs per-request
    for the auth redirect, replacing the `onMount` redirect-to-`/user`.
  - `auth-modal.tsx` (`"use client"`): modal open/close state, sign-in/sign-up toggle,
    form fields, validation messages. Submits via the Server Actions in
    `(marketing)/actions.ts` (`loginAction`, `signupAction`) using
    `useActionState`/`startTransition`; on success, `router.push('/user')`
    (parity with current `window.location.href = '/user'` — use `window.location.href`
    if exact parity of a full page load matters; it does, keep `window.location.href`).
  - Keep the client-side `onMount` auth check removed here **only because** middleware
    now performs the same redirect server-side (this is the one sanctioned behaviour change).
- **`pricing/page.tsx` (454 LOC)** — static sections as RSC; the interactive bits that
  motivated its `onMount` (FAQ toggles or similar — inspect during port) become a small
  client island. Prerender flag (`+page.js`) is subsumed by static rendering.
- **`privacy-policy` / `terms-of-service`** — pure RSC, no client code.
- **`unsubscribe/`** — RSC shell + `unsubscribe-form.tsx` client island. The form calls
  `unsubscribeAction`; preserve the existing query-param prefill behaviour from its
  `onMount`. The `/api/unsubscribe` route handler remains for any non-form callers.
- **SEO:** per-page `export const metadata` reproducing current `<svelte:head>` titles
  and descriptions (copy them from each `.svelte` file during the port).
- **`app/sitemap.ts` / `app/robots.ts`** — reproduce the current `static/sitemap.xml`
  and `static/robots.txt` content (same URLs, priorities, disallow rules), then delete
  the static files so they don't shadow the generated routes.

**Verify:** `curl` each marketing URL — content present in the initial HTML (no JS
required); view-source comparison of `<title>`/meta against production; `/sitemap.xml`
and `/robots.txt` match old content semantically.

---

## Phase 5 — `user/` dashboard (≈ 1 day)

`(app)/user/page.tsx`, entire file `"use client"`. Direct port of the 336-line Svelte
component:

- `let x = ...` state → `useState`; the `onMount` body → `useEffect(..., [])`.
- Keep the `AuthManager.isAuthenticated()` check-and-redirect in the effect (fallback;
  middleware already gates the route). `goto('/')` → `router.push('/')` from
  `next/navigation` (or `window.location.href` where the original used it — check each
  call site and match).
- `getEmbedSnippet()` string-building ports verbatim (the script-tag-splitting trick is
  still needed inside JSX template strings? No — it was a Svelte parser workaround; in a
  `.tsx` file a plain template literal is safe, but **keep the function as-is anyway** —
  parity, and it's harmless).
- Clipboard-copy, handle display, logout button: direct ports.
- `(app)/layout.tsx` ports `(layout-2)/+layout.svelte`: Hotjar loader only (same
  deferred snippet), no self-embed script. Same client-island approach as Phase 4.

**Verify:** login on preview → lands on dashboard with handle shown; copy-embed-code
works; logout returns to home and clears cookie.

---

## Phase 6 — `user/receive/[handle]` (≈ 2–3 days, hardest file)

`(app)/user/receive/[handle]/page.tsx`, `"use client"`, 1,057 LOC. This is the agent
call console: WebSocket connect, device registration, incoming-call list, WebRTC
answer flow, mute/camera controls, call history in localStorage, ringtone, duration timer.

Porting rules:

- Route params: `const { handle } = useParams<{ handle: string }>()`;
  `useSearchParams().get('sourceId')`.
- Long-lived non-render objects (`ConnectionManager`, `WebRTCManager`, `WsTransport`
  instance, `durationInterval`) go in `useRef`, **not** state.
- Render-driving values (`currentPhase`, `incomingCalls`, `isMuted`, `isCameraEnabled`,
  `connectionStatus`, `errorMessage`, `callDuration`, `remoteVideoStream`,
  `localVideoStream`, `autoplayBlocked`, `callHistory`) → `useState`.
- The Svelte `attachStream` action → a `useCallback` ref (`(node) => { node.srcObject = ... }`)
  or a small `<VideoStream stream={...}>` component using `useEffect` on the stream prop.
  Preserve the documented behaviour: when phase transitions re-mount the `<video>`,
  the already-received stream must re-attach (this is exactly what the state-held
  streams are for — the effect on `[stream]` in a component that mounts fresh handles it).
- `onMount` → one `useEffect(..., [])` that runs the auth check then
  `initializeConnection()`; `onDestroy` → its cleanup function calling `cleanup()`.
  Because StrictMode is off (D4), this effect runs once in dev, matching Svelte.
- **Stale-closure hazard (the one real React-specific trap):** socket event handlers are
  registered once but read mutable call state. In Svelte, `let` variables are always
  current; in React, a handler closing over `useState` values sees stale snapshots.
  For every value both *read and written* across handler invocations (e.g. current call
  id, phase, incoming-call list), keep a `useRef` mirror updated alongside the state
  setter, and have socket handlers read the ref. Do this mechanically; do not redesign
  the flow.
- The deleted `callState` store: this page imported it — inline whatever fields it
  actually read/wrote as local state per D1 (inspect usage during port; most state is
  already local `let`s).
- localStorage call history, ringtone `Audio` element, `beforeunload`/interval cleanup:
  port verbatim.

**Verify:** full agent flow on the preview against the real signaling server: connect,
register, receive a voice call from the embed widget, answer, two-way audio, mute,
hang up, duration + history recorded, then the same for video incl. camera toggle.
Test tab close/reopen reconnection.

---

## Phase 7 — `embed/[handle]` page (≈ 1–1.5 days)

`(app)/embed/[handle]/page.tsx`, `"use client"`, 825 LOC. Customer-side call UI loaded
in the iframe. Same porting rules as Phase 6 (refs for managers, state for UI,
ref-mirrors for socket handlers, single mount effect with cleanup). The deleted
`customerCallState` store's fields become local state. `sourceId` default `'website'`
from query param — preserve.

**Verify:** load `/embed/<handle>?sourceId=test` directly and inside an iframe on a
foreign origin (simple local HTML page) — CORS headers and `frame-ancestors *` must
allow it; place voice + video calls to a connected agent.

---

## Phase 8 — Embed builds → `public/` (≈ half a day)

1. `git mv static public` (keeping `favicon.svg`, `ringtone.mp3`, `CallsafeLive.gif`,
   built `embed.js`/`embed.core.js`; **delete** `sitemap.xml`, `robots.txt` — replaced
   in Phase 4).
2. Both Vite configs: `outDir: 'static'` → `'public'`. The `$lib` alias in
   `vite.embed-core.config.ts` stays; reconcile the `define` block per the env-var
   section (must cover every `process.env.*` reference now present in `src/lib`).
3. `npm run build:embed`; commit fresh bundles if that is the existing practice
   (bundles are currently checked into `static/` — preserve that practice).

**Verify:** a plain HTML page embedding `<preview>/embed.js` shows the button,
lazy-loads `embed.core.js` on hover, and completes a call.

---

## Phase 9 — Deletion & cleanup (≈ half a day)

Delete (only after Phases 0–8 verified):

- `src/routes/` (all of it), `src/hooks.server.ts`, `src/app.html`, `src/app.d.ts`
  (global types moved in Phase 0), `src/app.css` (moved), `src/lib/stores/`,
  `svelte.config.js`, `vite.config.ts` (the SvelteKit one — **not** the two embed configs),
  `.svelte-kit/` from any ignores that reference it.
- `package.json`: remove Svelte-stack deps (Phase 0 list); run `npm install` to refresh
  the lockfile. Also delete the stray `package-lock 2.json`.
- `eslint.config.js` → replace with Next's flat config (`eslint-config-next`); drop
  svelte plugins from prettier config.
- Grep the tree for leftovers: `svelte`, `$app/`, `$env/`, `import.meta.env`,
  `sveltekit` — zero hits outside `src/embed/` build configs' comments.

**Verify:** clean `npm run build`, `npm run build:embed`, `tsc --noEmit`, lint.

---

## Phase 10 — E2E verification & cutover (≈ 2–3 days)

Manual E2E matrix on the preview deployment (there is no test suite — this is a
required work item, per `plan.md` risk #2):

| Flow | Browsers |
|---|---|
| Signup → auto-login → dashboard | Chrome, Safari, Firefox |
| Login / logout / session refresh (leave tab open past refresh threshold) | Chrome |
| Agent console: voice call end-to-end (embed widget → answer → audio both ways → hangup) | Chrome desktop + Android Chrome, Safari desktop + iOS Safari |
| Video call incl. camera/mute toggles both sides | Chrome, Safari |
| Embed widget on a third-party origin page (iframe + CORS + CSP) | Chrome, Safari |
| Mobile app: `/api/socket-token` with Bearer header; ring flow unaffected | device test |
| Unsubscribe form | Chrome |
| Security-header diff vs. production (Phase 3 checklist re-run on preview) | curl |
| Lighthouse/SEO spot-check: marketing pages render without JS, metadata + sitemap + robots correct | Chrome |

Cutover:

1. Set the renamed `NEXT_PUBLIC_*` env vars in the Vercel project (keep `VITE_*` set
   during transition; remove after cutover).
2. Merge `next-migration` → `main`; production deploy.
3. Immediately re-run: one real call end-to-end, `/api/socket-token` Bearer check,
   security-header curl diff.
4. Rollback plan: Vercel instant rollback to the last SvelteKit deployment; no DB or
   signaling-server changes exist, so rollback is deployment-only.

---

## Effort recap

| Phase | Est. |
|---|---|
| 0 Scaffold | 0.5 d |
| 1 lib | 0.5 d |
| 2 API routes | 1 d |
| 3 Middleware | 1 d |
| 4 Marketing RSC | 2 d |
| 5 Dashboard | 1 d |
| 6 receive/[handle] | 2–3 d |
| 7 embed/[handle] | 1–1.5 d |
| 8 Embed builds | 0.5 d |
| 9 Cleanup | 0.5 d |
| 10 E2E + cutover | 2–3 d |
| **Total** | **12.5–14.5 d** |

Consistent with `plan.md`'s 12–17 day estimate.
