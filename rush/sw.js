// Dynasty Rush service worker: fast reloads and an installable app. Relative paths only, so it works under any
// folder (GitHub Pages: /legacy-league/rush/). Never registered inside the claude.ai artifact (ui/pwa.ts).
//   app shell (the page, assets/app.js, assets/app.css): network first, the cached copy after 2.5 s or offline
//   hashed chunks, icons, static media (images, music, sounds): cache first
//   game data (data/*.json): network first, the cache only when offline
//   everything else, and anything cross-origin (PeerJS, the claude.ai runtime, room traffic): never touched
const VERSION = 'rush-v1';
const SHELL = VERSION + '-shell', STATIC = VERSION + '-static', DATA = VERSION + '-data';
const BASE = new URL('./', self.location).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './assets/app.js', './assets/app.css', './manifest.webmanifest', './icons/icon-192.png'].map((p) => new URL(p, BASE).href))).catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/** What kind of request this is, or null to leave it alone. Exported shape mirrored by test/solid.test.ts. */
function kind(req) {
  if (req.method !== 'GET' || req.headers.has('range')) return null;
  const u = new URL(req.url);
  if (!u.href.startsWith(BASE)) return null;
  const p = u.href.slice(BASE.length).split(/[?#]/)[0];
  if (req.mode === 'navigate' || p === '' || p === 'index.html' || p === 'assets/app.js' || p === 'assets/app.css') return 'shell';
  if (/^data\/.+\.json$/.test(p)) return 'data';
  if (/^assets\//.test(p) || /^icons\//.test(p) || /^media\/.+\.(mp3|jpg|jpeg|png|webp|svg|woff2?)$/i.test(p)) return 'static';
  return null;
}

const put = (name, req, res) => { if (res && res.ok && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(name).then((c) => c.put(req, copy)).catch(() => undefined); } return res; };

async function networkFirst(name, req, wait) {
  const net = fetch(req).then((r) => put(name, req, r));
  if (!wait) return net.catch(async () => (await caches.match(req)) ?? Response.error());
  const late = new Promise((res) => setTimeout(res, wait)).then(() => caches.match(req));
  try {
    const first = await Promise.race([net, late]);
    return first ?? (await net);
  } catch { return (await caches.match(req)) ?? Response.error(); }
}
async function cacheFirst(req) {
  const hit = await caches.match(req);
  return hit ?? fetch(req).then((r) => put(STATIC, req, r));
}

self.addEventListener('fetch', (e) => {
  const k = kind(e.request);
  if (!k) return;
  if (k === 'shell') e.respondWith(networkFirst(SHELL, e.request, 2500));
  else if (k === 'data') e.respondWith(networkFirst(DATA, e.request, 0));
  else e.respondWith(cacheFirst(e.request));
});
