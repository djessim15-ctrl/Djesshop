import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  try {
    const supabase = getSupabaseAdmin();
    const [requests, blocks, pending] = await Promise.all([
      supabase.from('print_requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('blocked_ips').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('print_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ]);
    if (requests.error || blocks.error || pending.error) throw requests.error || blocks.error || pending.error;
    return NextResponse.json({ requests: requests.data, blockedIps: blocks.data, pendingCount: pending.count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Admin data failed:', error);
    return NextResponse.json({ error: 'Impossible de charger les données.' }, { status: 503 });
  }
}
