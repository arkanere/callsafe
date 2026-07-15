# Follow-ups

- Incoming-call notification is generic ("Incoming voice call / Tap to
  answer"). The only caller identity on the wire is `sourceId` (a per-call
  guest UUID), so showing a caller name needs a display-name field in the
  protocol (`call:initiate` → `call:incoming` → FCM payload) first.
- Prod droplet: set `DEVICE_REGISTRY_FILE=/opt/callsafe/data/device_registry.dets`
  in `/opt/callsafe/env` (create `/opt/callsafe/data`, owned by `callsafe`)
  and optionally migrate to `FCM_SERVICE_ACCOUNT_FILE` — see DEPLOY.md — then
  redeploy to pick up device-registry persistence.
