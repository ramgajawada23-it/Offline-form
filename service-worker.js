

const CACHE_NAME = "offline-form-v4";

const FILES_TO_CACHE = [
    "/Offline-form/",
    "/Offline-form/index.html",
    "/Offline-form/styles.css",
    "/Offline-form/form.js",
    "/Offline-form/offline-db.js",
    "/Offline-form/BG2.jpeg",
    "/Offline-form/BG1.jpg",
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    if (event.request.mode === "navigate") {
        event.respondWith(
            caches.match("/Offline-form/index.html")
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(res => res || fetch(event.request))
    );
});
