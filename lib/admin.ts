import { cookies } from 'next/headers';
import { getSupabaseAuth } from './supabase';

export const ADMIN_COOKIE = 'djesshop_admin';

export async function isAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!email || !token) return false;
  try {
    const { data, error } = await getSupabaseAuth().auth.getUser(token);
    return !error && data.user?.email?.toLowerCase() === email;
  } catch {
    return false;
  }
}

/** Reject cross-site state changes even when a browser sends a cookie. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
