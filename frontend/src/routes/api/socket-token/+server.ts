import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Application cannot start.');
}

// Provides a short-lived token for WebSocket authentication
// This is necessary because WebSocket cannot read httpOnly cookies directly
export async function GET({ cookies }) {
  console.log('[SOCKET TOKEN API] GET request received');

  try {
    const token = cookies.get('auth_token');
    console.log('[SOCKET TOKEN API] Cookie token present:', !!token);

    if (!token) {
      console.log('[SOCKET TOKEN API] No token found');
      return json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
      console.log('[SOCKET TOKEN API] Verifying JWT token');
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      console.log('[SOCKET TOKEN API] Token verified:', { email: decoded.email });

      // Create a short-lived token for WebSocket (5 minutes)
      const socketTokenPayload = {
        userId: decoded.userId,
        email: decoded.email,
        handle: decoded.handle,
        sourceId: decoded.sourceId,
        exp: Math.floor(Date.now() / 1000) + (5 * 60) // 5 minutes
      };
      const socketToken = jwt.sign(socketTokenPayload, JWT_SECRET);
      console.log('[SOCKET TOKEN API] Socket token created');

      return json({ token: socketToken });

    } catch (jwtError) {
      console.error('[SOCKET TOKEN API] JWT verification failed:', jwtError);
      return json({ error: 'Invalid token' }, { status: 401 });
    }

  } catch (error) {
    console.error('[SOCKET TOKEN API] Error:', error);
    return json({ error: 'Failed to generate socket token' }, { status: 500 });
  }
}
