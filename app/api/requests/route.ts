import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/client-ip';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { validateRequest } from '@/lib/validation';
import { notifyAdmins } from '@/lib/push';

export async function POST(request: Request) {
  // Explicitly opt-in, development-only visual preview. No real data is stored.
  const demo = process.env.NODE_ENV === 'development' && process.env.DEMO_MODE === 'true';
  if (!isSupabaseConfigured() && !demo) {
    return NextResponse.json({ error: 'Le formulaire n’est pas encore configuré. Réessayez plus tard.' }, { status: 503 });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 16_000) return NextResponse.json({ error: 'La demande est trop volumineuse.' }, { status: 413 });
  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > 16_000) return NextResponse.json({ error: 'La demande est trop volumineuse.' }, { status: 413 });
    payload = JSON.parse(text);
  } catch { return NextResponse.json({ error: 'La demande est invalide.' }, { status: 400 }); }
  if (payload && typeof payload === 'object' && 'website' in payload && (payload as Record<string, unknown>).website) {
    // A honeypot field for basic bot filtering, without revealing it to bots.
    return NextResponse.json({ ok: true });
  }
  const validated = validateRequest(payload);
  if (validated.error) return NextResponse.json({ error: validated.error }, { status: 400 });
  if (demo) return NextResponse.json({ ok: true, demo: true }, { status: 201 });
  const ip = getClientIp(request.headers);
  if (!ip) return NextResponse.json({ error: 'Impossible de vérifier votre connexion. Réessayez plus tard.' }, { status: 503 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: blocked, error: checkError } = await supabase.from('blocked_ips').select('id').eq('ip', ip).limit(1);
    if (checkError) throw checkError;
    if (blocked?.length) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    const { error } = await supabase.from('print_requests').insert({ ...validated.data, ip });
    if (error) throw error;
    // Await delivery attempts in serverless runtimes, but do not fail the saved request.
    await notifyAdmins();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Request could not be saved:', error);
    return NextResponse.json({ error: 'L’envoi a échoué. Veuillez réessayer dans quelques instants.' }, { status: 503 });
  }
}
