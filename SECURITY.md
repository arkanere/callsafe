# Security Policy

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through GitHub Issues, as that
makes them public before a fix is available.

Instead, email **arkanere@gmail.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (if applicable)
- Any suggested mitigations you have in mind

You can expect an acknowledgement within **48 hours** and a status update within
**7 days**. If the issue is confirmed, a fix will be prioritised and you will be
credited in the release notes (unless you prefer to remain anonymous).

## Scope

This repository contains the source code for the CallSafe WebRTC signaling
infrastructure (Elixir server, SvelteKit frontend, Flutter/Android client). The
hosted service at **callsafe.tech** is in scope. Third-party dependencies are
out of scope — please report those to their respective maintainers.

## Supported Versions

Only the latest version of the hosted service is supported. This is not a
self-hosted product, so patching older deployments is not applicable.
