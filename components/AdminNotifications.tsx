'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Send } from 'lucide-react';

type PushState = 'loading' | 'unsupported' | 'unavailable' | 'denied' | 'inactive' | 'active';

type Props = { pendingCount: number; onViewRequests: () => void };

function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function usesKey(subscription: PushSubscription, publicKey: string) {
  const existing = subscription.options.applicationServerKey;
  if (!existing) return false;
  const a = new Uint8Array(existing);
  const b = applicationKey(publicKey);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

async function responseMessage(response: Response, fallback: string) {
  try { const data = await response.json(); return data.error || fallback; } catch { return fallback; }
}

export default function AdminNotifications({ pendingCount, onViewRequests }: Props) {
  const [state, setState] = useState<PushState>('loading');
  const [publicKey, setPublicKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    async function inspect() {
      const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      // iOS Web Push is only available to a Home Screen web app, not a Safari tab.
      if (ios && !installed) { if (alive) setState('unsupported'); return; }
      if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (alive) setState('unsupported');
        return;
      }
      try {
        const configResponse = await fetch('/api/admin/push-subscriptions', { cache: 'no-store' });
        if (!configResponse.ok) throw new Error('Les notifications ne sont pas encore configurées.');
        const config = await configResponse.json();
        if (typeof config.publicKey !== 'string' || !config.publicKey) throw new Error('Configuration indisponible.');
        if (!alive) return;
        setPublicKey(config.publicKey);
        if (Notification.permission === 'denied') { setState('denied'); return; }
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (!alive) return;
        if (!subscription || !usesKey(subscription, config.publicKey)) { setState('inactive'); return; }
        // Refresh the server record if the device was already subscribed.
        const sync = await fetch('/api/admin/push-subscriptions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) });
        if (!sync.ok) throw new Error(await responseMessage(sync, 'Impossible de synchroniser les notifications.'));
        if (alive) setState('active');
      } catch (error) {
        if (alive) { setState('unavailable'); setFeedback(error instanceof Error ? error.message : 'Notifications indisponibles.'); setFailed(true); }
      }
    }
    void inspect();
    return () => { alive = false; };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true); setFeedback(''); setFailed(false);
    try {
      // The permission request must happen directly after the user's click.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'inactive');
        throw new Error('Autorise les notifications dans ton navigateur pour les recevoir.');
      }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !usesKey(subscription, publicKey)) {
        const remove = await fetch('/api/admin/push-subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!remove.ok) throw new Error(await responseMessage(remove, 'Impossible de renouveler cet abonnement.'));
        if (!await subscription.unsubscribe()) throw new Error('Impossible de renouveler cet abonnement sur cet appareil.');
        subscription = null;
      }
      let created = false;
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(publicKey) });
        created = true;
      }
      try {
        const save = await fetch('/api/admin/push-subscriptions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) });
        if (!save.ok) throw new Error(await responseMessage(save, 'Impossible d’activer les notifications.'));
      } catch (error) {
        if (created) await subscription.unsubscribe();
        throw error;
      }
      setState('active');
      setFeedback('Notifications activées sur cet appareil. Tu peux envoyer un test.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Impossible d’activer les notifications.');
      setFailed(true);
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setFeedback(''); setFailed(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch('/api/admin/push-subscriptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error(await responseMessage(response, 'Impossible de désactiver les notifications.'));
        if (!await subscription.unsubscribe()) throw new Error('Impossible de désactiver les notifications sur cet appareil.');
      }
      setState('inactive');
      setFeedback('Notifications désactivées sur cet appareil.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Impossible de désactiver les notifications.'); setFailed(true); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setFeedback(''); setFailed(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) { setState('inactive'); throw new Error('Réactive les notifications sur cet appareil.'); }
      const response = await fetch('/api/admin/push-subscriptions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      if (!response.ok) {
        if (response.status === 410) { await subscription.unsubscribe(); setState('inactive'); }
        if (response.status === 404) setState('inactive');
        throw new Error(await responseMessage(response, 'Impossible d’envoyer le test.'));
      }
      setFeedback('Notification de test envoyée. Vérifie les alertes de ton appareil.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Impossible d’envoyer le test.'); setFailed(true); }
    finally { setBusy(false); }
  }

  const title = pendingCount ? `${pendingCount} ${pendingCount > 1 ? 'demandes en attente' : 'demande en attente'}` : 'Aucune nouvelle demande';
  const detail = state === 'active'
    ? 'Les alertes sont activées sur cet appareil, même si l’administration est fermée.'
    : state === 'denied'
      ? 'Les notifications sont bloquées : autorise-les dans les réglages de ton navigateur.'
      : state === 'unsupported'
        ? 'Notifications indisponibles ici. Sur iPhone, ajoute l’administration à l’écran d’accueil et ouvre-la depuis son icône.'
        : state === 'unavailable'
          ? 'Les alertes sur appareil sont momentanément indisponibles.'
          : 'Active les alertes pour être prévenu lorsqu’un client envoie une demande.';

  return <section className="admin-notifications" aria-label="Notifications de l’administration">
    <div className="notification-summary">
      <div className="notification-bell" aria-hidden="true">{state === 'active' ? <BellRing size={21} /> : state === 'denied' ? <BellOff size={21} /> : <Bell size={21} />}{pendingCount > 0 && <span>{pendingCount > 99 ? '99+' : pendingCount}</span>}</div>
      <div className="notification-copy"><strong aria-live="polite" aria-atomic="true">{title}</strong><p>{detail}</p></div>
    </div>
    <div className="notification-buttons">
      {pendingCount > 0 && <button type="button" className="small-button notification-view" onClick={onViewRequests}>Voir les demandes</button>}
      {state === 'active' ? <><button type="button" className="small-button" disabled={busy} onClick={() => void test()}><Send size={14} /> Tester</button><button type="button" className="small-button" disabled={busy} onClick={() => void disable()}><BellOff size={14} /> Désactiver</button></> : state === 'inactive' ? <button type="button" className="small-button notification-enable" disabled={busy} onClick={() => void enable()}><Bell size={14} /> {busy ? 'Activation…' : 'Activer les alertes'}</button> : null}
    </div>
    {feedback && <p className={`notification-feedback ${failed ? 'error' : ''}`} role="status">{feedback}</p>}
  </section>;
}
