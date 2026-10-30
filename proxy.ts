import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from './lib/client-ip';

/** Check the block list at the edge before serving public pages and APIs. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Moderation must stay available even if the administrator blocks their IP.
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/')) {
    return NextResponse.next();
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Local previews may load without secrets; production fails closed so an
  // accidentally missing configuration cannot silently disable IP blocking.
  if (!url || !key) return process.env.NODE_ENV === 'production' ? unavailable(pathname) : NextResponse.next();

  const ip = getClientIp(request.headers);
  if (!ip) return unavailable(pathname);
  try {
    const query = new URL('/rest/v1/blocked_ips', url);
    query.searchParams.set('select', 'id');
    query.searchParams.set('ip', `eq.${ip}`);
    query.searchParams.set('limit', '1');
    const result = await fetch(query, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!result.ok) return unavailable(pathname);
    const blocks = await result.json();
    if (!Array.isArray(blocks)) return unavailable(pathname);
    if (blocks.length) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
      return new NextResponse('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Accès refusé</title><body style="font:16px system-ui;padding:3rem;color:#20233d"><h1>Accès refusé</h1><p>Vous ne pouvez pas accéder à ce site.</p></body></html>', { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return NextResponse.next();
  } catch {
    return unavailable(pathname);
  }
}

function unavailable(pathname: string) {
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Le service est temporairement indisponible.' }, { status: 503 });
  return new NextResponse('Le service est temporairement indisponible. Réessayez dans quelques instants.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|images/|icon.svg|icon-192.png|icon-512.png|admin-manifest.webmanifest|sw.js|favicon.ico).*)'],
};
