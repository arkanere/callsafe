// API endpoint for CallSafe handles management
import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

// GET - Fetch user's CallSafe handles
export async function GET({ url }) {
    const pool = createDbPool();
    
    try {
        const userId = url.searchParams.get('userId');
        
        if (!userId) {
            return json({ success: false, error: 'User ID is required' }, { status: 400 });
        }

        const result = await pool.query(
            'SELECT * FROM callsafehandles WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        return json({
            success: true,
            handles: result.rows
        });
    } catch (error) {
        console.error('Error fetching handles:', error);
        return json({ success: false, error: 'Failed to fetch handles' }, { status: 500 });
    } finally {
        await pool.end();
    }
}

// POST - Create new CallSafe handle
export async function POST({ request }) {
    const pool = createDbPool();
    
    try {
        const data = await request.json();
        const { userId } = data;

        if (!userId) {
            return json({ success: false, error: 'User ID is required' }, { status: 400 });
        }

        // Generate unique handle (just the identifier)
        const handleId = randomBytes(8).toString('hex');
        const handle = handleId; // Store just the identifier, not the full URL

        const result = await pool.query(
            `INSERT INTO callsafehandles (user_id, handle_id, handle, is_embedded) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [userId, handleId, handle, false]
        );

        return json({
            success: true,
            handle: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating handle:', error);
        return json({ success: false, error: 'Failed to create handle' }, { status: 500 });
    } finally {
        await pool.end();
    }
}

// PUT - Update handle embed status
export async function PUT({ request }) {
    const pool = createDbPool();
    
    try {
        const data = await request.json();
        const { handleId, isEmbedded } = data;

        if (!handleId || typeof isEmbedded !== 'boolean') {
            return json({ success: false, error: 'Handle ID and embed status are required' }, { status: 400 });
        }

        const result = await pool.query(
            `UPDATE callsafelinks 
             SET is_embedded = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE handle_id = $2 
             RETURNING *`,
            [isEmbedded, handleId]
        );

        if (result.rows.length === 0) {
            return json({ success: false, error: 'Handle not found' }, { status: 404 });
        }

        return json({
            success: true,
            handle: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating handle:', error);
        return json({ success: false, error: 'Failed to update handle' }, { status: 500 });
    } finally {
        await pool.end();
    }
}