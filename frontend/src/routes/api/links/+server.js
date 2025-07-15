// API endpoint for CallSafe links management
import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

// GET - Fetch user's CallSafe links
export async function GET({ url }) {
    const pool = createDbPool();
    
    try {
        const userId = url.searchParams.get('userId');
        
        if (!userId) {
            return json({ success: false, error: 'User ID is required' }, { status: 400 });
        }

        const result = await pool.query(
            'SELECT * FROM callsafelinks WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        return json({
            success: true,
            links: result.rows
        });
    } catch (error) {
        console.error('Error fetching links:', error);
        return json({ success: false, error: 'Failed to fetch links' }, { status: 500 });
    } finally {
        await pool.end();
    }
}

// POST - Create new CallSafe link
export async function POST({ request }) {
    const pool = createDbPool();
    
    try {
        const data = await request.json();
        const { userId } = data;

        if (!userId) {
            return json({ success: false, error: 'User ID is required' }, { status: 400 });
        }

        // Generate unique link ID
        const linkId = randomBytes(8).toString('hex');
        const linkUrl = `https://callsafe.vercel.app/call/${linkId}`;

        const result = await pool.query(
            `INSERT INTO callsafelinks (user_id, link_id, link_url, is_embedded) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [userId, linkId, linkUrl, false]
        );

        return json({
            success: true,
            link: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating link:', error);
        return json({ success: false, error: 'Failed to create link' }, { status: 500 });
    } finally {
        await pool.end();
    }
}

// PUT - Update link embed status
export async function PUT({ request }) {
    const pool = createDbPool();
    
    try {
        const data = await request.json();
        const { linkId, isEmbedded } = data;

        if (!linkId || typeof isEmbedded !== 'boolean') {
            return json({ success: false, error: 'Link ID and embed status are required' }, { status: 400 });
        }

        const result = await pool.query(
            `UPDATE callsafelinks 
             SET is_embedded = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE link_id = $2 
             RETURNING *`,
            [isEmbedded, linkId]
        );

        if (result.rows.length === 0) {
            return json({ success: false, error: 'Link not found' }, { status: 404 });
        }

        return json({
            success: true,
            link: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating link:', error);
        return json({ success: false, error: 'Failed to update link' }, { status: 500 });
    } finally {
        await pool.end();
    }
}