import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// Intentionally disabled — see migration-implementation-plan.md D4 / plan.md risk #1.
	// StrictMode's dev-only double-invoked effects would tear down and recreate the
	// WebSocket / RTCPeerConnection mid-negotiation on the call pages.
	reactStrictMode: false
};

export default nextConfig;
