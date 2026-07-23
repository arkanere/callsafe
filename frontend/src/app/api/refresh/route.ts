import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST() {
	console.log('[REFRESH API] POST request received');
	try {
		console.log('[REFRESH API] Getting token from cookie');
		const cookieStore = await cookies();
		const token = cookieStore.get('auth_token')?.value;
		console.log('[REFRESH API] Cookie token present:', !!token);

		if (!token) {
			console.log('[REFRESH API] No token found in cookie');
			return NextResponse.json({ success: false, error: 'No token provided' }, { status: 401 });
		}

		try {
			console.log('[REFRESH API] Verifying JWT token');
			const decoded = jwt.verify(token, JWT_SECRET) as any;
			console.log('[REFRESH API] Token verified successfully:', {
				email: decoded.email,
				handle: decoded.handle
			});

			console.log('[REFRESH API] Creating new token with extended expiration');
			// Create new token with extended expiration
			const newTokenPayload = {
				userId: decoded.userId,
				email: decoded.email,
				handle: decoded.handle,
				sourceId: decoded.sourceId,
				exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
			};
			const newToken = jwt.sign(newTokenPayload, JWT_SECRET);
			console.log('[REFRESH API] New token created successfully');

			// Update the httpOnly cookie with new token
			cookieStore.set('auth_token', newToken, {
				httpOnly: true,
				secure: true,
				sameSite: 'strict',
				path: '/',
				maxAge: 60 * 60 * 24 // 24 hours
			});
			console.log('[REFRESH API] Auth token cookie updated');

			console.log('[REFRESH API] Token refresh successful');
			return NextResponse.json({ success: true });
		} catch (jwtError) {
			console.error('[REFRESH API] JWT verification failed:', jwtError);
			return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
		}
	} catch (error) {
		console.error('[REFRESH API] Token refresh error:', error);
		return NextResponse.json({ success: false, error: 'Token refresh failed' }, { status: 500 });
	}
}
