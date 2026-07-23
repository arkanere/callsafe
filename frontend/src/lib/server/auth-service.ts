// Core login/signup logic, extracted verbatim from the SvelteKit +server.js
// handlers so that both the /api route handlers and the Server Actions can
// call it. Queries, validation, log lines and error messages are unchanged.
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createPool } from '@vercel/postgres';
import { randomBytes } from 'crypto';
import validator from 'validator';

const POSTGRES_URL = process.env.POSTGRES_URL;
const JWT_SECRET = process.env.JWT_SECRET;
if (!POSTGRES_URL) {
	throw new Error('POSTGRES_URL environment variable is not set');
}
if (!JWT_SECRET) {
	throw new Error('JWT_SECRET environment variable is not set');
}

export interface ServiceResult {
	status: number;
	body: unknown;
	/** When present the caller must set the auth_token cookie with this value. */
	token?: string;
}

function createDbPool() {
	return createPool({ connectionString: POSTGRES_URL });
}

export async function loginUser(input: { email?: string; password?: string }): Promise<ServiceResult> {
	const pool = createDbPool();

	try {
		const { email, password } = input;
		console.log('[LOGIN API] Request data:', { email, passwordLength: password?.length });

		if (!email || !password) {
			console.log('[LOGIN API] Validation failed: missing email or password');
			return { status: 400, body: { success: false, error: 'Email and password required' } };
		}

		console.log('[LOGIN API] Authenticating user');
		// Check if user exists and verify password
		const userResult = await pool.query(
			'SELECT id, email, password_hash, name, sourceid FROM callsafeusers WHERE email = $1',
			[email.toLowerCase()]
		);

		if (userResult.rows.length === 0) {
			console.log('[LOGIN API] User not found');
			return { status: 401, body: { success: false, error: 'Invalid email or password' } };
		}

		const user = userResult.rows[0];
		const passwordValid = await bcrypt.compare(password, user.password_hash);

		if (!passwordValid) {
			console.log('[LOGIN API] Invalid password');
			return { status: 401, body: { success: false, error: 'Invalid email or password' } };
		}

		console.log('[LOGIN API] User authenticated, fetching handle');
		// Fetch user's handle from callsafehandles table
		const handleResult = await pool.query(
			'SELECT handle FROM callsafehandles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
			[user.id]
		);

		let handle;
		if (handleResult.rows.length === 0) {
			console.log('[LOGIN API] No handle found for user');
			return {
				status: 404,
				body: { success: false, error: 'No handle found for user. Please contact support.' }
			};
		} else {
			handle = handleResult.rows[0].handle;
			console.log('[LOGIN API] Retrieved handle:', handle);
		}

		console.log('[LOGIN API] Creating JWT token');
		// Create JWT token with user data
		const tokenPayload = {
			userId: user.id,
			email: user.email,
			handle,
			sourceId: user.sourceid || 'website',
			exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
		};
		const token = jwt.sign(tokenPayload, JWT_SECRET!);
		console.log('[LOGIN API] JWT token created successfully');

		const responseData = {
			success: true,
			message: 'Login successful',
			user: {
				email: user.email,
				handle,
				sourceId: user.sourceid || 'website'
			}
		};
		console.log('[LOGIN API] Login successful, returning response');
		return { status: 200, body: responseData, token };
	} catch (error) {
		console.error('[LOGIN API] Login error:', error);
		return { status: 500, body: { success: false, error: 'Login failed' } };
	} finally {
		await pool.end();
	}
}

function validateEmail(email: string) {
	console.log('[SIGNUP API] Validating email:', email);

	// Length check (RFC 5321)
	if (!email || email.length > 254) {
		console.log('[SIGNUP API] Email validation failed: invalid length');
		return false;
	}

	// RFC 5322 compliant validation
	const isValid = validator.isEmail(email, {
		allow_utf8_local_part: false,
		require_tld: true,
		allow_ip_domain: false
	});

	console.log('[SIGNUP API] Email validation result:', isValid);
	return isValid;
}

function validatePassword(password: string) {
	console.log('[SIGNUP API] Validating password length:', password?.length);
	const isValid = password && password.length >= 6;
	console.log('[SIGNUP API] Password validation result:', isValid);
	return isValid;
}

export async function signupUser(input: {
	email?: string;
	password?: string;
	name?: string;
}): Promise<ServiceResult> {
	const pool = createDbPool();
	console.log('[SIGNUP API] Database pool created');

	try {
		const { email, password, name } = input;
		console.log('[SIGNUP API] Request data:', { email, name, passwordLength: password?.length });

		console.log('[SIGNUP API] Starting validation');
		// Validation
		if (!email || !password || !name) {
			console.log('[SIGNUP API] Validation failed: missing required fields');
			return {
				status: 400,
				body: { success: false, error: 'Email, password, and name are required' }
			};
		}

		if (!validateEmail(email)) {
			console.log('[SIGNUP API] Validation failed: invalid email');
			return {
				status: 400,
				body: { success: false, error: 'Please enter a valid email address' }
			};
		}

		if (!validatePassword(password)) {
			console.log('[SIGNUP API] Validation failed: invalid password');
			return {
				status: 400,
				body: { success: false, error: 'Password must be at least 6 characters long' }
			};
		}

		if (!name.trim()) {
			console.log('[SIGNUP API] Validation failed: empty name');
			return { status: 400, body: { success: false, error: 'Please enter your full name' } };
		}

		console.log('[SIGNUP API] All validations passed');

		console.log('[SIGNUP API] Checking if user already exists');
		// Check if user already exists
		const existingUserResult = await pool.query(
			'SELECT id FROM callsafeusers WHERE email = $1',
			[email.toLowerCase()]
		);
		console.log(
			'[SIGNUP API] Existing user query result:',
			existingUserResult.rows.length,
			'rows'
		);

		if (existingUserResult.rows.length > 0) {
			console.log('[SIGNUP API] User already exists with email:', email);
			return {
				status: 409,
				body: { success: false, error: 'An account with this email already exists' }
			};
		}

		console.log('[SIGNUP API] Hashing password');
		// Hash password
		const saltRounds = 12;
		const passwordHash = await bcrypt.hash(password, saltRounds);
		console.log('[SIGNUP API] Password hashed successfully');

		console.log('[SIGNUP API] Generating unique sourceId');
		// Generate unique sourceId
		const sourceId = `user_${randomBytes(8).toString('hex')}`;
		console.log('[SIGNUP API] Generated sourceId:', sourceId);

		console.log('[SIGNUP API] Creating new user in database');
		// Create new user
		const result = await pool.query(
			`INSERT INTO callsafeusers (email, password_hash, name, sourceid, isembedded)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, email, name, created_at, is_active, sourceid, isembedded`,
			[email.toLowerCase(), passwordHash, name.trim(), sourceId, false]
		);

		const newUser = result.rows[0];
		console.log('[SIGNUP API] New user created:', {
			id: newUser.id,
			email: newUser.email,
			name: newUser.name
		});

		console.log('[SIGNUP API] Auto-creating handle for new user');
		// Auto-create a handle for the new user using the same logic as the existing handle creation
		const handleId = randomBytes(8).toString('hex');
		const handle = handleId; // Store just the identifier, not the full URL
		console.log('[SIGNUP API] Generated handle:', handle);

		const handleResult = await pool.query(
			`INSERT INTO callsafehandles (user_id, handle, is_embedded)
             VALUES ($1, $2, $3)
             RETURNING *`,
			[newUser.id, handle, false]
		);

		const newHandle = handleResult.rows[0];
		console.log('[SIGNUP API] Handle created successfully:', {
			id: newHandle.id,
			handle: newHandle.handle
		});

		console.log('[SIGNUP API] Creating JWT token for auto-login');
		// Create JWT token to auto-login the user after signup
		const tokenPayload = {
			userId: newUser.id,
			email: newUser.email,
			handle: newHandle.handle,
			sourceId: newUser.sourceid,
			exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 // 24 hours
		};
		const token = jwt.sign(tokenPayload, JWT_SECRET!);
		console.log('[SIGNUP API] JWT token created');

		const responseData = {
			success: true,
			message: 'Account created successfully',
			user: {
				email: newUser.email,
				handle: newHandle.handle,
				sourceId: newUser.sourceid
			}
		};
		console.log('[SIGNUP API] Signup successful, returning response');
		return { status: 201, body: responseData, token };
	} catch (error) {
		console.error('[SIGNUP API] Error creating user:', error);

		// Handle duplicate email constraint violation
		const dbError = error as { code?: string; constraint?: string };
		if (dbError.code === '23505' && dbError.constraint === 'callsafeusers_email_key') {
			console.log('[SIGNUP API] Duplicate email constraint violation');
			return {
				status: 409,
				body: { success: false, error: 'An account with this email already exists' }
			};
		}

		console.log('[SIGNUP API] Returning generic error response');
		return {
			status: 500,
			body: { success: false, error: 'Failed to create account. Please try again.' }
		};
	} finally {
		console.log('[SIGNUP API] Closing database pool');
		await pool.end();
	}
}
