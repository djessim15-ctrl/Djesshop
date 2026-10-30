import { NextResponse } from 'next/server';
import { isAdmin, isSameOrigin } from '@/lib/admin';
import { normalizeIp } from '@/lib/client-ip';
import { getSupabaseAdmin } from '@/lib/supabase';

async function guard(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Requête non autorisée.' }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  return null;
}

export async function POST(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  try {
    const body = await request.json();
    const ip = normalizeIp(typeof body.ip === 'string' ? body.ip : null);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
    if (!ip) return NextResponse.json({ error: 'Indiquez une adresse IPv4 ou IPv6 valide.' }, { status: 400 });
    const { error } = await getSupabaseAdmin().from('blocked_ips').upsert({ ip, reason }, { onConflict: 'ip' });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('IP block failed:', error);
    return NextResponse.json({ error: 'Impossible de bloquer cette adresse.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  try {
    const body = await request.json();
    const ip = normalizeIp(typeof body.ip === 'string' ? body.ip : null);
    if (!ip) return NextResponse.json({ error: 'Adresse IP invalide.' }, { status: 400 });
    const { error } = await getSupabaseAdmin().from('blocked_ips').delete().eq('ip', ip);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('IP unblock failed:', error);
    return NextResponse.json({ error: 'Impossible de débloquer cette adresse.' }, { status: 503 });
  }
}
