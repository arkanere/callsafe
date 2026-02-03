// API endpoint for CallSafe handles management
import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import { extractBearerToken, verifyJWT, canAccessUserResource } from '$lib/server/auth.js';

function createDbPool() {
    return createPool({ connectionString: POSTGRES_URL });
}

// GET - Fetch user's CallSafe handles
export async function GET({ url, request }) {
    console.log('[LINKS API] GET request received');
    const pool = createDbPool();
    console.log('[LINKS API] Database pool created');

    try {
        const userId = url.searchParams.get('userId');
        console.log('[LINKS API] Request userId:', userId);

        if (!userId) {
            console.log('[LINKS API] Missing userId parameter');
            return json({ success: false, error: 'User ID is required' }, { status: 400 });
        }

        // Extract and verify JWT token
        const token = extractBearerToken(request.headers.get('authorization'));
        if (!token) {
            console.log('[LINKS API] Missing or invalid authorization header');
            return json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const tokenResult = verifyJWT(token);
        if (!tokenResult.valid) {
            console.log('[LINKS API] Invalid token:', tokenResult.error);
            return json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
        }

        // Verify user can only access their own handles
        if (!canAccessUserResource(tokenResult.payload.userId, userId)) {
            console.log('[LINKS API] Authorization failed: user', tokenResult.payload.userId, 'cannot access handles for user', userId);
            return json({ success: false, error: 'Forbidden: You can only access your own handles' }, { status: 403 });
        }

        console.log('[LINKS API] Querying database for user handles');
        const result = await pool.query(
            'SELECT * FROM callsafehandles WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        console.log('[LINKS API] Query result:', result.rows.length, 'handles found');

        const responseData = {
            success: true,
            handles: result.rows
        };
        console.log('[LINKS API] Returning handles:', responseData);
        return json(responseData);
    } catch (error) {
        console.error('[LINKS API] Error fetching handles:', error);
        return json({ success: false, error: 'Failed to fetch handles' }, { status: 500 });
    } finally {
        console.log('[LINKS API] Closing database pool');
        await pool.end();
    }
}

// POST - Create new CallSafe handle
export async function POST({ request }) {
    console.log('[LINKS API] POST request received');
    const pool = createDbPool();
    console.log('[LINKS API] Database pool created');

    try {
        console.log('[LINKS API] Parsing request body');
        const data = await request.json();
        const { userId } = data;
        console.log('[LINKS API] Request data:', { userId });

        if (!userId) {
            console.log('[LINKS API] Missing userId in request');
            return json({ success: false, error: 'User ID is required' }, { status: 400 });
        }

        // Extract and verify JWT token
        const token = extractBearerToken(request.headers.get('authorization'));
        if (!token) {
            console.log('[LINKS API] Missing or invalid authorization header');
            return json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const tokenResult = verifyJWT(token);
        if (!tokenResult.valid) {
            console.log('[LINKS API] Invalid token:', tokenResult.error);
            return json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
        }

        // Verify user can only create handles for themselves
        if (!canAccessUserResource(tokenResult.payload.userId, userId)) {
            console.log('[LINKS API] Authorization failed: user', tokenResult.payload.userId, 'cannot create handle for user', userId);
            return json({ success: false, error: 'Forbidden: You can only create handles for yourself' }, { status: 403 });
        }

        console.log('[LINKS API] Generating unique handle');
        // Generate unique handle (just the identifier)
        const handleId = randomBytes(8).toString('hex');
        const handle = handleId; // Store just the identifier, not the full URL
        console.log('[LINKS API] Generated handle:', handle);

        console.log('[LINKS API] Inserting handle into database');
        const result = await pool.query(
            `INSERT INTO callsafehandles (user_id, handle_id, handle, is_embedded)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, handleId, handle, false]
        );
        console.log('[LINKS API] Handle created successfully:', result.rows[0]);

        const responseData = {
            success: true,
            handle: result.rows[0]
        };
        console.log('[LINKS API] Returning created handle:', responseData);
        return json(responseData);
    } catch (error) {
        console.error('[LINKS API] Error creating handle:', error);
        return json({ success: false, error: 'Failed to create handle' }, { status: 500 });
    } finally {
        console.log('[LINKS API] Closing database pool');
        await pool.end();
    }
}

// PUT - Update handle embed status
export async function PUT({ request }) {
    console.log('[LINKS API] PUT request received');
    const pool = createDbPool();
    console.log('[LINKS API] Database pool created');

    try {
        console.log('[LINKS API] Parsing request body');
        const data = await request.json();
        const { handleId, isEmbedded } = data;
        console.log('[LINKS API] Request data:', { handleId, isEmbedded });

        if (!handleId || typeof isEmbedded !== 'boolean') {
            console.log('[LINKS API] Invalid request data - missing handleId or isEmbedded');
            return json({ success: false, error: 'Handle ID and embed status are required' }, { status: 400 });
        }

        // Extract and verify JWT token
        const token = extractBearerToken(request.headers.get('authorization'));
        if (!token) {
            console.log('[LINKS API] Missing or invalid authorization header');
            return json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const tokenResult = verifyJWT(token);
        if (!tokenResult.valid) {
            console.log('[LINKS API] Invalid token:', tokenResult.error);
            return json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
        }

        // Verify ownership before updating
        console.log('[LINKS API] Verifying handle ownership');
        const ownershipCheck = await pool.query(
            'SELECT user_id FROM callsafehandles WHERE handle_id = $1',
            [handleId]
        );

        if (ownershipCheck.rows.length === 0) {
            console.log('[LINKS API] Handle not found:', handleId);
            return json({ success: false, error: 'Handle not found' }, { status: 404 });
        }

        const handleOwnerId = ownershipCheck.rows[0].user_id;
        if (!canAccessUserResource(tokenResult.payload.userId, handleOwnerId)) {
            console.log('[LINKS API] Authorization failed: user', tokenResult.payload.userId, 'cannot modify handle owned by user', handleOwnerId);
            return json({ success: false, error: 'Forbidden: You can only update your own handles' }, { status: 403 });
        }

        console.log('[LINKS API] Updating handle embed status in database');
        const result = await pool.query(
            `UPDATE callsafehandles
             SET is_embedded = $1, updated_at = CURRENT_TIMESTAMP
             WHERE handle_id = $2
             RETURNING *`,
            [isEmbedded, handleId]
        );
        console.log('[LINKS API] Update query result:', result.rows.length, 'rows affected');

        const responseData = {
            success: true,
            handle: result.rows[0]
        };
        console.log('[LINKS API] Handle updated successfully:', responseData);
        return json(responseData);
    } catch (error) {
        console.error('[LINKS API] Error updating handle:', error);
        return json({ success: false, error: 'Failed to update handle' }, { status: 500 });
    } finally {
        console.log('[LINKS API] Closing database pool');
        await pool.end();
    }
}