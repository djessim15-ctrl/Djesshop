import { NextResponse } from 'next/server';
import { isAdmin, isSameOrigin } from '@/lib/admin';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getPushConfig, sendPush } from '@/lib/push';
import { isValidPushEndpoint, normalizePushSubscription } from '@/lib/push-subscription';
import type { PushSubscription } from 'web-push';
import { readJsonBody } from '@/lib/read-json';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  const config = getPushConfig();
  if (!config) return NextResponse.json({ error: 'Les notifications ne sont pas encore configurées.' }, { status: 503 });
  return NextResponse.json({ publicKey: config.publicKey }, { headers: { 'Cache-Control': 'no-store' } });
}

async function guard(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Requête non autorisée.' }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  return null;
}

async function parseBody(request: Request) {
  const result = await readJsonBody(request, 5000);
  if (result.error === 'too-large') return { response: NextResponse.json({ error: 'Requête trop volumineuse.' }, { status: 413 }) };
  if (result.error) return { response: NextResponse.json({ error: 'Requête invalide.' }, { status: 400 }) };
  return { value: result.value };
}

function endpointFrom(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const endpoint = (value as Record<string, unknown>).endpoint;
  return isValidPushEndpoint(endpoint) ? endpoint : null;
}

export async function PUT(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  if (!getPushConfig()) return NextResponse.json({ error: 'Les notifications ne sont pas encore configurées.' }, { status: 503 });
  const body = await parseBody(request); if (body.response) return body.response;
  const subscription = normalizePushSubscription(body.value);
  if (!subscription) return NextResponse.json({ error: 'Cet abonnement aux notifications est invalide.' }, { status: 400 });
  try {
    const { error } = await getSupabaseAdmin().from('admin_push_subscriptions').upsert({ endpoint: subscription.endpoint, subscription, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Impossible d’activer les notifications sur cet appareil.' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  const body = await parseBody(request); if (body.response) return body.response;
  const endpoint = endpointFrom(body.value);
  if (!endpoint) return NextResponse.json({ error: 'Abonnement invalide.' }, { status: 400 });
  try {
    const { error } = await getSupabaseAdmin().from('admin_push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Impossible de désactiver les notifications.' }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  const body = await parseBody(request); if (body.response) return body.response;
  const endpoint = endpointFrom(body.value);
  if (!endpoint) return NextResponse.json({ error: 'Abonnement invalide.' }, { status: 400 });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('admin_push_subscriptions').select('subscription').eq('endpoint', endpoint).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Réactive les notifications sur cet appareil.' }, { status: 404 });
    const result = await sendPush(data.subscription as PushSubscription, true);
    if (result === 'expired') {
      await supabase.from('admin_push_subscriptions').delete().eq('endpoint', endpoint);
      return NextResponse.json({ error: 'L’abonnement a expiré. Réactive les notifications.' }, { status: 410 });
    }
    if (result !== 'sent') return NextResponse.json({ error: 'L’envoi du test a échoué. Réessaie plus tard.' }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Impossible d’envoyer la notification de test.' }, { status: 503 });
  }
}
