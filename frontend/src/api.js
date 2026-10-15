import { supabase } from './supabaseClient';

// Backend base URL. In Vercel, set VITE_API_URL (no trailing slash).
// For local development, create a .env.local file containing:
//   VITE_API_URL=http://127.0.0.1:5000
const API_URL = (import.meta.env.VITE_API_URL || 'https://greninja-ovg9.onrender.com').replace(/\/$/, '');

/**
 * fetch() for the Flask backend. Attaches the signed-in user's Supabase access
 * token so the backend can verify who is calling, instead of trusting a user_id
 * sent from the browser.
 */
export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You are signed out. Please log in again.');

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}