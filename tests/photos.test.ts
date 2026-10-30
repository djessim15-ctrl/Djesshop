import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { POST as submitRequest } from '../app/api/requests/route';
import { normalizePhoto } from '../lib/photo-server';
import { MAX_PHOTO_REQUEST_BYTES, MAX_PHOTO_UPLOAD_BYTES, PHOTO_REQUESTS_PER_HOUR } from '../lib/photo-limits';
import { readBodyBytes } from '../lib/read-body';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const fields = { name: 'Camille', email: 'camille@example.fr', description: 'Un support de téléphone personnalisé', color: 'Bleu', quantity: '1', website: '' };

type Options = { blocked?: boolean; count?: number; uploadFails?: boolean; insertFails?: boolean };
type Call = { url: string; method: string; body?: unknown };

function mockSupabase(options: Options = {}) {
  process.env = { ...originalEnv, NODE_ENV: 'test', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'server-test', TRUSTED_PROXY: 'forwarded' };
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT;
  const calls: Call[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    calls.push({ url, method, body: init.body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('/rest/v1/blocked_ips')) return json(options.blocked ? [{ id: 'blocked' }] : []);
    if (url.includes('/rest/v1/print_requests') && method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `*/${options.count ?? 0}` } });
    if (url.includes('/storage/v1/object/request-photos/') && method === 'POST') return options.uploadFails ? json({ message: 'storage unavailable' }, 500) : json({ Id: 'object', Key: 'request-photos/test.webp' });
    if (url.includes('/storage/v1/object/request-photos') && method === 'DELETE') return json([]);
    if (url.includes('/rest/v1/print_requests') && method === 'POST') return options.insertFails ? json({ message: 'database unavailable' }, 500) : new Response(null, { status: 201 });
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  };
  return calls;
}

function requestWithPhoto(bytes: Uint8Array, type = 'image/jpeg', extraPhoto = false) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  data.append('photo', new Blob([new Uint8Array(bytes)], { type }), 'private-name.jpg');
  if (extraPhoto) data.append('photo', new Blob([new Uint8Array(bytes)], { type }), 'extra.jpg');
  return new Request('https://shop.example/api/requests', { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.10' }, body: data });
}

async function jpgWithExif() {
  return sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#4488ff' } })
    .jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Artist: 'information privée' } } }).toBuffer();
}

test('les photos sont décodées, redimensionnées et réencodées sans EXIF', async () => {
  const input = await jpgWithExif();
  assert.ok((await sharp(input).metadata()).exif);
  const output = await normalizePhoto(new Blob([new Uint8Array(input)], { type: 'image/jpeg' }));
  const result = await sharp(output).metadata();
  assert.equal(result.format, 'webp');
  assert.equal(result.exif, undefined);
  assert.equal(result.orientation, undefined);
  assert.equal(Math.max(result.width!, result.height!), 1800);
  assert.ok(result.height! > result.width!); // orientation EXIF appliquée avant suppression
  await assert.rejects(normalizePhoto(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/png' })));
  await assert.rejects(normalizePhoto(new Blob(['not an image'], { type: 'image/jpeg' })));
  await assert.rejects(normalizePhoto(new Blob(['anything'], { type: 'application/pdf' })));
});

test('PNG et WebP sont acceptés, le mode aperçu valide sans rien stocker', async () => {
  const input = await sharp({ create: { width: 12, height: 8, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png().toBuffer();
  const converted = await normalizePhoto(new Blob([new Uint8Array(input)], { type: 'image/png' }));
  assert.equal((await sharp(converted).metadata()).hasAlpha, true);
  assert.equal((await sharp(await normalizePhoto(new Blob([new Uint8Array(converted)], { type: 'image/webp' }))).metadata()).format, 'webp');
  process.env = { ...originalEnv, NODE_ENV: 'development', DEMO_MODE: 'true' };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.fetch = async () => { throw new Error('Le mode aperçu ne doit rien enregistrer'); };
  const response = await submitRequest(requestWithPhoto(input, 'image/png'));
  assert.equal(response.status, 201); assert.equal((await response.json()).demo, true);
});

test('un formulaire multipart sans photo conserve le parcours normal', async () => {
  const calls = mockSupabase();
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  const response = await submitRequest(new Request('https://shop.example/api/requests', { method: 'POST', headers: { 'x-forwarded-for': '192.0.2.10' }, body: data }));
  assert.equal(response.status, 201);
  assert.ok(!calls.some((call) => call.url.includes('/storage/')));
  const insert = calls.find((call) => call.url.includes('/rest/v1/print_requests') && call.method === 'POST');
  assert.equal(JSON.parse(String(insert?.body)).photo_path, undefined);
});

test('le corps est limité même sans Content-Length fiable', async () => {
  const request = new Request('https://shop.example/', { method: 'POST', headers: { 'content-length': '1' }, body: new Blob([new Uint8Array(100)]) });
  assert.equal((await readBodyBytes(request, 99)).error, 'too-large');
  const large = new Request('https://shop.example/', { method: 'POST', body: new Blob([new Uint8Array(MAX_PHOTO_REQUEST_BYTES + 1)]) });
  assert.equal((await readBodyBytes(large, MAX_PHOTO_REQUEST_BYTES)).error, 'too-large');
});

test('une demande avec photo stocke uniquement un WebP privé lié à son identifiant', async () => {
  const calls = mockSupabase();
  const response = await submitRequest(requestWithPhoto(await jpgWithExif()));
  assert.equal(response.status, 201);
  const upload = calls.find((call) => call.url.includes('/storage/v1/object/request-photos/') && call.method === 'POST');
  const insert = calls.find((call) => call.url.includes('/rest/v1/print_requests') && call.method === 'POST');
  assert.ok(upload); assert.ok(insert);
  const saved = JSON.parse(String(insert.body));
  assert.match(saved.id, /^[0-9a-f-]{36}$/);
  assert.equal(saved.photo_path, `${saved.id}.webp`);
  assert.equal(saved.ip, '192.0.2.10');
  assert.ok(upload.url.endsWith(`/request-photos/${saved.photo_path}`));
  assert.ok(!upload.url.includes('private-name'));
  const photo = Buffer.from(upload.body as Uint8Array);
  const metadata = await sharp(photo).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.exif, undefined);
});

test('les formats usurpés, les doublons et les photos trop volumineuses sont refusés', async () => {
  let calls = mockSupabase();
  let response = await submitRequest(requestWithPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'));
  assert.equal(response.status, 400);
  assert.ok(!calls.some((call) => call.url.includes('/storage/')));
  calls = mockSupabase();
  response = await submitRequest(requestWithPhoto(await jpgWithExif(), 'image/jpeg', true));
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
  calls = mockSupabase();
  response = await submitRequest(requestWithPhoto(new Uint8Array(MAX_PHOTO_UPLOAD_BYTES + 1), 'image/jpeg'));
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test('le blocage IP et la limite de photos évitent tout stockage', async () => {
  let calls = mockSupabase({ blocked: true });
  let response = await submitRequest(requestWithPhoto(await jpgWithExif()));
  assert.equal(response.status, 403);
  assert.equal(calls.length, 1);
  calls = mockSupabase({ count: PHOTO_REQUESTS_PER_HOUR });
  response = await submitRequest(requestWithPhoto(await jpgWithExif()));
  assert.equal(response.status, 429);
  assert.ok(!calls.some((call) => call.url.includes('/storage/')));
});

test('une erreur de stockage ou de base déclenche le nettoyage de la photo', async () => {
  for (const options of [{ uploadFails: true }, { insertFails: true }]) {
    const calls = mockSupabase(options);
    const response = await submitRequest(requestWithPhoto(await jpgWithExif()));
    assert.equal(response.status, 503);
    const upload = calls.find((call) => call.url.includes('/storage/v1/object/request-photos/') && call.method === 'POST');
    const cleanup = calls.find((call) => call.url.endsWith('/storage/v1/object/request-photos') && call.method === 'DELETE');
    assert.ok(upload); assert.ok(cleanup);
    const path = upload.url.split('/').pop();
    assert.deepEqual(JSON.parse(String(cleanup.body)), { prefixes: [path] });
  }
});

test.after(() => { process.env = originalEnv; globalThis.fetch = originalFetch; });
