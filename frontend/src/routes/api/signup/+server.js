import { createPool } from '@vercel/postgres';
import { POSTGRES_URL, JWT_SECRET } from '$env/static/private';
import { json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import validator from 'validator';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

/** @param {string} email */
function validateEmail(email) {
    console.log('[SIGNUP API] Validating email:', email);

    // Length check (RFC 5321)
    if (!email || email.length > 254) {
        console.log('[SIGNUP API] Email validation failed: invalid length');
        return false;
    }

    // RFC 5322 compliant validation
    const isValid = validator.isEmail(email, {
        allow_utf8_local_part: false,
        require_tld: true,
        allow_ip_domain: false
    });

    console.log('[SIGNUP API] Email validation result:', isValid);
    return isValid;
}

/** @param {string} password */
function validatePassword(password) {
    console.log('[SIGNUP API] Validating password length:', password?.length);
    const isValid = password && password.length >= 6;
    console.log('[SIGNUP API] Password validation result:', isValid);
    return isValid;
}

export async function POST({ request, cookies }) {
    console.log('[SIGNUP API] POST request received');
    const pool = createDbPool();
    console.log('[SIGNUP API] Database pool created');
    
    try {
        console.log('[SIGNUP API] Parsing request body');
        const data = await request.json();
        const { email, password, name } = data;
        console.log('[SIGNUP API] Request data:', { email, name, passwordLength: password?.length });

        console.log('[SIGNUP API] Starting validation');
        // Validation
        if (!email || !password || !name) {
            console.log('[SIGNUP API] Validation failed: missing required fields');
            return json({ 
                success: false, 
                error: 'Email, password, and name are required' 
            }, { status: 400 });
        }

        if (!validateEmail(email)) {
            console.log('[SIGNUP API] Validation failed: invalid email');
            return json({ 
                success: false, 
                error: 'Please enter a valid email address' 
            }, { status: 400 });
        }

        if (!validatePassword(password)) {
            console.log('[SIGNUP API] Validation failed: invalid password');
            return json({ 
                success: false, 
                error: 'Password must be at least 6 characters long' 
            }, { status: 400 });
        }

        if (!name.trim()) {
            console.log('[SIGNUP API] Validation failed: empty name');
            return json({ 
                success: false, 
                error: 'Please enter your full name' 
            }, { status: 400 });
        }
        
        console.log('[SIGNUP API] All validations passed');

        console.log('[SIGNUP API] Checking if user already exists');
        // Check if user already exists
        const existingUserResult = await pool.query(
            'SELECT id FROM callsafeusers WHERE email = $1',
            [email.toLowerCase()]
        );
        console.log('[SIGNUP API] Existing user query result:', existingUserResult.rows.length, 'rows');

        if (existingUserResult.rows.length > 0) {
            console.log('[SIGNUP API] User already exists with email:', email);
            return json({ 
                success: false, 
                error: 'An account with this email already exists' 
            }, { status: 409 });
        }

        console.log('[SIGNUP API] Hashing password');
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        console.log('[SIGNUP API] Password hashed successfully');

        console.log('[SIGNUP API] Generating unique sourceId');
        // Generate unique sourceId
        const sourceId = `user_${randomBytes(8).toString('hex')}`;
        console.log('[SIGNUP API] Generated sourceId:', sourceId);

        console.log('[SIGNUP API] Creating new user in database');
        // Create new user
        const result = await pool.query(
            `INSERT INTO callsafeusers (email, password_hash, name, sourceid, isembedded) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, email, name, created_at, is_active, sourceid, isembedded`,
            [email.toLowerCase(), passwordHash, name.trim(), sourceId, false]
        );

        const newUser = result.rows[0];
        console.log('[SIGNUP API] New user created:', { id: newUser.id, email: newUser.email, name: newUser.name });

        console.log('[SIGNUP API] Auto-creating handle for new user');
        // Auto-create a handle for the new user using the same logic as the existing handle creation
        const handleId = randomBytes(8).toString('hex');
        const handle = handleId; // Store just the identifier, not the full URL
        console.log('[SIGNUP API] Generated handle:', handle);

        const handleResult = await pool.query(
            `INSERT INTO callsafehandles (user_id, handle, is_embedded)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [newUser.id, handle, false]
        );

        const newHandle = handleResult.rows[0];
        console.log('[SIGNUP API] Handle created successfully:', { id: newHandle.id, handle: newHandle.handle });

        console.log('[SIGNUP API] Creating JWT token for auto-login');
        // Create JWT token to auto-login the user after signup
        const tokenPayload = {
            userId: newUser.id,
            email: newUser.email,
            handle: newHandle.handle,
            sourceId: newUser.sourceid,
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        };
        const token = jwt.sign(tokenPayload, JWT_SECRET);
        console.log('[SIGNUP API] JWT token created');

        // Set httpOnly cookie for auto-login
        cookies.set('auth_token', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24 // 24 hours
        });
        console.log('[SIGNUP API] Auth token set as httpOnly cookie');

        const responseData = {
            success: true,
            message: 'Account created successfully',
            user: {
                email: newUser.email,
                handle: newHandle.handle,
                sourceId: newUser.sourceid
            }
        };
        console.log('[SIGNUP API] Signup successful, returning response');
        return json(responseData, { status: 201 });

    } catch (error) {
        console.error('[SIGNUP API] Error creating user:', error);
        
        // Handle duplicate email constraint violation
        const dbError = /** @type {{ code?: string; constraint?: string }} */ (error);
        if (dbError.code === '23505' && dbError.constraint === 'callsafeusers_email_key') {
            console.log('[SIGNUP API] Duplicate email constraint violation');
            return json({ 
                success: false, 
                error: 'An account with this email already exists' 
            }, { status: 409 });
        }

        console.log('[SIGNUP API] Returning generic error response');
        return json({ 
            success: false, 
            error: 'Failed to create account. Please try again.' 
        }, { status: 500 });
    } finally {
        console.log('[SIGNUP API] Closing database pool');
        await pool.end();
    }
}