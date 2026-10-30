import webpush, { type PushSubscription } from 'web-push';
import { getSupabaseAdmin } from './supabase';
import { normalizePushSubscription } from './push-subscription';

export function getPushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

type PushResult = 'sent' | 'expired' | 'failed';

/** Do not put customer information in a notification shown on a lock screen. */
export async function sendPush(subscription: PushSubscription, test = false): Promise<PushResult> {
  const vapidDetails = getPushConfig();
  const safeSubscription = normalizePushSubscription(subscription);
  if (!vapidDetails || !safeSubscription) return 'failed';
  const payload = JSON.stringify({
    title: test ? 'Notifications activées ✨' : 'Nouvelle demande sur Djesshop ✨',
    body: test ? 'Ton appareil est prêt à recevoir les nouvelles demandes.' : 'Un nouveau projet t’attend dans ton espace administration.',
    tag: test ? 'djesshop-test' : 'djesshop-nouvelle-demande',
  });
  try {
    await webpush.sendNotification(safeSubscription, payload, { vapidDetails, TTL: 60 * 60 * 24, timeout: 6000, urgency: 'normal' });
    return 'sent';
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    return status === 404 || status === 410 ? 'expired' : 'failed';
  }
}

/** A failed notification never discards an already-saved customer request. */
export async function notifyAdmins() {
  if (!getPushConfig()) return;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('admin_push_subscriptions').select('id, subscription');
    if (error) throw error;
    await Promise.all((data || []).map(async (row) => {
      const result = await sendPush(row.subscription as PushSubscription);
      if (result === 'expired') await supabase.from('admin_push_subscriptions').delete().eq('id', row.id);
    }));
  } catch {
    // Never log endpoint URLs or encryption keys; the request itself is safe in the database.
    console.error('Push notifications could not be dispatched.');
  }
}
