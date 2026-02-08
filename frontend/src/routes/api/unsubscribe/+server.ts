import { json } from '@sveltejs/kit';
import { createPool } from '@vercel/postgres';
import { POSTGRES_URL } from '$env/static/private';

function createDbPool() {
  return createPool({ connectionString: POSTGRES_URL });
}

export async function POST({ request }) {
  const pool = createDbPool();

  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return json({ success: false, error: 'Valid email address is required' }, { status: 400 });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already unsubscribed
    const checkResult = await pool.query(
      'SELECT email FROM callsafe_unsubscribe WHERE email = $1',
      [normalizedEmail]
    );

    // If email already exists in unsubscribe table, return success
    if (checkResult.rows.length > 0) {
      return json({ success: true, message: 'Email already unsubscribed' });
    }

    // Insert email into unsubscribe table
    const insertResult = await pool.query(
      'INSERT INTO callsafe_unsubscribe (email) VALUES ($1) RETURNING id',
      [normalizedEmail]
    );

    return json({
      success: true,
      id: insertResult.rows[0].id,
      message: 'Successfully unsubscribed'
    });

  } catch (error) {
    console.error('Error processing unsubscribe request:', error);
    return json(
      {
        success: false,
        error: 'Failed to process unsubscription request'
      },
      { status: 500 }
    );
  } finally {
    await pool.end();
  }
}
