import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '$env/static/private';

export async function POST({ cookies }) {
  console.log('[REFRESH API] POST request received');
  try {
    console.log('[REFRESH API] Getting token from cookie');
    const token = cookies.get('auth_token');
    console.log('[REFRESH API] Cookie token present:', !!token);

    if (!token) {
      console.log('[REFRESH API] No token found in cookie');
      return json({ success: false, error: 'No token provided' }, { status: 401 });
    }

    try {
      console.log('[REFRESH API] Verifying JWT token');
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      console.log('[REFRESH API] Token verified successfully:', { email: decoded.email, handle: decoded.handle });

      console.log('[REFRESH API] Creating new token with extended expiration');
      // Create new token with extended expiration
      const newTokenPayload = {
        userId: decoded.userId,
        email: decoded.email,
        handle: decoded.handle,
        sourceId: decoded.sourceId,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      };
      const newToken = jwt.sign(newTokenPayload, JWT_SECRET);
      console.log('[REFRESH API] New token created successfully');

      // Update the httpOnly cookie with new token
      cookies.set('auth_token', newToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 // 24 hours
      });
      console.log('[REFRESH API] Auth token cookie updated');

      console.log('[REFRESH API] Token refresh successful');
      return json({ success: true });

    } catch (jwtError) {
      console.error('[REFRESH API] JWT verification failed:', jwtError);
      return json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

  } catch (error) {
    console.error('[REFRESH API] Token refresh error:', error);
    return json({ success: false, error: 'Token refresh failed' }, { status: 500 });
  }
}