import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

function validateEmail(email) {
    console.log('[SIGNUP API] Validating email:', email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    console.log('[SIGNUP API] Email validation result:', isValid);
    return isValid;
}

function validatePassword(password) {
    console.log('[SIGNUP API] Validating password length:', password?.length);
    const isValid = password && password.length >= 6;
    console.log('[SIGNUP API] Password validation result:', isValid);
    return isValid;
}

export async function POST({ request }) {
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
            `INSERT INTO callsafehandles (user_id, handle_id, handle, is_embedded)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [newUser.id, handleId, handle, false]
        );

        const newHandle = handleResult.rows[0];
        console.log('[SIGNUP API] Handle created successfully:', { id: newHandle.id, handle: newHandle.handle });

        const responseData = {
            success: true,
            message: 'Account created successfully',
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                createdAt: newUser.created_at,
                isActive: newUser.is_active,
                sourceId: newUser.sourceid,
                isEmbedded: newUser.isembedded
            },
            handle: {
                id: newHandle.id,
                handleId: newHandle.handle_id,
                handle: newHandle.handle,
                isEmbedded: newHandle.is_embedded,
                createdAt: newHandle.created_at
            }
        };
        console.log('[SIGNUP API] Signup successful, returning response:', responseData);
        return json(responseData, { status: 201 });

    } catch (error) {
        console.error('[SIGNUP API] Error creating user:', error);
        
        // Handle duplicate email constraint violation
        if (error.code === '23505' && error.constraint === 'callsafeusers_email_key') {
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