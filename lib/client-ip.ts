import ipaddr from 'ipaddr.js';

/** Parse one IP (not a network or a forwarded list), normalizing mapped IPv4. */
export function normalizeIp(value: string | null | undefined): string | null {
  if (!value || value.length > 64 || value.includes('/') || value.includes('%')) return null;
  const text = value.trim();
  if (!ipaddr.isValid(text)) return null;
  const address = ipaddr.parse(text);
  if (address.kind() === 'ipv6' && (address as ipaddr.IPv6).isIPv4MappedAddress()) {
    return (address as ipaddr.IPv6).toIPv4Address().toString();
  }
  return address.toString();
}

/**
 * Only trust a forwarded header if the hosting platform guarantees that it
 * overwrites it. A directly exposed self-hosted Next server must not set
 * TRUSTED_PROXY=forwarded; the reverse proxy must replace (not append) XFF.
 */
export function getClientIp(headers: Headers): string | null {
  if (process.env.VERCEL === '1') {
    return normalizeIp(headers.get('x-vercel-forwarded-for'));
  }
  if (process.env.TRUSTED_PROXY === 'forwarded') {
    return normalizeIp(headers.get('x-forwarded-for'));
  }
  // A convenient, explicit development-only identity. Production fails closed.
  if (process.env.NODE_ENV === 'development') return '127.0.0.1';
  return null;
}
