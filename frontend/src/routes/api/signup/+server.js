import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    return password && password.length >= 6;
}

export async function POST({ request }) {
    const pool = createDbPool();
    
    try {
        const data = await request.json();
        const { email, password, name } = data;

        // Validation
        if (!email || !password || !name) {
            return json({ 
                success: false, 
                error: 'Email, password, and name are required' 
            }, { status: 400 });
        }

        if (!validateEmail(email)) {
            return json({ 
                success: false, 
                error: 'Please enter a valid email address' 
            }, { status: 400 });
        }

        if (!validatePassword(password)) {
            return json({ 
                success: false, 
                error: 'Password must be at least 6 characters long' 
            }, { status: 400 });
        }

        if (!name.trim()) {
            return json({ 
                success: false, 
                error: 'Please enter your full name' 
            }, { status: 400 });
        }

        // Check if user already exists
        const existingUserResult = await pool.query(
            'SELECT id FROM callsafeusers WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUserResult.rows.length > 0) {
            return json({ 
                success: false, 
                error: 'An account with this email already exists' 
            }, { status: 409 });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Generate unique sourceId
        const sourceId = `user_${randomBytes(8).toString('hex')}`;

        // Create new user
        const result = await pool.query(
            `INSERT INTO callsafeusers (email, password_hash, name, sourceid) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, email, name, created_at, is_active, sourceid`,
            [email.toLowerCase(), passwordHash, name.trim(), sourceId]
        );

        const newUser = result.rows[0];

        // Auto-create a handle for the new user using the same logic as the existing handle creation
        const handleId = randomBytes(8).toString('hex');
        const handle = handleId; // Store just the identifier, not the full URL

        const handleResult = await pool.query(
            `INSERT INTO callsafelinks (user_id, handle_id, handle, is_embedded) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [newUser.id, handleId, handle, false]
        );

        const newHandle = handleResult.rows[0];

        return json({
            success: true,
            message: 'Account created successfully',
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                createdAt: newUser.created_at,
                isActive: newUser.is_active,
                sourceId: newUser.sourceid
            },
            handle: {
                id: newHandle.id,
                handleId: newHandle.handle_id,
                handle: newHandle.handle,
                isEmbedded: newHandle.is_embedded,
                createdAt: newHandle.created_at
            }
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating user:', error);
        
        // Handle duplicate email constraint violation
        if (error.code === '23505' && error.constraint === 'callsafeusers_email_key') {
            return json({ 
                success: false, 
                error: 'An account with this email already exists' 
            }, { status: 409 });
        }

        return json({ 
            success: false, 
            error: 'Failed to create account. Please try again.' 
        }, { status: 500 });
    } finally {
        await pool.end();
    }
}