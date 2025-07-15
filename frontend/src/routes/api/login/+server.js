import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export async function POST({ request }) {
    const pool = createDbPool();
    
    try {
        const data = await request.json();
        const { email, password } = data;

        // Validation
        if (!email || !password) {
            return json({ 
                success: false, 
                error: 'Email and password are required' 
            }, { status: 400 });
        }

        if (!validateEmail(email)) {
            return json({ 
                success: false, 
                error: 'Please enter a valid email address' 
            }, { status: 400 });
        }

        // Find user by email
        const result = await pool.query(
            'SELECT id, email, password_hash, name, is_active FROM callsafeusers WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return json({ 
                success: false, 
                error: 'Invalid email or password' 
            }, { status: 401 });
        }

        const user = result.rows[0];

        // Check if account is active
        if (!user.is_active) {
            return json({ 
                success: false, 
                error: 'Account is deactivated. Please contact support.' 
            }, { status: 401 });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            return json({ 
                success: false, 
                error: 'Invalid email or password' 
            }, { status: 401 });
        }

        // Login successful
        return json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isActive: user.is_active
            }
        });

    } catch (error) {
        console.error('Error during login:', error);
        return json({ 
            success: false, 
            error: 'Login failed. Please try again.' 
        }, { status: 500 });
    } finally {
        await pool.end();
    }
}