import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { COLORS } from '../lib/colors';
import { normalizeIp, getClientIp } from '../lib/client-ip';
import { validateRequest } from '../lib/validation';
import { isSameOrigin } from '../lib/admin';
import { POST as submitRequest } from '../app/api/requests/route';
import { proxy } from '../proxy';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const good = { name: 'Camille', email: 'Camille@Example.fr', description: 'Un petit pot à crayons personnalisé', color: 'Rose', quantity: 2 };
function reset() { process.env = { ...originalEnv, NODE_ENV: 'test' }; globalThis.fetch = originalFetch; }
function request(body: unknown, ip = '192.0.2.10') {
  return new Request('https://shop.example/api/requests', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
}

// All of these operate sequentially because process.env and global fetch are shared.
test('les sept couleurs demandées sont acceptées, les autres refusées', () => {
  reset();
  assert.deepEqual(COLORS.map((c) => c.name), ['Noir', 'Gris', 'Rouge', 'Rose', 'Jaune', 'Bleu', 'Vert']);
  for (const color of COLORS) assert.ok(validateRequest({ ...good, color: color.name }).data);
  assert.ok(validateRequest({ ...good, color: 'Violet' }).error);
  assert.equal(validateRequest(good).data?.email, 'camille@example.fr');
  assert.ok(validateRequest({ ...good, description: 'court' }).error);
  assert.ok(validateRequest({ ...good, quantity: 0 }).error);
});

test('les IP sont normalisées sans accepter de plages ou de listes', () => {
  reset();
  assert.equal(normalizeIp('::ffff:192.0.2.10'), '192.0.2.10');
  assert.equal(normalizeIp('2001:db8::1'), '2001:db8::1');
  assert.equal(normalizeIp('192.0.2.0/24'), null);
  assert.equal(normalizeIp('192.0.2.1, 192.0.2.2'), null);
  assert.equal(normalizeIp('bonjour'), null);
});

test('seuls les en-têtes d’un proxy explicitement fiable sont utilisés', () => {
  reset();
  const headers = new Headers({ 'x-forwarded-for': '192.0.2.10', 'x-vercel-forwarded-for': '2001:db8::1' });
  assert.equal(getClientIp(headers), null);
  process.env.TRUSTED_PROXY = 'forwarded';
  assert.equal(getClientIp(headers), '192.0.2.10');
  process.env.VERCEL = '1';
  assert.equal(getClientIp(headers), '2001:db8::1');
  assert.equal(getClientIp(new Headers({ 'x-forwarded-for': '192.0.2.10' })), null);
});

test('la protection CSRF compare le vrai hôte demandé, même derrière un proxy', () => {
  reset();
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  const make = (origin: string, host = 'localhost:3001', protocol = 'http') => new Request('http://0.0.0.0:3001/api/admin/session', { headers: { origin, host, 'x-forwarded-proto': protocol } });
  assert.equal(isSameOrigin(make('http://localhost:3001')), true);
  assert.equal(isSameOrigin(make('http://attacker.example')), false);
  assert.equal(isSameOrigin(make('https://localhost:3001')), false);
  assert.equal(isSameOrigin(make('http://localhost:3001', 'localhost:3001,attacker.example')), false);
  assert.equal(isSameOrigin(new Request('http://0.0.0.0:3001/api/admin/session', { headers: { host: 'localhost:3001' } })), false);
});

test('aucune demande réelle ne réussit sans Supabase, le mode aperçu est explicite', async () => {
  reset();
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await submitRequest(request(good))).status, 503);
  process.env.DEMO_MODE = 'true';
  assert.equal((await submitRequest(request(good))).status, 503); // pas de démo en production/test
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  const demo = await submitRequest(request(good));
  assert.equal(demo.status, 201); assert.equal((await demo.json()).demo, true);
  assert.equal((await submitRequest(request({ ...good, color: 'Violet' }))).status, 400);
});

test('une IP bloquée ne peut pas créer de demande', async () => {
  reset(); process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-test'; process.env.TRUSTED_PROXY = 'forwarded';
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); paths.push(url);
    return new Response(JSON.stringify([{ id: 'blocked' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const response = await submitRequest(request(good));
  assert.equal(response.status, 403);
  assert.equal(paths.length, 1);
  assert.ok(paths[0].includes('/blocked_ips'));
});

test('une demande autorisée est validée puis enregistrée côté serveur', async () => {
  reset(); process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-test'; process.env.TRUSTED_PROXY = 'forwarded';
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(String(input).includes('blocked_ips') ? [] : null), { status: String(input).includes('blocked_ips') ? 200 : 201, headers: { 'content-type': 'application/json' } });
  };
  const response = await submitRequest(request(good));
  assert.equal(response.status, 201); assert.equal(calls.length, 2);
  const inserted = JSON.parse(String(calls[1].init?.body));
  assert.equal(inserted.ip, '192.0.2.10'); assert.equal(inserted.color, 'Rose'); assert.equal(inserted.email, 'camille@example.fr');
});

test('le filtre interdit l’accès au site et échoue fermé en cas d’erreur', async () => {
  reset(); process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-test'; process.env.TRUSTED_PROXY = 'forwarded';
  const publicPage = () => new NextRequest('https://shop.example/', { headers: { 'x-forwarded-for': '192.0.2.10' } });
  globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'blocked' }]), { status: 200, headers: { 'content-type': 'application/json' } });
  assert.equal((await proxy(publicPage())).status, 403);
  globalThis.fetch = async () => new Response('error', { status: 500 });
  assert.equal((await proxy(publicPage())).status, 503);
  // Moderation is still reachable in order to undo an accidental self-block.
  assert.equal((await proxy(new NextRequest('https://shop.example/admin'))).headers.get('x-middleware-next'), '1');
  delete process.env.SUPABASE_URL;
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  assert.equal((await proxy(publicPage())).status, 503);
});

test.after(() => { process.env = originalEnv; globalThis.fetch = originalFetch; });
