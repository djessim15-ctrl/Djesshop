import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/client-ip';
import { MAX_PHOTO_REQUEST_BYTES, MAX_PHOTO_UPLOAD_BYTES, PHOTO_BUCKET, PHOTO_MIME_TYPES, PHOTO_REQUESTS_PER_HOUR } from '@/lib/photo-limits';
import { normalizePhoto } from '@/lib/photo-server';
import { readBodyBytes } from '@/lib/read-body';
import { readJsonBody } from '@/lib/read-json';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { validateRequest } from '@/lib/validation';
import { notifyAdmins } from '@/lib/push';

export const runtime = 'nodejs';

type Parsed = { payload: unknown; photo: File | null; error?: never } | { payload?: never; photo?: never; error: 'invalid' | 'too-large' };

/** Keep JSON clients working; accept one bounded multipart photo when provided. */
async function parseRequest(request: Request): Promise<Parsed> {
  const type = request.headers.get('content-type') || '';
  if (!/^multipart\/form-data(?:\s*;|$)/i.test(type)) {
    const parsed = await readJsonBody(request, 16_000);
    return parsed.error ? { error: parsed.error } : { payload: parsed.value, photo: null };
  }

  const body = await readBodyBytes(request, MAX_PHOTO_REQUEST_BYTES);
  if (body.error) return { error: body.error };
  try {
    // Parse a bounded copy rather than letting formData() buffer an unbounded stream.
    const parsed = await new Request(request.url, {
      method: 'POST', headers: { 'content-type': type }, body: body.bytes.buffer as ArrayBuffer,
    }).formData();
    const fields: Record<string, string> = {};
    const seen = new Set<string>();
    const allowed = new Set(['name', 'email', 'description', 'color', 'quantity', 'website', 'photo']);
    let photo: File | null = null;
    for (const [key, value] of parsed.entries()) {
      if (!allowed.has(key) || seen.has(key)) return { error: 'invalid' };
      seen.add(key);
      if (key === 'photo') {
        if (typeof value === 'string') return { error: 'invalid' };
        photo = value;
      } else {
        if (typeof value !== 'string') return { error: 'invalid' };
        fields[key] = value;
      }
    }
    return { payload: fields, photo };
  } catch {
    return { error: 'invalid' };
  }
}

export async function POST(request: Request) {
  // Explicitly opt-in, development-only visual preview. No real data is stored.
  const demo = process.env.NODE_ENV === 'development' && process.env.DEMO_MODE === 'true';
  if (!isSupabaseConfigured() && !demo) {
    return NextResponse.json({ error: 'Le formulaire n’est pas encore configuré. Réessayez plus tard.' }, { status: 503 });
  }

  const parsed = await parseRequest(request);
  if (parsed.error) return NextResponse.json({ error: parsed.error === 'too-large' ? 'La demande est trop volumineuse.' : 'La demande est invalide.' }, { status: parsed.error === 'too-large' ? 413 : 400 });
  const { payload, photo } = parsed;
  if (payload && typeof payload === 'object' && 'website' in payload && (payload as Record<string, unknown>).website) {
    // A honeypot field for basic bot filtering, without revealing it to bots.
    return NextResponse.json({ ok: true });
  }
  const validated = validateRequest(payload);
  if (validated.error) return NextResponse.json({ error: validated.error }, { status: 400 });
  if (photo && photo.size > MAX_PHOTO_UPLOAD_BYTES) return NextResponse.json({ error: 'La photo est trop volumineuse. Choisissez une autre image.' }, { status: 413 });
  if (photo && (!photo.size || !PHOTO_MIME_TYPES.includes(photo.type.toLowerCase() as typeof PHOTO_MIME_TYPES[number]))) {
    return NextResponse.json({ error: 'Choisissez une photo JPG, PNG ou WebP valide.' }, { status: 400 });
  }

  const ip = demo ? null : getClientIp(request.headers);
  if (!demo && !ip) return NextResponse.json({ error: 'Impossible de vérifier votre connexion. Réessayez plus tard.' }, { status: 503 });
  let supabase: ReturnType<typeof getSupabaseAdmin> | null = null;
  let uploadedPath: string | null = null;
  let saved = false;
  try {
    supabase = demo ? null : getSupabaseAdmin();
    if (supabase) {
      const { data: blocked, error: checkError } = await supabase.from('blocked_ips').select('id').eq('ip', ip!).limit(1);
      if (checkError) throw checkError;
      if (blocked?.length) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
      if (photo) {
        // A modest per-IP limit protects the finite private storage. Requests
        // without photos keep their existing behavior.
        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count, error } = await supabase.from('print_requests').select('id', { count: 'exact', head: true }).eq('ip', ip!).gte('created_at', since).not('photo_path', 'is', null);
        if (error || count === null) throw error || new Error('Photo count unavailable');
        if (count >= PHOTO_REQUESTS_PER_HOUR) return NextResponse.json({ error: 'Trop de photos envoyées depuis cette connexion. Réessayez dans une heure.' }, { status: 429 });
      }
    }

    let image: Buffer | null = null;
    if (photo) {
      try { image = await normalizePhoto(photo); }
      catch { return NextResponse.json({ error: 'Impossible de lire cette photo. Choisissez une image JPG, PNG ou WebP valide.' }, { status: 400 }); }
    }
    if (demo) return NextResponse.json({ ok: true, demo: true }, { status: 201 });
    if (!supabase || !ip) throw new Error('Storage unavailable');

    const id = randomUUID();
    if (image) {
      uploadedPath = `${id}.webp`;
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(uploadedPath, image, { contentType: 'image/webp', cacheControl: '0', upsert: false });
      if (error) throw error;
    }
    const { error } = await supabase.from('print_requests').insert({ ...validated.data, id, ip, ...(uploadedPath ? { photo_path: uploadedPath } : {}) });
    if (error) throw error;
    saved = true;
    // Await delivery attempts in serverless runtimes, but do not fail the saved request.
    try { await notifyAdmins(); } catch { console.error('Push notifications could not be dispatched.'); }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    if (supabase && uploadedPath && !saved) {
      try {
        const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([uploadedPath]);
        if (error) console.error('Could not clean up an unsaved request photo.');
      } catch { console.error('Could not clean up an unsaved request photo.'); }
    }
    console.error('Request could not be saved.');
    return NextResponse.json({ error: 'L’envoi a échoué. Veuillez réessayer dans quelques instants.' }, { status: 503 });
  }
}
