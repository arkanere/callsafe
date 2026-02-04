import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';

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
const generateCSP = (): string => {
	return [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' https://cdn.socket.io",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"font-src 'self' data:",
		"connect-src 'self' wss://tunnel.callsafe.tech https://tunnel.callsafe.tech",
		"media-src 'self'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'"
	].join('; ');
};

// Pure function to apply security headers to response
const withSecurityHeaders = (response: Response): Response => {
	response.headers.set('Content-Security-Policy', generateCSP());
	response.headers.set('X-Frame-Options', 'DENY');
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
 * CSRF Protection Hook
 *
 * SvelteKit 2.0+ provides automatic CSRF protection by validating the Origin header
 * for all POST/PUT/DELETE requests. This ensures requests originate from the same origin.
 *
 * Additional protection: Require application/json Content-Type for API routes that
 * parse request bodies. This prevents simple form-based CSRF attacks, as HTML forms
 * cannot set Content-Type to application/json without JavaScript.
 */
export const handle: Handle = async ({ event, resolve }) => {
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
	return withSecurityHeaders(response);
};
