// Bill Book service worker.
// - Keeps the app's static files on the phone so it opens fast.
// - Shows a friendly page when there is no internet.
// - Receives photos shared from WhatsApp / Gallery ("Share → Bill Book").
// Pages and data always come fresh from the network.
const STATIC_CACHE = "bill-book-static-v4";
const SHARE_CACHE = "bill-book-share";
const PRECACHE = ["/offline.html", "/logo.svg?v=2", "/icon-any-192.png?v=2"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Photos shared into the app are parked here; the Scan page picks them up.
async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll("photos").filter((f) => f && typeof f !== "string" && f.type.startsWith("image/"));
  const cache = await caches.open(SHARE_CACHE);
  for (const key of await cache.keys()) await cache.delete(key);
  await Promise.all(
    files.map((file, i) =>
      cache.put(`/shared/${i}`, new Response(file, { headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name || `bill-${i}.jpg`) } }))
    )
  );
  return Response.redirect(files.length ? "/scan?shared=1" : "/scan", 303);
}

const isStatic = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2)$/.test(url.pathname));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET") return;

  // Pages: network first, offline page when there is no connection.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  // Files under /_next/static never change, so cache-first is safe.
  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
  }
});
