import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { signupUser } from '$lib/server/auth-service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
	console.log('[SIGNUP API] POST request received');

	try {
		console.log('[SIGNUP API] Parsing request body');
		const data = await request.json();
		const { email, password, name } = data;

		const result = await signupUser({ email, password, name });

		if (result.token) {
			// Set httpOnly cookie for auto-login
			(await cookies()).set('auth_token', result.token, {
				httpOnly: true,
				secure: true,
				sameSite: 'strict',
				path: '/',
				maxAge: 60 * 60 * 24 // 24 hours
			});
			console.log('[SIGNUP API] Auth token set as httpOnly cookie');
		}

		return NextResponse.json(result.body, { status: result.status });
	} catch (error) {
		console.error('[SIGNUP API] Error creating user:', error);
		return NextResponse.json(
			{ success: false, error: 'Failed to create account. Please try again.' },
			{ status: 500 }
		);
	}
}
