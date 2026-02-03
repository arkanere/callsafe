import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

function createDbPool() {
  return createPool({ connectionString: POSTGRES_URL });
}

export async function POST({ request }) {
  console.log('[LOGIN API] POST request received');
  const pool = createDbPool();
  
  try {
    console.log('[LOGIN API] Parsing request body');
    const { email, password } = await request.json();
    console.log('[LOGIN API] Request data:', { email, passwordLength: password?.length });
    
    if (!email || !password) {
      console.log('[LOGIN API] Validation failed: missing email or password');
      return json({ success: false, error: 'Email and password required' }, { status: 400 });
    }
    
    console.log('[LOGIN API] Authenticating user');
    // Check if user exists and verify password
    const userResult = await pool.query(
      'SELECT id, email, password_hash, name, sourceid FROM callsafeusers WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      console.log('[LOGIN API] User not found');
      return json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }
    
    const user = userResult.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordValid) {
      console.log('[LOGIN API] Invalid password');
      return json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }
    
    console.log('[LOGIN API] User authenticated, fetching handle');
    // Fetch user's handle from callsafehandles table
    const handleResult = await pool.query(
      'SELECT handle FROM callsafehandles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user.id]
    );
    
    let handle;
    if (handleResult.rows.length === 0) {
      console.log('[LOGIN API] No handle found for user');
      return json({ success: false, error: 'No handle found for user. Please contact support.' }, { status: 404 });
    } else {
      handle = handleResult.rows[0].handle;
      console.log('[LOGIN API] Retrieved handle:', handle);
    }
    
    console.log('[LOGIN API] Creating JWT token');
    // Create JWT token with user data
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      handle,
      sourceId: user.sourceid || 'website',
      exp: Math.floor(Date.now() / 1000) + (6 * 30 * 24 * 60 * 60) // 6 months
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET);
    console.log('[LOGIN API] JWT token created successfully');
    
    const responseData = {
      success: true,
      message: 'Login successful',
      token,
      user: {
        email: user.email,
        handle,
        sourceId: user.sourceid || 'website'
      }
    };
    console.log('[LOGIN API] Login successful, returning response:', { ...responseData, token: '[REDACTED]' });
    return json(responseData);
    
  } catch (error) {
    console.error('[LOGIN API] Login error:', error);
    return json({ success: false, error: 'Login failed' }, { status: 500 });
  } finally {
    await pool.end();
  }
}