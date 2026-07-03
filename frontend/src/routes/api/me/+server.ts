import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '$env/static/private';

export async function GET({ cookies }) {
  console.log('[ME API] GET request received');
  try {
    const token = cookies.get('auth_token');
    console.log('[ME API] Cookie token present:', !!token);

    if (!token) {
      console.log('[ME API] No token found');
      return json({ authenticated: false }, { status: 401 });
    }

    try {
      console.log('[ME API] Verifying JWT token');
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      console.log('[ME API] Token verified:', { email: decoded.email, handle: decoded.handle });

      return json({
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
      return json({ authenticated: false }, { status: 401 });
    }

  } catch (error) {
    console.error('[ME API] Error:', error);
    return json({ authenticated: false }, { status: 500 });
  }
}
