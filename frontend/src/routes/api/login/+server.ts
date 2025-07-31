import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';

const JWT_SECRET = '***REDACTED***';

export async function POST({ request }) {
  console.log('[LOGIN API] POST request received');
  try {
    console.log('[LOGIN API] Parsing request body');
    const { email, password } = await request.json();
    console.log('[LOGIN API] Request data:', { email, passwordLength: password?.length });
    
    // Simple mock authentication - accept any email/password
    if (!email || !password) {
      console.log('[LOGIN API] Validation failed: missing email or password');
      return json({ success: false, error: 'Email and password required' }, { status: 400 });
    }
    
    console.log('[LOGIN API] Validation passed, generating user handle');
    // Create a mock user handle (16 character hex)
    const handle = Math.random().toString(16).substr(2, 16);
    console.log('[LOGIN API] Generated handle:', handle);
    
    console.log('[LOGIN API] Creating JWT token');
    // Create JWT token with user data
    const tokenPayload = {
      email,
      handle,
      sourceId: 'demo-source',
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET);
    console.log('[LOGIN API] JWT token created successfully');
    
    const responseData = {
      success: true,
      token,
      user: {
        email,
        handle,
        sourceId: 'demo-source'
      }
    };
    console.log('[LOGIN API] Login successful, returning response:', { ...responseData, token: '[REDACTED]' });
    return json(responseData);
    
  } catch (error) {
    console.error('[LOGIN API] Login error:', error);
    return json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}