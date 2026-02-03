import { json } from '@sveltejs/kit';

export async function POST({ cookies }) {
  console.log('[LOGOUT API] POST request received');

  // Clear the auth cookie
  cookies.delete('auth_token', { path: '/' });
  console.log('[LOGOUT API] Auth token cookie cleared');

  return json({ success: true });
}
