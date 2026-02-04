import type { Handle } from '@sveltejs/kit';

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

	return resolve(event);
};
