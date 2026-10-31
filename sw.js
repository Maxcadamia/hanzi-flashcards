'use strict';
// Offline support for the Home Screen app. Files are served from the cache straight away and
// refreshed in the background, so an update shows up on the launch after it was published.
// Bump CACHE when the file list changes.

const CACHE = 'hanzi-flashcards-v1';
const SHELL = [
  './', 'index.html', 'style.css', 'pinyin.js', 'store.js', 'charts.js', 'app.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const fresh = caches.open(CACHE).then(cache => fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }));
  e.waitUntil(fresh.catch(() => {}));
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(cached => cached || fresh));
});
