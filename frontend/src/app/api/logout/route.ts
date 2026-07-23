import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST() {
	console.log('[LOGOUT API] POST request received');

	// Clear the auth cookie
	(await cookies()).delete({ name: 'auth_token', path: '/' });
	console.log('[LOGOUT API] Auth token cookie cleared');

	return NextResponse.json({ success: true });
}
