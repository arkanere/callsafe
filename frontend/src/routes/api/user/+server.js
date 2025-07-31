// API endpoint for user data management
import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

// GET - Fetch user data including sourceId
export async function GET({ url }) {
    console.log('[USER API] GET request received');
    const pool = createDbPool();
    console.log('[USER API] Database pool created');
    
    try {
        const userId = url.searchParams.get('userId');
        console.log('[USER API] Request userId:', userId);
        
        if (!userId) {
            console.log('[USER API] Missing userId parameter');
            return json({ success: false, error: 'User ID is required' }, { status: 400 });
        }

        console.log('[USER API] Querying database for user data');
        const result = await pool.query(
            'SELECT id, email, name, is_active, sourceid, isembedded FROM callsafeusers WHERE id = $1',
            [userId]
        );
        console.log('[USER API] Query result:', result.rows.length, 'users found');

        if (result.rows.length === 0) {
            console.log('[USER API] User not found for ID:', userId);
            return json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const user = result.rows[0];
        console.log('[USER API] User data retrieved:', { id: user.id, email: user.email, name: user.name });

        const responseData = {
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isActive: user.is_active,
                sourceId: user.sourceid,
                isEmbedded: user.isembedded
            }
        };
        console.log('[USER API] Returning user data:', responseData);
        return json(responseData);
    } catch (error) {
        console.error('[USER API] Error fetching user data:', error);
        return json({ success: false, error: 'Failed to fetch user data' }, { status: 500 });
    } finally {
        console.log('[USER API] Closing database pool');
        await pool.end();
    }
}