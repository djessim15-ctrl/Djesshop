import { NextResponse } from 'next/server';
import { isAdmin, isSameOrigin } from '@/lib/admin';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Requête non autorisée.' }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) || !['new', 'contacted'].includes(body.status)) {
      return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
    }
    const { error } = await getSupabaseAdmin().from('print_requests').update({ status: body.status }).eq('id', body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Request update failed:', error);
    return NextResponse.json({ error: 'Impossible de modifier la demande.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Requête non autorisée.' }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
      return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
    }
    const { error } = await getSupabaseAdmin().from('print_requests').delete().eq('id', body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Request deletion failed:', error);
    return NextResponse.json({ error: 'Impossible de supprimer la demande.' }, { status: 503 });
  }
}
