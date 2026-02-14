const APP_CACHE = "gtl-app-shell-v1";
const STATIC_CACHE = "gtl-static-v1";
const CACHED_ROUTES = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(CACHED_ROUTES)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (isStaticAsset(url.pathname, request.destination)) {
    event.respondWith(handleStaticAsset(request));
  }
});

function isStaticAsset(pathname, destination) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    destination === "style" ||
    destination === "script" ||
    destination === "font" ||
    destination === "image"
  );
}

async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(APP_CACHE);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    const cachedPage = await caches.match(request);
    if (cachedPage) {
      return cachedPage;
    }
    const offlinePage = await caches.match("/offline");
    if (offlinePage) {
      return offlinePage;
    }
    return Response.error();
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const networkResponse = await fetch(request);
  const cache = await caches.open(STATIC_CACHE);
  cache.put(request, networkResponse.clone());
  return networkResponse;
}
