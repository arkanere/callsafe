// Core unsubscribe logic, extracted verbatim from the SvelteKit
// api/unsubscribe/+server.ts so the route handler and the Server Action share it.
import { createPool } from '@vercel/postgres';
import type { ServiceResult } from './auth-service';

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
	throw new Error('POSTGRES_URL environment variable is not set');
}

function createDbPool() {
	return createPool({ connectionString: POSTGRES_URL });
}

export async function unsubscribeEmail(input: { email?: unknown }): Promise<ServiceResult> {
	const pool = createDbPool();

	try {
		const { email } = input;

		if (!email || typeof email !== 'string') {
			return {
				status: 400,
				body: { success: false, error: 'Valid email address is required' }
			};
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
			return { status: 200, body: { success: true, message: 'Email already unsubscribed' } };
		}

		// Insert email into unsubscribe table
		const insertResult = await pool.query(
			'INSERT INTO callsafe_unsubscribe (email) VALUES ($1) RETURNING id',
			[normalizedEmail]
		);

		return {
			status: 200,
			body: {
				success: true,
				id: insertResult.rows[0].id,
				message: 'Successfully unsubscribed'
			}
		};
	} catch (error) {
		console.error('Error processing unsubscribe request:', error);
		return {
			status: 500,
			body: {
				success: false,
				error: 'Failed to process unsubscription request'
			}
		};
	} finally {
		await pool.end();
	}
}
