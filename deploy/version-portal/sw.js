// One-time cleanup for the legacy root-scoped Configurator PWA.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
    event.waitUntil(
        self.clients
            .claim()
            .then(() => self.registration.unregister())
            .then(() =>
                self.clients
                    .matchAll({ type: "window", includeUncontrolled: true })
                    .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url)))),
            ),
    );
});
