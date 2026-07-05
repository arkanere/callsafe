// Authentication utility - pure functions for JWT verification
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '$env/static/private';

/**
 * Extracts Bearer token from Authorization header
 * @param {string|null} authHeader - The Authorization header value
 * @returns {string|null} - The extracted token or null
 */
export function extractBearerToken(authHeader) {
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}

/**
 * Verifies JWT token and returns decoded payload
 * @param {string} token - The JWT token to verify
 * @returns {{ valid: true, payload: import('jsonwebtoken').JwtPayload } | { valid: false, error: string }}
 */
export function verifyJWT(token) {
    try {
        const payload = /** @type {import('jsonwebtoken').JwtPayload} */ (jwt.verify(token, JWT_SECRET));
        return { valid: true, payload };
    } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Checks if authenticated user matches requested user
 * @param {number|string} authenticatedUserId - User ID from JWT
 * @param {number|string} requestedUserId - Requested user ID
 * @returns {boolean}
 */
export function canAccessUserResource(authenticatedUserId, requestedUserId) {
    const authId = parseInt(String(authenticatedUserId));
    const reqId = parseInt(String(requestedUserId));
    return !isNaN(authId) && !isNaN(reqId) && authId === reqId;
}
