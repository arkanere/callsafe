// API endpoint for user data management
import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

// GET - Fetch user data including sourceId
export async function GET({ url }) {
    const pool = createDbPool();
    
    try {
        const userId = url.searchParams.get('userId');
        
        if (!userId) {
            return json({ success: false, error: 'User ID is required' }, { status: 400 });
        }

        const result = await pool.query(
            'SELECT id, email, name, is_active, sourceid FROM callsafeusers WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const user = result.rows[0];

        return json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isActive: user.is_active,
                sourceId: user.sourceid
            }
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        return json({ success: false, error: 'Failed to fetch user data' }, { status: 500 });
    } finally {
        await pool.end();
    }
}