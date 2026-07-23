import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { loginUser } from '$lib/server/auth-service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
	console.log('[LOGIN API] POST request received');

	try {
		console.log('[LOGIN API] Parsing request body');
		const { email, password } = await request.json();

		const result = await loginUser({ email, password });

		if (result.token) {
			// Set httpOnly cookie instead of returning token in response
			(await cookies()).set('auth_token', result.token, {
				httpOnly: true, // Cannot be accessed by JavaScript (XSS protection)
				secure: true, // Only sent over HTTPS in production
				sameSite: 'strict', // CSRF protection
				path: '/',
				maxAge: 60 * 60 * 24 // 24 hours
			});
			console.log('[LOGIN API] Auth token set as httpOnly cookie');
		}

		return NextResponse.json(result.body, { status: result.status });
	} catch (error) {
		console.error('[LOGIN API] Login error:', error);
		return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
	}
}
