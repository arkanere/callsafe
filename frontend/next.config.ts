import path from 'node:path';
import type { NextConfig } from 'next';

const repoRoot = path.join(process.cwd(), '..');

const nextConfig: NextConfig = {
	// Intentionally disabled — see migration-implementation-plan.md D4 / plan.md risk #1.
	// StrictMode's dev-only double-invoked effects would tear down and recreate the
	// WebSocket / RTCPeerConnection mid-negotiation on the call pages.
	reactStrictMode: false,

	// `@callsafe/protocol` is a `file:../protocol` dependency, i.e. a symlink out
	// of frontend/. Turbopack refuses to follow a symlink out of its filesystem
	// root, so the root has to be the repo root; outputFileTracingRoot follows it
	// for the same reason. ../protocol/ itself is untouched (rule #2).
	turbopack: { root: repoRoot },
	outputFileTracingRoot: repoRoot
};

export default nextConfig;
