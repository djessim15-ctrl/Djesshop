import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

// Next initializes this global in its server runtime; provide it in the Node test runner.
(globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;
const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external') as typeof import('next/dist/server/app-render/work-async-storage.external');
const { workUnitAsyncStorage } = require('next/dist/server/app-render/work-unit-async-storage.external') as typeof import('next/dist/server/app-render/work-unit-async-storage.external');
const { GET: getPhoto } = require('../app/api/admin/request-photo/route') as typeof import('../app/api/admin/request-photo/route');
const { DELETE: deleteRequest } = require('../app/api/admin/requests/route') as typeof import('../app/api/admin/requests/route');

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const id = '8c88d8cc-e94f-4b29-87b2-f2a3d23f2830';

type MockOptions = { photoPath?: string | null; missing?: boolean; deleteFails?: boolean; userEmail?: string };

// Supply the same request-local cookie store that Next's cookies() reads.
function withSession<T>(token: string | null, action: () => Promise<T>): Promise<T> {
  const cookieStore = { get: (name: string) => name === 'djesshop_admin' && token ? { name, value: token } : undefined };
  return workAsyncStorage.run({ route: '/api/admin' } as never, () =>
    workUnitAsyncStorage.run({ type: 'request', phase: 'render', cookies: cookieStore } as never, action));
}

function setup(options: MockOptions = {}) {
  process.env = { ...originalEnv, NODE_ENV: 'test', SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test', ADMIN_EMAIL: 'admin@example.fr' };
  const calls: { method: string; url: string; body?: unknown }[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input), method = init.method || 'GET';
    calls.push({ method, url, body: init.body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/auth/v1/user')) return json({ id: 'user', email: options.userEmail || 'admin@example.fr', aud: 'authenticated', app_metadata: {}, user_metadata: {} });
    if (url.includes('/rest/v1/print_requests') && method === 'GET') return json(options.missing ? [] : [{ id, photo_path: options.photoPath === undefined ? `${id}.webp` : options.photoPath }]);
    if (url.includes('/storage/v1/object/request-photos/') && method === 'GET') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
    if (url.endsWith('/storage/v1/object/request-photos') && method === 'DELETE') return options.deleteFails ? json({ message: 'storage unavailable' }, 500) : json([]);
    if (url.includes('/rest/v1/print_requests') && method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  };
  return calls;
}
function photoRequest(value = id) { return new Request(`https://shop.example/api/admin/request-photo?id=${value}`); }
function deletion(origin = 'https://shop.example') {
  return new Request('https://shop.example/api/admin/requests', { method: 'DELETE', headers: { 'content-type': 'application/json', host: 'shop.example', origin }, body: JSON.stringify({ id }) });
}

test('la photo exige une session administrateur et ne peut pas être mise en cache', async () => {
  let calls = setup();
  let response = await withSession(null, () => getPhoto(photoRequest()));
  assert.equal(response.status, 401); assert.equal(calls.length, 0);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  calls = setup({ userEmail: 'autre@example.fr' });
  response = await withSession('token', () => getPhoto(photoRequest()));
  assert.equal(response.status, 401);
  assert.ok(calls.every((call) => !call.url.includes('/storage/')));
  calls = setup();
  response = await withSession('token', () => getPhoto(photoRequest()));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.ok(calls.some((call) => call.url.endsWith(`/request-photos/${id}.webp`)));
});

test('aucune photo ne peut pointer vers un autre objet ni être lue avec un identifiant invalide', async () => {
  let calls = setup({ photoPath: 'autre-client.webp' });
  let response = await withSession('token', () => getPhoto(photoRequest()));
  assert.equal(response.status, 404); assert.ok(!calls.some((call) => call.url.includes('/storage/')));
  calls = setup();
  response = await withSession('token', () => getPhoto(photoRequest('bad-id')));
  assert.equal(response.status, 400); assert.ok(!calls.some((call) => call.url.includes('/rest/v1/')));
});

test('la suppression reste protégée contre CSRF et refuse un chemin de photo étranger', async () => {
  let calls = setup();
  let response = await withSession('token', () => deleteRequest(deletion('https://attacker.example')));
  assert.equal(response.status, 403); assert.equal(calls.length, 0);
  calls = setup();
  response = await withSession(null, () => deleteRequest(deletion()));
  assert.equal(response.status, 401); assert.equal(calls.length, 0);
  calls = setup({ photoPath: 'autre-client.webp' });
  response = await withSession('token', () => deleteRequest(deletion()));
  assert.equal(response.status, 503);
  assert.ok(!calls.some((call) => call.url.includes('/storage/') || (call.url.includes('/rest/v1/') && call.method === 'DELETE')));
});

test('la photo est supprimée avant la demande ; en cas d’échec la demande reste intacte', async () => {
  let calls = setup({ deleteFails: true });
  let response = await withSession('token', () => deleteRequest(deletion()));
  assert.equal(response.status, 503);
  assert.ok(calls.some((call) => call.method === 'DELETE' && call.url.includes('/storage/')));
  assert.ok(!calls.some((call) => call.method === 'DELETE' && call.url.includes('/rest/v1/')));
  calls = setup();
  response = await withSession('token', () => deleteRequest(deletion()));
  assert.equal(response.status, 200);
  const storageIndex = calls.findIndex((call) => call.method === 'DELETE' && call.url.includes('/storage/'));
  const dbIndex = calls.findIndex((call) => call.method === 'DELETE' && call.url.includes('/rest/v1/'));
  assert.ok(storageIndex >= 0 && dbIndex > storageIndex);
  assert.deepEqual(JSON.parse(String(calls[storageIndex].body)), { prefixes: [`${id}.webp`] });
  calls = setup({ photoPath: null });
  response = await withSession('token', () => deleteRequest(deletion()));
  assert.equal(response.status, 200);
  assert.ok(!calls.some((call) => call.url.includes('/storage/')));
});

test.after(() => { process.env = originalEnv; globalThis.fetch = originalFetch; });
