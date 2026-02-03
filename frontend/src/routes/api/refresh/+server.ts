import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Application cannot start.');
}

export async function POST({ request }) {
  console.log('[REFRESH API] POST request received');
  try {
    console.log('[REFRESH API] Getting authorization header');
    const authHeader = request.headers.get('authorization');
    console.log('[REFRESH API] Auth header present:', !!authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[REFRESH API] No valid authorization header found');
      return json({ success: false, error: 'No token provided' }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    console.log('[REFRESH API] Token extracted, length:', token.length);
    
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
      
      const responseData = {
        success: true,
        token: newToken
      };
      console.log('[REFRESH API] Token refresh successful, returning new token');
      return json(responseData);
      
    } catch (jwtError) {
      console.error('[REFRESH API] JWT verification failed:', jwtError);
      return json({ success: false, error: 'Invalid token' }, { status: 401 });
    }
    
  } catch (error) {
    console.error('[REFRESH API] Token refresh error:', error);
    return json({ success: false, error: 'Token refresh failed' }, { status: 500 });
  }
}