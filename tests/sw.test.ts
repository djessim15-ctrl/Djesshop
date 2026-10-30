import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('le service worker affiche le message générique et ouvre ou retrouve l’administration', async () => {
  const handlers = new Map<string, (event: any) => void>();
  const shown: { title: string; options: { body: string; icon: string; tag: string } }[] = [];
  const opened: string[] = [];
  let focused = 0;
  let existing = false;
  const self = {
    location: { origin: 'https://shop.example' },
    addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
    registration: { showNotification: async (title: string, options: { body: string; icon: string; tag: string }) => { shown.push({ title, options }); } },
    clients: {
      matchAll: async () => existing ? [{ url: 'https://shop.example/admin', focus: async () => { focused++; } }] : [],
      openWindow: async (url: string) => { opened.push(url); },
    },
  };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL });
  let waiting: Promise<void> = Promise.resolve();
  handlers.get('push')!({ data: { json: () => { throw new Error('bad JSON'); } }, waitUntil: (promise: Promise<void>) => { waiting = promise; } });
  await waiting;
  assert.match(shown[0].title, /Nouvelle demande/);
  assert.equal(shown[0].options.icon, '/icon-192.png');
  assert.match(shown[0].options.body, /administration/);
  let closed = false;
  handlers.get('notificationclick')!({ notification: { close: () => { closed = true; } }, waitUntil: (promise: Promise<void>) => { waiting = promise; } });
  await waiting;
  assert.equal(closed, true);
  assert.deepEqual(opened, ['https://shop.example/admin']);
  existing = true;
  handlers.get('notificationclick')!({ notification: { close: () => {} }, waitUntil: (promise: Promise<void>) => { waiting = promise; } });
  await waiting;
  assert.equal(focused, 1);
  assert.equal(opened.length, 1);
});
