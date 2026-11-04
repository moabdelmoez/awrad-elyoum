const PREFIX = "awrad-reader-";
const CACHE = PREFIX + "__CACHE_VERSION__";
const ASSETS = __ASSETS__;
const HOME = new URL("index.html", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map(
    (asset) => new Request(new URL(asset, self.registration.scope), { cache: "reload" }),
  ))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const url = new URL(request.url);
    const isHome = url.pathname === new URL(self.registration.scope).pathname ||
      url.pathname === new URL(HOME).pathname;
    const cached = await cache.match(request.mode === "navigate" && isHome ? HOME : request);
    return cached || fetch(request);
  })());
});
