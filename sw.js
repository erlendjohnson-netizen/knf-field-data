/* Service worker: offline app shell + background upload (Chrome/Edge on Android and Windows). */
const VERSION = 'knf-v1.19.0';
const SHELL = ['./', './index.html', './schema.js', './core.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './vendor/qrcode.js', './vendor/jsQR.js', './vendor/la_parishes.js', './vendor/knf_districts.js'];
importScripts('./core.js');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // never cache Supabase traffic
  // network-first for the app files so updates arrive when online; cache when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then(ca => ca.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
async function bgSync() {
  let r = null;
  for (const m of ['live', 'test']) { CORE.setMode(m); try { const x = await CORE.sync(); if (m === 'live') r = x; } catch (e) { } }
  CORE.setMode('live');
  const cl = await self.clients.matchAll();
  cl.forEach(c => c.postMessage({ type: 'synced', result: r }));
}
self.addEventListener('sync', e => { if (e.tag === 'upload') e.waitUntil(bgSync()); });
self.addEventListener('periodicsync', e => { if (e.tag === 'upload') e.waitUntil(bgSync()); });
