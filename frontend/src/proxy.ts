import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Ported from the SvelteKit src/hooks.server.ts (corsHandle + securityHandle),
// plus the server-side auth redirects that replace the pages' onMount checks.
//
// Runs on the Edge runtime, so JWT verification uses `jose` rather than
// `jsonwebtoken` (see migration-implementation-plan.md D2). Same HS256 tokens,
// same secret; verification only — all minting still happens in route handlers.

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
const withCORSHeaders = (response: NextResponse): NextResponse => {
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
	const signalingUrl =
		process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'https://signal.callsafe.tech';
	const signalingWss = signalingUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

	const baseDirectives = [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"font-src 'self' data:",
		`connect-src 'self' ${signalingWss} ${signalingUrl}`,
		"media-src 'self'",
		"base-uri 'self'",
		"form-action 'self'"
	];

	// Allow embed routes to be framed from any origin (embeddable widget)
	const frameAncestors = isEmbedRoute(pathname) ? '*' : "'none'";

	return [...baseDirectives, `frame-ancestors ${frameAncestors}`].join('; ');
};

// Pure function to apply security headers to response
const withSecurityHeaders = (response: NextResponse, pathname: string): NextResponse => {
	response.headers.set('Content-Security-Policy', generateCSP(pathname));

	// X-Frame-Options: Omit for embed routes (CSP frame-ancestors takes precedence)
	if (!isEmbedRoute(pathname)) {
		response.headers.set('X-Frame-Options', 'DENY');
	}

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'microphone=(self), camera=(self)');

	if (process.env.NODE_ENV === 'production') {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains; preload'
		);
	}

	return response;
};

// Routes that require a valid session. /user and anything under it.
const isProtectedRoute = (pathname: string): boolean => {
	return pathname === '/user' || pathname.startsWith('/user/');
};

const encodedSecret = new TextEncoder().encode(process.env.JWT_SECRET);

const hasValidToken = async (request: NextRequest): Promise<boolean> => {
	const token = request.cookies.get('auth_token')?.value;
	if (!token) return false;
	try {
		await jwtVerify(token, encodedSecret, { algorithms: ['HS256'] });
		return true;
	} catch {
		// Invalid or expired token is treated exactly like no token.
		return false;
	}
};

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const method = request.method;

	// 1. Embed CORS preflight (parity with corsHandle: returns early, so no
	//    security headers are applied — same as SvelteKit).
	if (method === 'OPTIONS' && isEmbedRoute(pathname)) {
		return new NextResponse(null, { headers: createEmbedCORSHeaders() });
	}

	// 2. CSRF: same-origin Origin check on state-mutating /api requests.
	//    SvelteKit did this automatically; Next does not.
	//    Absent Origin => allow, preserving curl / mobile Bearer flows.
	if (isStateMutating(method) && pathname.startsWith('/api')) {
		const origin = request.headers.get('origin');
		if (origin && new URL(origin).host !== request.nextUrl.host) {
			return new NextResponse('Cross-site request forbidden', { status: 403 });
		}

		// 3. Content-Type gate, parity with routeAcceptsBody()
		if (routeAcceptsBody(pathname) && !hasJsonContentType(request.headers.get('content-type'))) {
			return new NextResponse('Content-Type must be application/json', { status: 400 });
		}
	}

	// 4. Auth redirects, replacing the pages' onMount checks. The client-side
	//    checks stay as a fallback (they also handle token-expires-while-open).
	if (isProtectedRoute(pathname)) {
		if (!(await hasValidToken(request))) {
			return withSecurityHeaders(NextResponse.redirect(new URL('/', request.url)), pathname);
		}
	} else if (pathname === '/') {
		if (await hasValidToken(request)) {
			return withSecurityHeaders(NextResponse.redirect(new URL('/user', request.url)), pathname);
		}
	}

	// 5. Response security headers (parity with withSecurityHeaders + generateCSP)
	const response = NextResponse.next();
	withSecurityHeaders(response, pathname);
	if (isEmbedRoute(pathname)) withCORSHeaders(response);
	return response;
}

export const config = {
	matcher: [
		'/((?!_next/static|_next/image|favicon.svg|embed.js|embed.core.js|ringtone.mp3|CallsafeLive.gif).*)'
	]
};
