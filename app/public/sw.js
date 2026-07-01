importScripts("/sw-push-cache.js");
importScripts("/sw-outbox-sync.js");

/**
 * Asset-only service worker — cache JS/CSS/font hashed Next.js + ikon PWA.
 * Tidak cache HTML, RSC, API, atau server actions.
 */
const CACHE_PREFIX = "spatial-pm-assets-";
const CACHE_VERSION = "v1";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

self.addEventListener("install", () => {
  /* Tanpa skipWaiting — update menunggu user muat ulang (toast). */
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function shouldBypass(request, url) {
  if (request.method !== "GET") return true;
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  if (request.headers.get("RSC") === "1") return true;
  if (request.headers.get("Next-Router-State-Tree")) return true;
  if (request.headers.get("Next-Router-Prefetch") === "1") return true;
  if (url.searchParams.has("_rsc")) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/auth/")) return true;
  return false;
}

function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (url.pathname === "/manifest.webmanifest") return true;
  if (/\.(woff2?|ttf|otf|eot)$/i.test(url.pathname)) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (shouldBypass(request, url)) return;
  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        try {
          await cache.put(request, response.clone());
        } catch {
          /* quota */
        }
      }
      return response;
    })
  );
});

/** Web Push (Fase B) — notifikasi OS saat app di-background / di-kill. */
self.addEventListener("push", (event) => {
  let payload = {
    title: "Spatial PM",
    body: "",
    url: "/",
    tag: "spatial-pm",
  };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    /* ignore */
  }

  event.waitUntil(
    (async () => {
      let cacheResult = { applied: false };
      try {
        if (typeof applyPushCacheHints === "function") {
          cacheResult = await applyPushCacheHints(payload);
        }
      } catch {
        /* quota / idb */
      }

      await self.registration.showNotification(payload.title, {
        body: payload.body || undefined,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: payload.tag || "spatial-pm",
        data: {
          url: payload.url || "/",
          pushCache: cacheResult.applied ? cacheResult : null,
        },
        silent: false,
        renotify: true,
      });

      if (cacheResult.applied) {
        const windowClients = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of windowClients) {
          if (!client.url.startsWith(self.location.origin)) continue;
          client.postMessage({
            type: "PUSH_CACHE_APPLIED",
            ...cacheResult,
          });
        }
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  const absolute = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (!client.url.startsWith(self.location.origin)) continue;
          client.postMessage({
            type: "NOTIFICATION_CLICK_NAVIGATE",
            url: targetUrl,
          });
          if ("focus" in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(absolute);
      })
  );
});
