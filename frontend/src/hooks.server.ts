import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';

// Pure function to check if route is embeddable widget
const isEmbedRoute = (pathname: string): boolean => {
	return pathname.startsWith('/embed/');
};

// Pure function to create CORS headers for embed routes
const createEmbedCORSHeaders = (): Record<string, string> => {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Max-Age': '86400'
	};
};

// Pure function to apply CORS headers to response
const withCORSHeaders = (response: Response): Response => {
	const headers = createEmbedCORSHeaders();
	response.headers.set('Access-Control-Allow-Origin', headers['Access-Control-Allow-Origin']);
	response.headers.set('Access-Control-Allow-Methods', headers['Access-Control-Allow-Methods']);
	response.headers.set('Access-Control-Allow-Headers', headers['Access-Control-Allow-Headers']);
	return response;
};

// Pure function to check if route accepts request body
const routeAcceptsBody = (pathname: string): boolean => {
	const bodyRoutes = ['/api/login'];
	return bodyRoutes.includes(pathname);
};

// Pure function to validate JSON content type
const hasJsonContentType = (contentType: string | null): boolean => {
	return contentType !== null && contentType.includes('application/json');
};

// Pure function to check if request is state-mutating
const isStateMutating = (method: string): boolean => {
	return method === 'POST' || method === 'PUT' || method === 'DELETE';
};

// Pure function to generate Content Security Policy directive
const generateCSP = (pathname: string): string => {
	const baseDirectives = [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"font-src 'self' data:",
		"connect-src 'self' wss://tunnel.callsafe.tech https://tunnel.callsafe.tech",
		"media-src 'self'",
		"base-uri 'self'",
		"form-action 'self'"
	];

	// Allow embed routes to be framed from any origin (embeddable widget)
	const frameAncestors = isEmbedRoute(pathname) ? '*' : "'none'";

	return [...baseDirectives, `frame-ancestors ${frameAncestors}`].join('; ');
};

// Pure function to apply security headers to response
const withSecurityHeaders = (response: Response, pathname: string): Response => {
	response.headers.set('Content-Security-Policy', generateCSP(pathname));

	// X-Frame-Options: Omit for embed routes (CSP frame-ancestors takes precedence)
	if (!isEmbedRoute(pathname)) {
		response.headers.set('X-Frame-Options', 'DENY');
	}

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'microphone=(self), camera=()');

	if (!dev) {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains; preload'
		);
	}

	return response;
};

/**
 * CORS Protection Hook
 *
 * Allows embed widget routes to be accessed from any origin.
 * The widget is public and designed to be embedded on thousands of customer websites.
 * Security is enforced through WebRTC/Socket.IO authentication, not CORS.
 */
const corsHandle: Handle = async ({ event, resolve }) => {
	const { method } = event.request;
	const { pathname } = event.url;

	// Handle preflight OPTIONS requests for embed routes
	if (method === 'OPTIONS' && isEmbedRoute(pathname)) {
		const corsHeaders = createEmbedCORSHeaders();
		return new Response(null, { headers: corsHeaders });
	}

	const response = await resolve(event);

	// Apply CORS headers to embed routes for any origin
	if (isEmbedRoute(pathname)) {
		return withCORSHeaders(response);
	}

	return response;
};

/**
 * CSRF Protection Hook
 *
 * SvelteKit 2.0+ provides automatic CSRF protection by validating the Origin header
 * for all POST/PUT/DELETE requests. This ensures requests originate from the same origin.
 *
 * Additional protection: Require application/json Content-Type for API routes that
 * parse request bodies. This prevents simple form-based CSRF attacks, as HTML forms
 * cannot set Content-Type to application/json without JavaScript.
 */
const securityHandle: Handle = async ({ event, resolve }) => {
	const { method, headers } = event.request;
	const { pathname } = event.url;

	// SvelteKit automatically validates Origin header for state-mutating requests
	// No additional code needed - framework handles it

	// Validate Content-Type for API routes that accept JSON bodies
	if (isStateMutating(method) && pathname.startsWith('/api')) {
		const contentType = headers.get('content-type');

		// Only enforce Content-Type for routes that parse JSON bodies
		if (routeAcceptsBody(pathname) && !hasJsonContentType(contentType)) {
			return new Response('Content-Type must be application/json', { status: 400 });
		}
	}

	const response = await resolve(event);
	return withSecurityHeaders(response, pathname);
};

// Compose CORS and security hooks
export const handle = sequence(corsHandle, securityHandle);
