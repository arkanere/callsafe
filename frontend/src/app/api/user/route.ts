// API endpoint for user data management
import { NextResponse, type NextRequest } from 'next/server';
import { createPool } from '@vercel/postgres';
import { extractBearerToken, verifyJWT, canAccessUserResource } from '$lib/server/auth.js';

export const runtime = 'nodejs';

const POSTGRES_URL = process.env.POSTGRES_URL!;

function createDbPool() {
	return createPool({ connectionString: POSTGRES_URL });
}

// GET - Fetch user data including sourceId
export async function GET(request: NextRequest) {
	console.log('[USER API] GET request received');
	const pool = createDbPool();
	console.log('[USER API] Database pool created');

	try {
		const userId = request.nextUrl.searchParams.get('userId');
		console.log('[USER API] Request userId:', userId);

		if (!userId) {
			console.log('[USER API] Missing userId parameter');
			return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 });
		}

		// Extract and verify JWT token
		const token = extractBearerToken(request.headers.get('authorization'));
		if (!token) {
			console.log('[USER API] Missing or invalid authorization header');
			return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const tokenResult = verifyJWT(token);
		if (!tokenResult.valid) {
			console.log('[USER API] Invalid token:', tokenResult.error);
			return NextResponse.json(
				{ success: false, error: 'Invalid or expired token' },
				{ status: 401 }
			);
		}

		// Verify user can only access their own data
		if (!canAccessUserResource(tokenResult.payload.userId, userId)) {
			console.log(
				'[USER API] Authorization failed: user',
				tokenResult.payload.userId,
				'cannot access user',
				userId
			);
			return NextResponse.json(
				{ success: false, error: 'Forbidden: You can only access your own data' },
				{ status: 403 }
			);
		}

		console.log('[USER API] Querying database for user data');
		const result = await pool.query(
			'SELECT id, email, name, is_active, sourceid, isembedded FROM callsafeusers WHERE id = $1',
			[userId]
		);
		console.log('[USER API] Query result:', result.rows.length, 'users found');

		if (result.rows.length === 0) {
			console.log('[USER API] User not found for ID:', userId);
			return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
		}

		const user = result.rows[0];
		console.log('[USER API] User data retrieved:', {
			id: user.id,
			email: user.email,
			name: user.name
		});

		const responseData = {
			success: true,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				isActive: user.is_active,
				sourceId: user.sourceid,
				isEmbedded: user.isembedded
			}
		};
		console.log('[USER API] Returning user data:', responseData);
		return NextResponse.json(responseData);
	} catch (error) {
		console.error('[USER API] Error fetching user data:', error);
		return NextResponse.json(
			{ success: false, error: 'Failed to fetch user data' },
			{ status: 500 }
		);
	} finally {
		console.log('[USER API] Closing database pool');
		await pool.end();
	}
}
