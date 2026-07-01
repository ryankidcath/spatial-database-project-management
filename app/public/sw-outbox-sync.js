/**
 * PR-I — Background Sync: minta client drain outbox offline (auth di tab).
 */
self.addEventListener("sync", (event) => {
  if (event.tag !== "spatial-pm-outbox") return;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (!client.url.startsWith(self.location.origin)) continue;
          client.postMessage({ type: "DRAIN_OFFLINE_OUTBOX" });
        }
      })
  );
});
