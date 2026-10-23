/* Service worker: offline app shell + background upload (Chrome/Edge on Android and Windows). */
const VERSION = 'knf-v1.47.0';
const SHELL = ['./', './index.html', './schema.js', './core.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './vendor/qrcode.js', './vendor/jsQR.js', './vendor/la_parishes.js', './vendor/knf_districts.js'];
importScripts('./core.js');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'knf-imagery').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const IMG_HOSTS = ['imagery.nationalmap.gov', 'elevation.nationalmap.gov', 'basemap.nationalmap.gov'];
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // map imagery: saved pictures first (offline maps), otherwise fetch and keep it
  if (e.request.method === 'GET' && IMG_HOSTS.includes(u.hostname)) {
    e.respondWith(caches.open('knf-imagery').then(async c => {
      const hit = await c.match(e.request.url); if (hit) return hit;
      try { const r = await fetch(new Request(e.request.url, { mode: 'cors' })); if (r.ok && /^image\//.test(r.headers.get('content-type') || '')) c.put(e.request.url, r.clone()); return r; } // only real images are kept
      catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
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
