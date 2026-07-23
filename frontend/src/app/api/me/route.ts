import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function GET() {
	console.log('[ME API] GET request received');
	try {
		const token = (await cookies()).get('auth_token')?.value;
		console.log('[ME API] Cookie token present:', !!token);

		if (!token) {
			console.log('[ME API] No token found');
			return NextResponse.json({ authenticated: false }, { status: 401 });
		}

		try {
			console.log('[ME API] Verifying JWT token');
			const decoded = jwt.verify(token, JWT_SECRET) as any;
			console.log('[ME API] Token verified:', { email: decoded.email, handle: decoded.handle });

			return NextResponse.json({
				authenticated: true,
				user: {
					userId: decoded.userId,
					email: decoded.email,
					handle: decoded.handle,
					sourceId: decoded.sourceId
				},
				expiresAt: decoded.exp * 1000
			});
		} catch (jwtError) {
			console.error('[ME API] JWT verification failed:', jwtError);
			return NextResponse.json({ authenticated: false }, { status: 401 });
		}
	} catch (error) {
		console.error('[ME API] Error:', error);
		return NextResponse.json({ authenticated: false }, { status: 500 });
	}
}
