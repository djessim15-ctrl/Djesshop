import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { isRequestId, PHOTO_BUCKET } from '@/lib/photo-limits';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, noarchive' };

/** Stream the private object only after checking the administrator's session. */
export async function GET(request: Request) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401, headers: noStore });
  const id = new URL(request.url).searchParams.get('id');
  if (!isRequestId(id)) return NextResponse.json({ error: 'Demande invalide.' }, { status: 400, headers: noStore });
  try {
    const supabase = getSupabaseAdmin();
    const { data: item, error } = await supabase.from('print_requests').select('id, photo_path').eq('id', id.toLowerCase()).maybeSingle();
    if (error) throw error;
    if (!item?.photo_path || item.photo_path !== `${id.toLowerCase()}.webp`) {
      return NextResponse.json({ error: 'Photo introuvable.' }, { status: 404, headers: noStore });
    }
    const { data: photo, error: downloadError } = await supabase.storage.from(PHOTO_BUCKET).download(item.photo_path);
    if (downloadError || !photo) throw downloadError || new Error('Photo unavailable');
    return new Response(await photo.arrayBuffer(), { headers: {
      ...noStore,
      'Content-Type': 'image/webp',
      'Content-Disposition': 'inline; filename="photo.webp"',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Referrer-Policy': 'no-referrer',
    } });
  } catch {
    console.error('Request photo could not be loaded.');
    return NextResponse.json({ error: 'Impossible de charger la photo.' }, { status: 503, headers: noStore });
  }
}
