// Service worker : la coquille (page, calcul Japon, manifeste) est gardée en cache pour que
// l'appli s'ouvre sans réseau ; les données (Supabase, photos) ne sont jamais mises en cache.
// Réseau d'abord, cache en secours : une nouvelle version de la page arrive dès qu'il y a du réseau.
const CACHE = 'sd-radar-coquille-v6';
const COQUILLE = ['./', './index.html', './japon.html', './calcul.js', './manifest.json', './immo.html', './immo.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
