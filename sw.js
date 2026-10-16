// Self-updating service worker. There is no version number to bump.
// App files (page, manifest): network first. Every launch with a connection gets the newest
// copy and refreshes the offline copy. The saved copy is used only when offline or the network is slow.
// Libraries, fonts and icons (icons, fonts, jspdf): cache first, re-checked in the background once a week.
const APP = 'soundpath-app', LIB = 'soundpath-lib', SLOW_MS = 4000, LIB_MAX_AGE = 7 * 24 * 3600 * 1000;
const APP_FILES = ['./', 'index.html', 'manifest.json'];
const LIB_FILES = ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'archivo-latin-wght.woff2',
  'jspdf.umd.min.js'];
const isLib = u => /\.(png|woff2|svg)$|\/jspdf\.umd\.min\.js$/.test(u.pathname);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const a = await caches.open(APP), l = await caches.open(LIB);
    // fresh copies of the app files; best effort for the rest so a failed big download never blocks install
    await Promise.all(APP_FILES.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && a.put(u, r)).catch(() => {})));
    await Promise.all(LIB_FILES.map(u => l.match(u).then(h => h || l.add(u)).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // reading values from photos was retired (first the old on-device reader, then the Tesseract offline reader):
    // free those files from phones that still have them. The Inter font option was retired too (Archivo is the only font). The PDF maker in vendor/ is kept.
    for (const n of [APP, LIB]) { const c = await caches.open(n); for (const k of await c.keys()) if (/\/(ocr\/|scan\.js|vendor\/tesseract\/|inter-latin-wght\.woff2)/.test(k.url)) await c.delete(k); }
  })().catch(() => {}).then(() => caches.keys())
    .then(keys => Promise.all(keys.filter(k => k !== APP && k !== LIB).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  e.respondWith(isLib(u) ? libFirst(r) : netFirst(r));
});

async function netFirst(r) {
  const c = await caches.open(APP);
  const hit = await c.match(r, { ignoreSearch: true });
  // no-cache = always ask the server, so a host that caches pages for minutes cannot hold back an update
  const net = fetch(r.mode === 'navigate' ? r.url : r, { cache: 'no-cache' }).then(res => {
    if (res.ok) c.put(r, res.clone());
    return res;
  });
  try {
    if (!hit) return await net;
    return await Promise.race([net, new Promise((_, rej) => setTimeout(rej, SLOW_MS))]);
  } catch (err) {
    net.catch(() => {}); // a slow reply still refreshes the saved copy for next time
    return hit || (r.mode === 'navigate' && (await c.match('index.html'))) || Response.error();
  }
}
async function libFirst(r) {
  const c = await caches.open(LIB), hit = await c.match(r);
  if (hit) {
    const d = Date.parse(hit.headers.get('date') || '');
    if (d && Date.now() - d > LIB_MAX_AGE) fetch(r, { cache: 'no-cache' }).then(res => res.ok && c.put(r, res)).catch(() => {});
    return hit;
  }
  try { const res = await fetch(r); if (res.ok) c.put(r, res.clone()); return res; } catch (e) { return Response.error(); }
}
