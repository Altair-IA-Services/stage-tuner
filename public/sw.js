// WeirdTune service worker — offline app-shell cache.
// Cache strategy:
//   - HTML navigations: network-first, fall back to cached index.
//   - Same-origin static assets (JS/CSS/fonts/images): stale-while-revalidate.

const CACHE = "weirdtune-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigation → network first, fallback to cache
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put("/", res.clone()).catch(() => undefined);
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Static assets → stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const networkPromise = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
          return res;
        })
        .catch(() => cached);
      return cached ?? (await networkPromise);
    })(),
  );
});
