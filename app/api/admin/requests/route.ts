import { NextResponse } from 'next/server';
import { isAdmin, isSameOrigin } from '@/lib/admin';
import { isRequestId, PHOTO_BUCKET } from '@/lib/photo-limits';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Requête non autorisée.' }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  try {
    const body = await request.json();
    if (!isRequestId(body.id) || !['new', 'contacted'].includes(body.status)) {
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
    if (!isRequestId(body.id)) return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
    const id = body.id.toLowerCase();
    const supabase = getSupabaseAdmin();
    const { data: item, error: findError } = await supabase.from('print_requests').select('id, photo_path').eq('id', id).maybeSingle();
    if (findError) throw findError;
    if (!item) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
    if (item.photo_path) {
      // Never delete an unrelated object, even if database contents were altered.
      if (item.photo_path !== `${id}.webp`) throw new Error('Invalid photo path');
      const { error: photoError } = await supabase.storage.from(PHOTO_BUCKET).remove([item.photo_path]);
      // Keep the request so the administrator can retry if storage is unavailable.
      if (photoError) throw photoError;
    }
    const { error } = await supabase.from('print_requests').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    console.error('Request deletion failed.');
    return NextResponse.json({ error: 'Impossible de supprimer la demande. Réessayez dans quelques instants.' }, { status: 503 });
  }
}
