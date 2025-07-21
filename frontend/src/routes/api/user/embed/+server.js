import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

export async function PUT({ request }) {
    const pool = createDbPool();
    
    try {
        const data = await request.json();
        const { userId, isEmbedded } = data;

        // Validation
        if (!userId || typeof isEmbedded !== 'boolean') {
            return json({ 
                success: false, 
                error: 'User ID and embedded status are required' 
            }, { status: 400 });
        }

        // Update user's embedded status
        const result = await pool.query(
            'UPDATE callsafeusers SET isembedded = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, name, isembedded',
            [isEmbedded, userId]
        );

        if (result.rows.length === 0) {
            return json({ 
                success: false, 
                error: 'User not found' 
            }, { status: 404 });
        }

        const updatedUser = result.rows[0];

        return json({
            success: true,
            message: isEmbedded ? 'Embed status activated successfully' : 'Embed status deactivated successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                isEmbedded: updatedUser.isembedded
            }
        });

    } catch (error) {
        console.error('Error updating embed status:', error);
        return json({ 
            success: false, 
            error: 'Failed to update embed status. Please try again.' 
        }, { status: 500 });
    } finally {
        await pool.end();
    }
}