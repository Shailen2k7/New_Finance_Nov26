/* Migrizo Finance service worker.
   Keeps the app shell files on the phone so it opens fast, and shows a friendly page when offline.
   Your financial data is never stored here: pages and data always come fresh from the server. */
const VERSION = "migrizo-v1";
const STATIC_CACHE = VERSION + "-static";
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/apple-touch-icon.png"];
const MAX_STATIC_ENTRIES = 250;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_STATIC_ENTRIES) await Promise.all(keys.slice(0, keys.length - MAX_STATIC_ENTRIES).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Build files have unique names, so a saved copy is always correct: serve it instantly.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).then(() => trim(cache));
        return res;
      }),
    );
    return;
  }

  // Pages: always from the network; only when there is no connection, show the offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
  // Everything else (live data, API calls) goes straight to the network.
});
