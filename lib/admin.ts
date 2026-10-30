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
  const host = request.headers.get('host');
  // Next can construct request.url using its bind address (0.0.0.0), so use
  // the HTTP Host header, which is the host the browser actually requested.
  if (!origin || !host || /[\s,/@\\?#]/.test(host)) return false;
  try {
    const source = new URL(origin);
    if (!['http:', 'https:'].includes(source.protocol) || source.origin !== origin) return false;
    if (new URL(`${source.protocol}//${host}`).host !== source.host) return false;
    const trustedProxy = process.env.VERCEL === '1' || process.env.TRUSTED_PROXY === 'forwarded' || process.env.NODE_ENV === 'development';
    const protocol = trustedProxy ? request.headers.get('x-forwarded-proto') : null;
    const expectedProtocol = protocol || new URL(request.url).protocol.replace(':', '');
    return source.protocol === `${expectedProtocol}:`;
  } catch { return false; }
}
