import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { isValidPushEndpoint, normalizePushSubscription } from '../lib/push-subscription';
import { readJsonBody } from '../lib/read-json';
import { getPushConfig, notifyAdmins, sendPush } from '../lib/push';
import { POST as submitRequest } from '../app/api/requests/route';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalSend = webpush.sendNotification;
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const keys = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys };
function reset() { process.env = { ...originalEnv, NODE_ENV: 'test' }; globalThis.fetch = originalFetch; webpush.sendNotification = originalSend; }
function configure() { process.env.VAPID_PUBLIC_KEY = 'public-test'; process.env.VAPID_PRIVATE_KEY = 'private-test'; process.env.VAPID_SUBJECT = 'mailto:admin@example.com'; }
function jsonRequest(body: string, headers: Record<string, string> = {}) { return new Request('https://shop.example/api', { method: 'PUT', headers, body }); }

test('les seuls points de terminaison acceptés sont les services push HTTPS reconnus', () => {
  reset();
  for (const endpoint of [subscription.endpoint, 'https://updates.push.services.mozilla.com/wpush/test', 'https://web.push.apple.com/test', 'https://db5.notify.windows.com/test']) assert.equal(isValidPushEndpoint(endpoint), true, endpoint);
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://fcm.googleapis.com.evil.example/test', 'https://fcm.googleapis.com@evil.example/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com:8443/test', 'https://fcm.googleapis.com/test#fragment', 'not a url', '', 'x'.repeat(2049)]) assert.equal(isValidPushEndpoint(endpoint), false, endpoint);
});

test('un abonnement est validé et dépouillé des champs superflus', () => {
  reset();
  assert.deepEqual(normalizePushSubscription({ ...subscription, expirationTime: null, extra: 'ignore', keys: { ...keys, extra: 'ignore' } }), subscription);
  for (const bad of [null, {}, { ...subscription, endpoint: 'https://localhost/' }, { ...subscription, keys: { ...keys, p256dh: 'invalid' } }, { ...subscription, keys: { ...keys, auth: keys.auth + '=' } }, { ...subscription, keys: { ...keys, auth: 'x' } }, { ...subscription, keys: null }]) assert.equal(normalizePushSubscription(bad), null);
});

test('les corps JSON sont limités en octets même sans Content-Length', async () => {
  reset();
  assert.deepEqual(await readJsonBody(jsonRequest('{"ok":true}'), 100), { value: { ok: true } });
  assert.deepEqual(await readJsonBody(jsonRequest('not json'), 100), { error: 'invalid' });
  assert.deepEqual(await readJsonBody(jsonRequest('{}', { 'content-length': '6000' }), 5000), { error: 'too-large' });
  assert.deepEqual(await readJsonBody(jsonRequest(JSON.stringify({ data: 'a'.repeat(6000) })), 5000), { error: 'too-large' });
  assert.deepEqual(await readJsonBody(jsonRequest(JSON.stringify({ data: 'éé' })), 14), { error: 'too-large' }); // 15 UTF-8 bytes
  assert.deepEqual(await readJsonBody(new Request('https://shop.example/api', { method: 'PUT' }), 100), { error: 'invalid' });
});

test('les alertes sont génériques et les abonnements invalides ne sont jamais utilisés', async () => {
  reset(); configure();
  const sent: { endpoint: string; payload: string; timeout: number | undefined }[] = [];
  webpush.sendNotification = async (sub, payload, options) => {
    sent.push({ endpoint: sub.endpoint, payload: String(payload), timeout: options?.timeout });
    return { statusCode: 201, body: '', headers: {} };
  };
  assert.equal(await sendPush(subscription), 'sent');
  assert.equal(await sendPush(subscription, true), 'sent');
  assert.equal(sent[0].timeout, 6000);
  assert.match(sent[0].payload, /Nouvelle demande sur Djesshop/);
  assert.match(sent[1].payload, /Notifications activées/);
  assert.doesNotMatch(sent[0].payload, /camille|email|adresse|192\.0\.2\.10/i);
  assert.equal(await sendPush({ ...subscription, endpoint: 'https://localhost/secret' }), 'failed');
  assert.equal(sent.length, 2);
  delete process.env.VAPID_PRIVATE_KEY;
  assert.equal(getPushConfig(), null);
  assert.equal(await sendPush(subscription), 'failed');
  assert.equal(sent.length, 2);
});

test('le message push est chiffré et signé avec une vraie paire VAPID', async () => {
  reset();
  const vapid = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:admin@example.com';
  webpush.sendNotification = async (sub, payload, options) => {
    assert.ok(payload != null);
    const request = webpush.generateRequestDetails(sub, payload, options);
    assert.equal(request.endpoint, subscription.endpoint);
    assert.equal(request.method, 'POST');
    assert.ok(request.body && request.body.length > 0);
    assert.match(JSON.stringify(request.headers).toLowerCase(), /authorization/);
    assert.doesNotMatch(request.body!.toString('utf8'), /nouvelle demande/i);
    return { statusCode: 201, body: '', headers: {} };
  };
  assert.equal(await sendPush(subscription), 'sent');
});

test('les abonnements expirés sont supprimés, les autres erreurs restent sans effet', async () => {
  reset(); configure(); process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-test';
  const deletes: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === 'DELETE') { deletes.push(url); return new Response(null, { status: 204 }); }
    return new Response(JSON.stringify([
      { id: 'expired-id', subscription: { ...subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/expired' } },
      { id: 'failed-id', subscription: { ...subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/failed' } },
      { id: 'ok-id', subscription },
    ]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  webpush.sendNotification = async (sub) => {
    if (sub.endpoint.endsWith('/expired')) throw { statusCode: 410 };
    if (sub.endpoint.endsWith('/failed')) throw new Error('offline');
    return { statusCode: 201, body: '', headers: {} };
  };
  await notifyAdmins();
  assert.equal(deletes.length, 1);
  assert.match(deletes[0], /expired-id/);
});

test('une panne des notifications ne fait jamais échouer une demande enregistrée', async () => {
  reset(); configure(); process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-test'; process.env.TRUSTED_PROXY = 'forwarded';
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(`${init?.method || 'GET'} ${url}`);
    if (url.includes('blocked_ips')) return Response.json([]);
    if (url.includes('print_requests')) return new Response(null, { status: 201 });
    if (url.includes('admin_push_subscriptions')) return Response.json([{ id: 'one', subscription }]);
    throw new Error(`Unexpected request: ${url}`);
  };
  webpush.sendNotification = async () => { throw new Error('push service down'); };
  const response = await submitRequest(new Request('https://shop.example/api/requests', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.10' },
    body: JSON.stringify({ name: 'Camille', email: 'camille@example.fr', description: 'Un pot à crayons personnalisé', color: 'Rose', quantity: 1 }),
  }));
  assert.equal(response.status, 201);
  assert.ok(calls.some((call) => call.includes('print_requests')));
  assert.ok(calls.some((call) => call.includes('admin_push_subscriptions')));
});

test.after(() => { process.env = originalEnv; globalThis.fetch = originalFetch; webpush.sendNotification = originalSend; });
