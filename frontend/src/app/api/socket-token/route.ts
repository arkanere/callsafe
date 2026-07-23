import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

const JWT_SECRET = process.env.JWT_SECRET!;

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Provides a short-lived token for WebSocket authentication
// This is necessary because WebSocket cannot read httpOnly cookies directly.
// Accepts the auth token from the session cookie (dashboard) or an
// Authorization: Bearer header (mobile app, which has no cookie jar).
export async function GET(request: NextRequest) {
	console.log('[SOCKET TOKEN API] GET request received');

	try {
		const token =
			(await cookies()).get('auth_token')?.value ??
			request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
		console.log('[SOCKET TOKEN API] Auth token present:', !!token);

		if (!token) {
			console.log('[SOCKET TOKEN API] No token found');
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		// The device's persistent id must be baked into the token: the signaling
		// server enforces deviceId == token.device_id on device:connect.
		const deviceId = request.nextUrl.searchParams.get('deviceId');
		if (!deviceId || !UUID_V4_REGEX.test(deviceId)) {
			return NextResponse.json({ error: 'Invalid deviceId' }, { status: 400 });
		}

		try {
			console.log('[SOCKET TOKEN API] Verifying JWT token');
			const decoded = jwt.verify(token, JWT_SECRET) as any;
			console.log('[SOCKET TOKEN API] Token verified:', { email: decoded.email });

			// Short-lived socket token (5 minutes) with protocol v2 claims;
			// business_id is the handle (the server has no business DB).
			const socketTokenPayload = {
				device_id: deviceId,
				business_id: decoded.handle,
				role: 'business',
				exp: Math.floor(Date.now() / 1000) + 5 * 60 // 5 minutes
			};
			const socketToken = jwt.sign(socketTokenPayload, JWT_SECRET);
			console.log('[SOCKET TOKEN API] Socket token created');

			return NextResponse.json({ token: socketToken });
		} catch (jwtError) {
			console.error('[SOCKET TOKEN API] JWT verification failed:', jwtError);
			return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
		}
	} catch (error) {
		console.error('[SOCKET TOKEN API] Error:', error);
		return NextResponse.json({ error: 'Failed to generate socket token' }, { status: 500 });
	}
}
