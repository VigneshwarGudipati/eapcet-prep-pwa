const CACHE_NAME = "eapcet-prep-v3";
const OFFLINE_URL = "./offline.html";

const HTML_PAGES = [
  "./",
  "./index.html",
  "./practice.html",
  "./mocktest.html",
  "./result.html",
  "./dashboard.html",
  OFFLINE_URL
];

const STATIC_ASSETS = [
  "./manifest.json",
  "./icons/icon.svg",
  "./css/styles.css",
  "./data/questions.js",
  "./js/app.js",
  "./js/analytics.js",
  "./js/quiz.js"
];

const CRITICAL_ASSETS = HTML_PAGES.concat(STATIC_ASSETS);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CRITICAL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (!isCacheableResponse(response)) {
        return response;
      }

      const responseClone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
      return response;
    })
    .catch(() =>
      caches.match(request)
        .then((cachedResponse) => cachedResponse || caches.match(OFFLINE_URL))
    );
}

function cacheFirst(request) {
  return caches.match(request).then((cachedResponse) => {
    if (cachedResponse) {
      return cachedResponse;
    }

    return fetch(request)
      .then((response) => {
        if (!isCacheableResponse(response)) {
          return response;
        }

        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      })
      .catch(() => caches.match(request).then((cachedResponse) => cachedResponse || offlineAssetResponse()));
  });
}

function isCacheableResponse(response) {
  return response && response.ok && response.status === 200;
}

function offlineAssetResponse() {
  return new Response("", {
    status: 503,
    statusText: "Offline"
  });
}
