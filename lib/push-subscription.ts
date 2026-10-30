import type { PushSubscription } from 'web-push';

// Only accept established browser push services. In particular, never let an
// input URL turn the server's notification sender into an arbitrary HTTP client.
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com', 'wns.windows.com'];

export function isValidPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function validKey(value: unknown, bytes: number) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === bytes && decoded.toString('base64url') === value && (bytes !== 65 || decoded[0] === 4);
}

/** Strip unexpected fields and validate the exact shape produced by PushManager. */
export function normalizePushSubscription(value: unknown): PushSubscription | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!isValidPushEndpoint(candidate.endpoint) || !candidate.keys || typeof candidate.keys !== 'object') return null;
  const keys = candidate.keys as Record<string, unknown>;
  if (!validKey(keys.p256dh, 65) || !validKey(keys.auth, 16)) return null;
  return { endpoint: candidate.endpoint, keys: { p256dh: keys.p256dh as string, auth: keys.auth as string } };
}
